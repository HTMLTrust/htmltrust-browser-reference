/**
 * Client for author, signing, directory, and voting operations against an
 * HTMLTrust server. Browser verification lives in @htmltrust/browser-client
 * and is called directly by the content script, keeping the server client out
 * of the verification dependency graph.
 *
 * The deprecated /api/content/verify endpoint is never called. The legacy
 * verifyContent() method remains as a fail-closed compatibility shim.
 */
import { Author, PublicKey, ContentSignature, Claim, ClaimMap, KeyReputation, ContentOccurrence, VoteType, BatchedVotesPayload, BatchVoteResult } from '../common/types';
import { ERROR_CODES, API_ENDPOINTS } from '../common/constants';
import { createError } from '../common/utils';
import { JsonHttpClient, JsonHttpError } from './json-http-client';
import {
  isAuthor,
  isAuthorListResponse,
  isBatchVoteResult,
  isClaim,
  isClaimListResponse,
  isContentSearchResponse,
  isContentSignature,
  isKeyReputation,
  isKeySearchResponse,
  isOccurrenceResponse,
  isReportResponse,
  isCreateAuthorResponse,
  isPublicKey,
} from './response-validation';

/**
 * Content Signing API client options
 */
export interface ContentSigningClientOptions {
  /** The base URL for the API */
  baseUrl: string;
  /** The timeout for API requests in milliseconds */
  timeout?: number;
}

type Pagination = { total: number; pages: number; page: number; limit: number };
type AuthorListResponse = { authors: Author[]; pagination: Pagination };
type ClaimListResponse = { claims: Claim[]; pagination: Pagination };
type KeySearchResponse = {
  keys: Array<PublicKey & { author: Author; trustScore: number }>;
  pagination: Pagination;
};
type ContentSearchResponse = {
  signatures: Array<ContentSignature & { author: Author; occurrences: number }>;
  pagination: Pagination;
};
type OccurrenceResponse = { occurrences: ContentOccurrence[]; pagination: Pagination };
type ReportResponse = {
  reportId: string;
  status: 'PENDING' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED';
};

/**
 * Content Signing API client
 */
export class ContentSigningClient {
  private client: JsonHttpClient;

  /**
   * Create a new Content Signing API client
   * @param options The client options
   */
  constructor(options: ContentSigningClientOptions) {
    this.client = new JsonHttpClient(options.baseUrl, options.timeout ?? 10_000);
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

    this.client.setHeader(headerName, apiKey);
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

    this.client.clearHeader(headerName);
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
      }, isCreateAuthorResponse);
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
  ): Promise<AuthorListResponse> {
    try {
      const params: Record<string, string | number> = {};
      if (name) params.name = name;
      if (keyType) params.keyType = keyType;
      if (page) params.page = page;
      if (limit) params.limit = limit;

      const response = await this.client.get(API_ENDPOINTS.AUTHORS, { params }, isAuthorListResponse);
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
      const response = await this.client.get(`${API_ENDPOINTS.AUTHORS}/${authorId}`, undefined, isAuthor);
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
      const response = await this.client.put(`${API_ENDPOINTS.AUTHORS}/${authorId}`, updates, isAuthor);
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
      const response = await this.client.get(`${API_ENDPOINTS.AUTHORS}/${authorId}/public-key`, undefined, isPublicKey);
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
    claims: ClaimMap
  ): Promise<ContentSignature> {
    try {
      const response = await this.client.post(API_ENDPOINTS.CONTENT_SIGN, {
        contentHash,
        domain,
        claims
      }, isContentSignature);
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
   * indicating that callers should use @htmltrust/browser-client directly.
   *
   * @returns Always { valid: false } with a descriptive reason.
   */
  async verifyContent(
    _contentHash: string,
    _domain: string,
    _authorId: string,
    _signature: string
  ): Promise<{ valid: boolean; author?: Author; claims?: ClaimMap; reason?: string }> {
    // Intentionally do not contact the server. The deprecated endpoint
    // returned { valid, author, claims }; we surface a clear failure so
    // legacy code paths fail loudly rather than silently regressing trust.
    return {
      valid: false,
      reason:
        'verifyContent() is deprecated; use @htmltrust/browser-client verifySignedSection for spec §3.1 local verification',
    };
  }

  /**
   * List claim types
   */
  async listClaimTypes(
    page?: number,
    limit?: number
  ): Promise<ClaimListResponse> {
    try {
      const params: Record<string, string | number> = {};
      if (page) params.page = page;
      if (limit) params.limit = limit;

      const response = await this.client.get(API_ENDPOINTS.CLAIMS, { params }, isClaimListResponse);
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
      const response = await this.client.get(`${API_ENDPOINTS.CLAIMS}/${claimId}`, undefined, isClaim);
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
  }): Promise<KeySearchResponse> {
    try {
      const response = await this.client.get(API_ENDPOINTS.DIRECTORY_KEYS, { params }, isKeySearchResponse);
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
      const response = await this.client.get(`${API_ENDPOINTS.DIRECTORY_KEYS}/${keyId}/reputation`, undefined, isKeyReputation);
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
  ): Promise<ReportResponse> {
    try {
      const response = await this.client.post(`${API_ENDPOINTS.DIRECTORY_KEYS}/${keyId}/report`, {
        reason,
        details,
        evidence
      }, isReportResponse);
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
  }): Promise<ContentSearchResponse> {
    try {
      const response = await this.client.get(API_ENDPOINTS.DIRECTORY_CONTENT, { params }, isContentSearchResponse);
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
  ): Promise<OccurrenceResponse> {
    try {
      const params: Record<string, string | number> = {};
      if (page) params.page = page;
      if (limit) params.limit = limit;

      const response = await this.client.get(`${API_ENDPOINTS.DIRECTORY_CONTENT}/${contentHash}/occurrences`, { params }, isOccurrenceResponse);
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
  ): Promise<ReportResponse> {
    try {
      const response = await this.client.post(`${API_ENDPOINTS.DIRECTORY_CONTENT}/report`, {
        contentHash,
        sourceUrl,
        targetUrl,
        reason
      }, isReportResponse);
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
      }, isBatchVoteResult);
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
  private handleApiError(error: unknown, defaultMessage: string): never {
    if (error instanceof JsonHttpError) {
      const status = error.status;
      const message = error.message || defaultMessage;

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
