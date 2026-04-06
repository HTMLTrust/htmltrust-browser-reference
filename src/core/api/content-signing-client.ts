/**
 * Content Signing API client
 */
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
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
}

/**
 * Content Signing API client
 */
export class ContentSigningClient {
  private client: AxiosInstance;
  private baseUrl: string;

  /**
   * Create a new Content Signing API client
   * @param options The client options
   */
  constructor(options: ContentSigningClientOptions) {
    this.baseUrl = options.baseUrl;
    
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
   * @param name Optional filter by author name
   * @param keyType Optional filter by key type
   * @param page Optional page number
   * @param limit Optional number of items per page
   * @returns A promise that resolves with a list of authors and pagination info
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
   * @param authorId The ID of the author
   * @returns A promise that resolves with the author details
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
   * @param authorId The ID of the author
   * @param updates The updates to apply
   * @returns A promise that resolves with the updated author
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
   * @param authorId The ID of the author
   * @returns A promise that resolves when the author is deleted
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
   * @param authorId The ID of the author
   * @returns A promise that resolves with the author's public key
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
   * Sign content
   * @param contentHash The hash of the normalized content
   * @param domain The domain associated with the content
   * @param claims Claims about the content
   * @returns A promise that resolves with the content signature
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
   * Verify content signature
   * @param contentHash The hash of the normalized content
   * @param domain The domain associated with the content
   * @param authorId The ID of the author who signed the content
   * @param signature The cryptographic signature to verify
   * @returns A promise that resolves with the verification result
   */
  async verifyContent(
    contentHash: string,
    domain: string,
    authorId: string,
    signature: string
  ): Promise<{ valid: boolean; author?: Author; claims?: Record<string, any> }> {
    try {
      const response = await this.client.post(API_ENDPOINTS.CONTENT_VERIFY, {
        contentHash,
        domain,
        authorId,
        signature
      });
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, 'Failed to verify content');
    }
  }

  /**
   * List claim types
   * @param page Optional page number
   * @param limit Optional number of items per page
   * @returns A promise that resolves with a list of claim types and pagination info
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
   * @param claimId The ID of the claim type
   * @returns A promise that resolves with the claim type details
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
   * @param params Search parameters
   * @returns A promise that resolves with a list of public keys and pagination info
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
   * @param keyId The ID of the public key
   * @returns A promise that resolves with the key reputation
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
   * @param keyId The ID of the public key
   * @param reason The reason for reporting
   * @param details Optional additional details
   * @param evidence Optional URL to evidence
   * @returns A promise that resolves with the report status
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
   * @param params Search parameters
   * @returns A promise that resolves with a list of content signatures and pagination info
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
   * @param contentHash The hash of the content
   * @param page Optional page number
   * @param limit Optional number of items per page
   * @returns A promise that resolves with a list of content occurrences and pagination info
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
   * @param contentHash The hash of the content being reported
   * @param sourceUrl The original source URL of the content
   * @param targetUrl The URL where the content is being misused
   * @param reason The reason for reporting
   * @returns A promise that resolves with the report status
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
   * @param votes A map of author IDs to vote types
   * @returns A promise that resolves with the batch vote result
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
   * @param authorId The ID of the author to vote on
   * @param vote The type of vote to cast
   * @returns A promise that resolves when the vote is submitted
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
   * @param error The error to handle
   * @param defaultMessage The default error message
   * @returns A standardized error object
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