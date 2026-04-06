/**
 * Trust Directory API client
 */
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { TrustDirectoryEntry, User, VerificationResult } from '../common/types';
import { ERROR_CODES } from '../common/constants';
import { createError } from '../common/utils';

/**
 * Trust Directory API client options
 */
export interface TrustDirectoryClientOptions {
  /** The base URL for the API */
  baseUrl: string;
  /** The timeout for API requests in milliseconds */
  timeout?: number;
  /** The API key for authentication */
  apiKey?: string;
}

/**
 * Trust Directory API client
 */
export class TrustDirectoryClient {
  private client: AxiosInstance;
  private baseUrl: string;

  /**
   * Create a new Trust Directory API client
   * @param options The client options
   */
  constructor(options: TrustDirectoryClientOptions) {
    this.baseUrl = options.baseUrl;
    
    const config: AxiosRequestConfig = {
      baseURL: options.baseUrl,
      timeout: options.timeout || 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (options.apiKey) {
      config.headers = {
        ...config.headers,
        'Authorization': `Bearer ${options.apiKey}`,
      };
    }

    this.client = axios.create(config);
  }

  /**
   * Get all entries in the trust directory
   * @returns A promise that resolves with an array of trust directory entries
   */
  async getAllEntries(): Promise<TrustDirectoryEntry[]> {
    try {
      const response = await this.client.get('/api/v1/trust-directory');
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, 'Failed to get trust directory entries');
    }
  }

  /**
   * Get a trust directory entry by ID
   * @param id The ID of the entry to get
   * @returns A promise that resolves with the trust directory entry
   */
  async getEntryById(id: string): Promise<TrustDirectoryEntry> {
    try {
      const response = await this.client.get(`/api/v1/trust-directory/${id}`);
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, `Failed to get trust directory entry with ID ${id}`);
    }
  }

  /**
   * Get trust directory entries for a domain
   * @param domain The domain to get entries for
   * @returns A promise that resolves with an array of trust directory entries
   */
  async getEntriesByDomain(domain: string): Promise<TrustDirectoryEntry[]> {
    try {
      const response = await this.client.get(`/api/v1/trust-directory/domain/${domain}`);
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, `Failed to get trust directory entries for domain ${domain}`);
    }
  }

  /**
   * Get trust directory entries for a user
   * @param userId The ID of the user to get entries for
   * @returns A promise that resolves with an array of trust directory entries
   */
  async getEntriesByUser(userId: string): Promise<TrustDirectoryEntry[]> {
    try {
      const response = await this.client.get(`/api/v1/trust-directory/user/${userId}`);
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, `Failed to get trust directory entries for user ${userId}`);
    }
  }

  /**
   * Create a new trust directory entry
   * @param entry The entry to create
   * @returns A promise that resolves with the created entry
   */
  async createEntry(entry: Omit<TrustDirectoryEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<TrustDirectoryEntry> {
    try {
      const response = await this.client.post('/api/v1/trust-directory', entry);
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, 'Failed to create trust directory entry');
    }
  }

  /**
   * Update a trust directory entry
   * @param id The ID of the entry to update
   * @param entry The updated entry data
   * @returns A promise that resolves with the updated entry
   */
  async updateEntry(id: string, entry: Partial<TrustDirectoryEntry>): Promise<TrustDirectoryEntry> {
    try {
      const response = await this.client.put(`/api/v1/trust-directory/${id}`, entry);
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, `Failed to update trust directory entry with ID ${id}`);
    }
  }

  /**
   * Delete a trust directory entry
   * @param id The ID of the entry to delete
   * @returns A promise that resolves when the entry is deleted
   */
  async deleteEntry(id: string): Promise<void> {
    try {
      await this.client.delete(`/api/v1/trust-directory/${id}`);
    } catch (error) {
      throw this.handleApiError(error, `Failed to delete trust directory entry with ID ${id}`);
    }
  }

  /**
   * Verify a signature against the trust directory
   * @param domain The domain the content is from
   * @param contentHash The hash of the content
   * @param signature The signature to verify
   * @param publicKey The public key that signed the content
   * @returns A promise that resolves with the verification result
   */
  async verifySignature(
    domain: string,
    contentHash: string,
    signature: string,
    publicKey: string
  ): Promise<VerificationResult> {
    try {
      const response = await this.client.post('/api/v1/verify', {
        domain,
        contentHash,
        signature,
        publicKey,
      });
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, 'Failed to verify signature');
    }
  }

  /**
   * Get a user by ID
   * @param id The ID of the user to get
   * @returns A promise that resolves with the user
   */
  async getUserById(id: string): Promise<User> {
    try {
      const response = await this.client.get(`/api/v1/users/${id}`);
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, `Failed to get user with ID ${id}`);
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