/**
 * Content Signing API client.
 *
 * Layered into two responsibilities:
 *
 *   1. Local cryptographic verification of signed-section content. This is
 *      the spec-aligned (§3.1) path: the extension verifies signatures
 *      itself via @htmltrust/browser-client, which uses SubtleCrypto and a
 *      pluggable resolver chain (did:web → direct URL → trust directories)
 *      to fetch keys. NO trust server is contacted for verification.
 *
 *   2. Author/key/content management operations against a trust server.
 *      These are the admin/author-side flows (creating authors, signing
 *      content via remote authorities, voting). These remain server-backed
 *      because they require server-held secrets (author API keys) and
 *      mutate server state.
 *
 * The deprecated /api/content/verify endpoint is no longer called. Callers
 * who previously invoked verifyContent() should call verifySignedSectionLocal()
 * (or use the lib directly) instead. verifyContent() is preserved as a thin
 * compatibility wrapper that delegates to the local verifier when given a
 * signed-section element/HTML, and otherwise returns a "verification requires
 * the signed-section element, not a server lookup" failure result.
 */
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import {
  verifySignedSection,
  defaultResolverChain,
  type VerifyResult,
} from '@htmltrust/browser-client';
import type { KeyResolver } from '@htmltrust/browser-client';
import { Author, PublicKey, ContentSignature, Claim, KeyReputation, ContentOccurrence, ServerConfig, VoteType, BatchedVotesPayload, BatchVoteResult } from '../common/types';
import { ERROR_CODES, API_ENDPOINTS } from '../common/constants';
import { createError } from '../common/utils';

/**
 * Content Signing API client options
 */
export interface ContentSigningClientOptions {
  /** The base URL for the API */
  baseUrl: string;
  /** The timeout for API requests in milliseconds */
  timeout?: number;
  /**
   * Trust directory base URLs to use as a fallback in the resolver chain.
   * The default chain (did:web → direct URL) handles most keyids; directories
   * are only consulted for keyids that match neither of the first two shapes.
   */
  trustDirectories?: string[];
}

/**
 * Local verification options. Mirrors the lib's VerifyOptions shape but with
 * defaults filled in from the client's configured trust directories.
 */
export interface LocalVerifyOptions {
  /** The signed-section element or its outerHTML. */
  section: Element | string;
  /** Domain to bind the signature to. Defaults to window.location.hostname. */
  domain?: string;
  /** Optional override of the resolver chain (overrides client-configured directories). */
  keyResolvers?: KeyResolver[];
  /**
   * Optional override of the SHA-256 implementation. Used by environments where
   * SubtleCrypto is unavailable (plain HTTP test pages); production browsers
   * should always have SubtleCrypto on a secure context.
   */
  hash?: (canonical: string) => Promise<string>;
}

/**
 * Content Signing API client
 */
export class ContentSigningClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private trustDirectories: string[];
  private resolverChain: KeyResolver[];

  /**
   * Create a new Content Signing API client
   * @param options The client options
   */
  constructor(options: ContentSigningClientOptions) {
    this.baseUrl = options.baseUrl;
    this.trustDirectories = options.trustDirectories ?? [];
    // Build the resolver chain once. did:web and directUrl are always present;
    // trust directories are appended only when configured (they're a network
    // lookup of last resort).
    this.resolverChain = defaultResolverChain({ directories: this.trustDirectories });

    const config: AxiosRequestConfig = {
      baseURL: options.baseUrl,
      timeout: options.timeout || 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    this.client = axios.create(config);
  }

  /**
   * Update the trust directory list and rebuild the resolver chain.
   * Called when the user edits the directory list in extension settings.
   */
  setTrustDirectories(directories: string[]): void {
    this.trustDirectories = directories;
    this.resolverChain = defaultResolverChain({ directories });
  }

  /** Get the configured resolver chain (for callers that want to reuse it). */
  getResolverChain(): KeyResolver[] {
    return this.resolverChain;
  }

  /**
   * Set the API key for authenticated requests
   * @param apiKey The API key to use
   * @param keyType The type of API key (author, general, admin)
   */
  setApiKey(apiKey: string, keyType: 'author' | 'general' | 'admin'): void {
    const headerName = keyType === 'author'
      ? 'X-AUTHOR-API-KEY'
      : keyType === 'admin'
        ? 'X-ADMIN-API-KEY'
        : 'X-API-KEY';

    this.client.defaults.headers.common[headerName] = apiKey;
  }

  /**
   * Clear the API key for authenticated requests
   * @param keyType The type of API key to clear (author, general, admin)
   */
  clearApiKey(keyType: 'author' | 'general' | 'admin'): void {
    const headerName = keyType === 'author'
      ? 'X-AUTHOR-API-KEY'
      : keyType === 'admin'
        ? 'X-ADMIN-API-KEY'
        : 'X-API-KEY';

    delete this.client.defaults.headers.common[headerName];
  }

  /**
   * Locally verify a signed-section element using @htmltrust/browser-client.
   *
   * This is the spec §3.1 path: the browser does its own crypto verification
   * via SubtleCrypto, with key resolution handled by the configured resolver
   * chain. No trust server is contacted for verification.
   */
  async verifySignedSectionLocal(opts: LocalVerifyOptions): Promise<VerifyResult> {
    return verifySignedSection(opts.section, {
      keyResolvers: opts.keyResolvers ?? this.resolverChain,
      domain: opts.domain,
      hash: opts.hash,
    });
  }

  /**
   * Create a new author and key pair
   * @param name The name of the author
   * @param keyType The type of the author key
   * @param description Optional description of the author
   * @param url Optional URL associated with the author
   * @param keyAlgorithm Optional cryptographic algorithm to use
   * @returns A promise that resolves with the created author and API key
   */
  async createAuthor(
    name: string,
    keyType: 'HUMAN' | 'AI' | 'HUMAN_AI_MIX' | 'ORGANIZATION',
    description?: string,
    url?: string,
    keyAlgorithm?: 'RSA' | 'ECDSA' | 'ED25519'
  ): Promise<{ author: Author; authorApiKey: string }> {
    try {
      const response = await this.client.post(API_ENDPOINTS.AUTHORS, {
        name,
        keyType,
        description,
        url,
        keyAlgorithm
      });
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, 'Failed to create author');
    }
  }

  /**
   * Get a list of authors
   */
  async listAuthors(
    name?: string,
    keyType?: 'HUMAN' | 'AI' | 'HUMAN_AI_MIX' | 'ORGANIZATION',
    page?: number,
    limit?: number
  ): Promise<{ authors: Author[]; pagination: { total: number; pages: number; page: number; limit: number } }> {
    try {
      const params: Record<string, any> = {};
      if (name) params.name = name;
      if (keyType) params.keyType = keyType;
      if (page) params.page = page;
      if (limit) params.limit = limit;

      const response = await this.client.get(API_ENDPOINTS.AUTHORS, { params });
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, 'Failed to list authors');
    }
  }

  /**
   * Get author details
   */
  async getAuthor(authorId: string): Promise<Author> {
    try {
      const response = await this.client.get(`${API_ENDPOINTS.AUTHORS}/${authorId}`);
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, `Failed to get author with ID ${authorId}`);
    }
  }

  /**
   * Update author details
   */
  async updateAuthor(
    authorId: string,
    updates: { name?: string; description?: string; url?: string }
  ): Promise<Author> {
    try {
      const response = await this.client.put(`${API_ENDPOINTS.AUTHORS}/${authorId}`, updates);
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, `Failed to update author with ID ${authorId}`);
    }
  }

  /**
   * Delete an author
   */
  async deleteAuthor(authorId: string): Promise<void> {
    try {
      await this.client.delete(`${API_ENDPOINTS.AUTHORS}/${authorId}`);
    } catch (error) {
      throw this.handleApiError(error, `Failed to delete author with ID ${authorId}`);
    }
  }

  /**
   * Get an author's public key
   *
   * NOTE: this is server-side admin lookup; for verification, prefer the
   * resolver chain (which handles did:web, direct URL, and trust directories).
   */
  async getAuthorPublicKey(authorId: string): Promise<PublicKey> {
    try {
      const response = await this.client.get(`${API_ENDPOINTS.AUTHORS}/${authorId}/public-key`);
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, `Failed to get public key for author with ID ${authorId}`);
    }
  }

  /**
   * Sign content (server-mediated, requires author API key).
   */
  async signContent(
    contentHash: string,
    domain: string,
    claims: Record<string, any>
  ): Promise<ContentSignature> {
    try {
      const response = await this.client.post(API_ENDPOINTS.CONTENT_SIGN, {
        contentHash,
        domain,
        claims
      });
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, 'Failed to sign content');
    }
  }

  /**
   * Verify content signature.
   *
   * @deprecated The trust server's POST /api/content/verify endpoint has been
   * removed; verification is now performed locally per spec §3.1. This method
   * is retained as a back-compat shim that returns a structured failure result
   * indicating that callers should use verifySignedSectionLocal() instead. The
   * background script has been migrated to call verifySignedSectionLocal()
   * directly with the page's signed-section element.
   *
   * @returns Always { valid: false } with a descriptive reason.
   */
  async verifyContent(
    _contentHash: string,
    _domain: string,
    _authorId: string,
    _signature: string
  ): Promise<{ valid: boolean; author?: Author; claims?: Record<string, any>; reason?: string }> {
    // Intentionally do not contact the server. The deprecated endpoint
    // returned { valid, author, claims }; we surface a clear failure so
    // legacy code paths fail loudly rather than silently regressing trust.
    return {
      valid: false,
      reason:
        'verifyContent() is deprecated; use verifySignedSectionLocal() (or @htmltrust/browser-client verifySignedSection) for spec §3.1 local verification',
    };
  }

  /**
   * List claim types
   */
  async listClaimTypes(
    page?: number,
    limit?: number
  ): Promise<{ claims: Claim[]; pagination: { total: number; pages: number; page: number; limit: number } }> {
    try {
      const params: Record<string, any> = {};
      if (page) params.page = page;
      if (limit) params.limit = limit;

      const response = await this.client.get(API_ENDPOINTS.CLAIMS, { params });
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, 'Failed to list claim types');
    }
  }

  /**
   * Get claim type details
   */
  async getClaimType(claimId: string): Promise<Claim> {
    try {
      const response = await this.client.get(`${API_ENDPOINTS.CLAIMS}/${claimId}`);
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, `Failed to get claim type with ID ${claimId}`);
    }
  }

  /**
   * Search public keys
   */
  async searchPublicKeys(params: {
    authorName?: string;
    keyType?: 'HUMAN' | 'AI' | 'HUMAN_AI_MIX' | 'ORGANIZATION';
    domain?: string;
    minTrustScore?: number;
    page?: number;
    limit?: number;
  }): Promise<{
    keys: Array<PublicKey & { author: Author; trustScore: number }>;
    pagination: { total: number; pages: number; page: number; limit: number }
  }> {
    try {
      const response = await this.client.get(API_ENDPOINTS.DIRECTORY_KEYS, { params });
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, 'Failed to search public keys');
    }
  }

  /**
   * Get key reputation
   */
  async getKeyReputation(keyId: string): Promise<KeyReputation> {
    try {
      const response = await this.client.get(`${API_ENDPOINTS.DIRECTORY_KEYS}/${keyId}/reputation`);
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, `Failed to get reputation for key with ID ${keyId}`);
    }
  }

  /**
   * Report a key
   */
  async reportKey(
    keyId: string,
    reason: 'IMPERSONATION' | 'MISINFORMATION' | 'SPAM' | 'OTHER',
    details?: string,
    evidence?: string
  ): Promise<{ reportId: string; status: 'PENDING' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED' }> {
    try {
      const response = await this.client.post(`${API_ENDPOINTS.DIRECTORY_KEYS}/${keyId}/report`, {
        reason,
        details,
        evidence
      });
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, `Failed to report key with ID ${keyId}`);
    }
  }

  /**
   * Search signed content
   */
  async searchSignedContent(params: {
    contentHash?: string;
    authorId?: string;
    domain?: string;
    claim?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    signatures: Array<ContentSignature & { author: Author; occurrences: number }>;
    pagination: { total: number; pages: number; page: number; limit: number }
  }> {
    try {
      const response = await this.client.get(API_ENDPOINTS.DIRECTORY_CONTENT, { params });
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, 'Failed to search signed content');
    }
  }

  /**
   * Find content occurrences
   */
  async findContentOccurrences(
    contentHash: string,
    page?: number,
    limit?: number
  ): Promise<{
    occurrences: ContentOccurrence[];
    pagination: { total: number; pages: number; page: number; limit: number }
  }> {
    try {
      const params: Record<string, any> = {};
      if (page) params.page = page;
      if (limit) params.limit = limit;

      const response = await this.client.get(`${API_ENDPOINTS.DIRECTORY_CONTENT}/${contentHash}/occurrences`, { params });
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, `Failed to find occurrences for content hash ${contentHash}`);
    }
  }

  /**
   * Report content misuse
   */
  async reportContentMisuse(
    contentHash: string,
    sourceUrl: string,
    targetUrl: string,
    reason: 'COPYRIGHT_VIOLATION' | 'UNAUTHORIZED_USE' | 'IMPERSONATION' | 'OTHER'
  ): Promise<{ reportId: string; status: 'PENDING' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED' }> {
    try {
      const response = await this.client.post(`${API_ENDPOINTS.DIRECTORY_CONTENT}/report`, {
        contentHash,
        sourceUrl,
        targetUrl,
        reason
      });
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, 'Failed to report content misuse');
    }
  }

  /**
   * Submit a batch of author votes
   */
  async submitBatchedVotes(votes: BatchedVotesPayload): Promise<BatchVoteResult> {
    try {
      const response = await this.client.post(API_ENDPOINTS.VOTES_BATCH, {
        votes
      });
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, 'Failed to submit votes');
    }
  }

  /**
   * Submit a vote for a specific author
   * @deprecated Use submitBatchedVotes instead
   */
  async submitAuthorVote(authorId: string, vote: VoteType): Promise<void> {
    try {
      await this.client.post(`${API_ENDPOINTS.AUTHORS}/${authorId}/vote`, {
        vote
      });
    } catch (error) {
      throw this.handleApiError(error, `Failed to submit vote for author ${authorId}`);
    }
  }

  /**
   * Handle API errors
   */
  private handleApiError(error: any, defaultMessage: string): never {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message || defaultMessage;

      if (status === 401 || status === 403) {
        throw createError(ERROR_CODES.AUTH_ERROR, message, error);
      } else if (status === 400) {
        throw createError(ERROR_CODES.VALIDATION_ERROR, message, error);
      } else if (status && status >= 500) {
        throw createError(ERROR_CODES.NETWORK_ERROR, message, error);
      }
    }

    throw createError(ERROR_CODES.UNKNOWN_ERROR, defaultMessage, error);
  }
}
