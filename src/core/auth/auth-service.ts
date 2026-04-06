/**
 * Authentication service for the Content Signing extension
 */
import { ContentSigningClient } from '../api/content-signing-client';
import { Author, ServerConfig, Settings } from '../common/types';
import { StorageInterface } from '../storage/storage-interface';
import { STORAGE_KEYS, ERROR_CODES, DEFAULT_SETTINGS, AUTHOR_KEY_TYPES } from '../common/constants';
import { createError } from '../common/utils';

/**
 * Authentication service options
 */
export interface AuthServiceOptions {
  /** The storage interface to use */
  storage: StorageInterface;
}

/**
 * Authentication service for the Content Signing extension
 */
export class AuthService {
  private storage: StorageInterface;
  private contentSigningClient: ContentSigningClient | null = null;
  private currentAuthor: Author | null = null;
  private settings: Settings = DEFAULT_SETTINGS;
  private activeServerConfig: ServerConfig | null = null;

  /**
   * Create a new authentication service
   * @param options The service options
   */
  constructor(options: AuthServiceOptions) {
    this.storage = options.storage;
  }

  /**
   * Initialize the authentication service
   * @returns A promise that resolves when initialization is complete
   */
  async initialize(): Promise<void> {
    // Load settings
    const storedSettings = await this.storage.get<Settings>(STORAGE_KEYS.SETTINGS);
    this.settings = storedSettings || DEFAULT_SETTINGS;

    // Find the active server configuration
    this.activeServerConfig = this.settings.serverConfigs.find(
      config => config.id === this.settings.activeServerId
    ) || this.settings.serverConfigs.find(config => config.isActive) || null;

    // Initialize the API client if we have an active server
    if (this.activeServerConfig) {
      this.contentSigningClient = new ContentSigningClient({
        baseUrl: this.activeServerConfig.url
      });

      // Set the API key if available
      if (this.activeServerConfig.authorApiKey) {
        this.contentSigningClient.setApiKey(this.activeServerConfig.authorApiKey, 'author');
      }

      // Try to load author details if we have an authorId
      if (this.activeServerConfig.authorId && this.contentSigningClient) {
        try {
          this.currentAuthor = await this.contentSigningClient.getAuthor(this.activeServerConfig.authorId);
        } catch (error) {
          console.error('Failed to load author details:', error);
          // Don't throw here, just continue with null author
        }
      }
    }
  }

  /**
   * Create a new author
   * @param name The name of the author
   * @param keyType The type of the author key
   * @param description Optional description of the author
   * @param url Optional URL associated with the author
   * @returns A promise that resolves with the created author
   */
  async createAuthor(
    name: string,
    keyType: 'HUMAN' | 'AI' | 'HUMAN_AI_MIX' | 'ORGANIZATION' = AUTHOR_KEY_TYPES.HUMAN,
    description?: string,
    url?: string
  ): Promise<Author> {
    try {
      if (!this.activeServerConfig) {
        throw createError(
          ERROR_CODES.AUTH_ERROR,
          'No active server configuration found'
        );
      }

      if (!this.contentSigningClient) {
        this.contentSigningClient = new ContentSigningClient({
          baseUrl: this.activeServerConfig.url
        });
      }

      // Create the author
      const result = await this.contentSigningClient.createAuthor(
        name,
        keyType,
        description,
        url
      );

      // Store the author and API key
      this.currentAuthor = result.author;

      // Update the active server config with the new author ID and API key
      const updatedServerConfig: ServerConfig = {
        ...this.activeServerConfig,
        authorId: result.author.id,
        authorApiKey: result.authorApiKey
      };

      // Update the settings with the new server config
      const updatedServerConfigs = this.settings.serverConfigs.map(config =>
        config.id === updatedServerConfig.id ? updatedServerConfig : config
      );

      const updatedSettings: Settings = {
        ...this.settings,
        serverConfigs: updatedServerConfigs
      };

      // Save the updated settings
      await this.storage.set(STORAGE_KEYS.SETTINGS, updatedSettings);
      this.settings = updatedSettings;
      this.activeServerConfig = updatedServerConfig;

      // Set the API key in the client
      this.contentSigningClient.setApiKey(result.authorApiKey, 'author');

      return result.author;
    } catch (error) {
      throw createError(
        ERROR_CODES.AUTH_ERROR,
        `Author creation failed: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * Associate an existing API key with the active server
   * @param authorId The ID of the author
   * @param apiKey The API key to associate
   * @returns A promise that resolves with the author details
   */
  async associateApiKey(authorId: string, apiKey: string): Promise<Author> {
    try {
      if (!this.activeServerConfig) {
        throw createError(
          ERROR_CODES.AUTH_ERROR,
          'No active server configuration found'
        );
      }

      // Initialize the client with the new API key
      this.contentSigningClient = new ContentSigningClient({
        baseUrl: this.activeServerConfig.url
      });
      this.contentSigningClient.setApiKey(apiKey, 'author');

      // Verify the API key by fetching the author details
      const author = await this.contentSigningClient.getAuthor(authorId);
      this.currentAuthor = author;

      // Update the active server config with the author ID and API key
      const updatedServerConfig: ServerConfig = {
        ...this.activeServerConfig,
        authorId: author.id,
        authorApiKey: apiKey
      };

      // Update the settings with the new server config
      const updatedServerConfigs = this.settings.serverConfigs.map(config =>
        config.id === updatedServerConfig.id ? updatedServerConfig : config
      );

      const updatedSettings: Settings = {
        ...this.settings,
        serverConfigs: updatedServerConfigs
      };

      // Save the updated settings
      await this.storage.set(STORAGE_KEYS.SETTINGS, updatedSettings);
      this.settings = updatedSettings;
      this.activeServerConfig = updatedServerConfig;

      return author;
    } catch (error) {
      throw createError(
        ERROR_CODES.AUTH_ERROR,
        `API key association failed: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * Set the active server configuration
   * @param serverId The ID of the server configuration to set as active
   * @returns A promise that resolves when the active server is set
   */
  async setActiveServer(serverId: string): Promise<void> {
    try {
      const serverConfig = this.settings.serverConfigs.find(config => config.id === serverId);
      if (!serverConfig) {
        throw createError(
          ERROR_CODES.VALIDATION_ERROR,
          `Server configuration with ID ${serverId} not found`
        );
      }

      // Update the settings with the new active server
      const updatedSettings: Settings = {
        ...this.settings,
        activeServerId: serverId,
        serverConfigs: this.settings.serverConfigs.map(config => ({
          ...config,
          isActive: config.id === serverId
        }))
      };

      // Save the updated settings
      await this.storage.set(STORAGE_KEYS.SETTINGS, updatedSettings);
      this.settings = updatedSettings;
      this.activeServerConfig = serverConfig;

      // Reinitialize the client with the new server
      this.contentSigningClient = new ContentSigningClient({
        baseUrl: serverConfig.url
      });

      // Set the API key if available
      if (serverConfig.authorApiKey) {
        this.contentSigningClient.setApiKey(serverConfig.authorApiKey, 'author');
      }

      // Try to load author details if we have an authorId
      if (serverConfig.authorId && this.contentSigningClient) {
        try {
          this.currentAuthor = await this.contentSigningClient.getAuthor(serverConfig.authorId);
        } catch (error) {
          console.error('Failed to load author details:', error);
          this.currentAuthor = null;
        }
      } else {
        this.currentAuthor = null;
      }
    } catch (error) {
      throw createError(
        ERROR_CODES.STORAGE_ERROR,
        `Failed to set active server: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * Add a new server configuration
   * @param name The name of the server
   * @param url The URL of the server
   * @param setAsActive Whether to set this server as active
   * @returns A promise that resolves with the ID of the new server configuration
   */
  async addServerConfig(name: string, url: string, setAsActive = false): Promise<string> {
    try {
      // Generate a unique ID
      const id = `server_${Date.now()}`;

      // Create the new server config
      const newServerConfig: ServerConfig = {
        id,
        name,
        url,
        isActive: setAsActive
      };

      // Update the settings with the new server config
      const updatedServerConfigs = [...this.settings.serverConfigs];
      
      // If setting as active, update all other configs
      if (setAsActive) {
        for (const config of updatedServerConfigs) {
          config.isActive = false;
        }
      }
      
      updatedServerConfigs.push(newServerConfig);

      const updatedSettings: Settings = {
        ...this.settings,
        serverConfigs: updatedServerConfigs,
        activeServerId: setAsActive ? id : this.settings.activeServerId
      };

      // Save the updated settings
      await this.storage.set(STORAGE_KEYS.SETTINGS, updatedSettings);
      this.settings = updatedSettings;

      // If setting as active, update the active server config and client
      if (setAsActive) {
        this.activeServerConfig = newServerConfig;
        this.contentSigningClient = new ContentSigningClient({
          baseUrl: url
        });
        this.currentAuthor = null;
      }

      return id;
    } catch (error) {
      throw createError(
        ERROR_CODES.STORAGE_ERROR,
        `Failed to add server configuration: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * Update a server configuration
   * @param id The ID of the server configuration to update
   * @param updates The updates to apply
   * @returns A promise that resolves when the server configuration is updated
   */
  async updateServerConfig(
    id: string,
    updates: Partial<Omit<ServerConfig, 'id'>>
  ): Promise<void> {
    try {
      const serverConfig = this.settings.serverConfigs.find(config => config.id === id);
      if (!serverConfig) {
        throw createError(
          ERROR_CODES.VALIDATION_ERROR,
          `Server configuration with ID ${id} not found`
        );
      }

      // Update the server config
      const updatedServerConfig = {
        ...serverConfig,
        ...updates
      };

      // Update the settings with the updated server config
      const updatedServerConfigs = this.settings.serverConfigs.map(config =>
        config.id === id ? updatedServerConfig : config
      );

      const updatedSettings: Settings = {
        ...this.settings,
        serverConfigs: updatedServerConfigs
      };

      // Save the updated settings
      await this.storage.set(STORAGE_KEYS.SETTINGS, updatedSettings);
      this.settings = updatedSettings;

      // If this is the active server, update the active server config and client
      if (id === this.settings.activeServerId || updatedServerConfig.isActive) {
        this.activeServerConfig = updatedServerConfig;
        
        // Reinitialize the client if the URL changed
        if (updates.url) {
          this.contentSigningClient = new ContentSigningClient({
            baseUrl: updatedServerConfig.url
          });

          // Set the API key if available
          if (updatedServerConfig.authorApiKey) {
            this.contentSigningClient.setApiKey(updatedServerConfig.authorApiKey, 'author');
          }

          // Try to load author details if we have an authorId
          if (updatedServerConfig.authorId && this.contentSigningClient) {
            try {
              this.currentAuthor = await this.contentSigningClient.getAuthor(updatedServerConfig.authorId);
            } catch (error) {
              console.error('Failed to load author details:', error);
              this.currentAuthor = null;
            }
          } else {
            this.currentAuthor = null;
          }
        }
      }
    } catch (error) {
      throw createError(
        ERROR_CODES.STORAGE_ERROR,
        `Failed to update server configuration: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * Remove a server configuration
   * @param id The ID of the server configuration to remove
   * @returns A promise that resolves when the server configuration is removed
   */
  async removeServerConfig(id: string): Promise<void> {
    try {
      // Check if this is the only server config
      if (this.settings.serverConfigs.length === 1) {
        throw createError(
          ERROR_CODES.VALIDATION_ERROR,
          'Cannot remove the only server configuration'
        );
      }

      // Check if this is the active server
      const isActive = id === this.settings.activeServerId || 
        this.settings.serverConfigs.find(config => config.id === id)?.isActive;

      // Remove the server config
      const updatedServerConfigs = this.settings.serverConfigs.filter(config => config.id !== id);

      // If this was the active server, set the first server as active
      let activeServerId = this.settings.activeServerId;
      if (isActive && updatedServerConfigs.length > 0) {
        activeServerId = updatedServerConfigs[0].id;
        updatedServerConfigs[0].isActive = true;
      }

      const updatedSettings: Settings = {
        ...this.settings,
        serverConfigs: updatedServerConfigs,
        activeServerId
      };

      // Save the updated settings
      await this.storage.set(STORAGE_KEYS.SETTINGS, updatedSettings);
      this.settings = updatedSettings;

      // If this was the active server, update the active server config and client
      if (isActive && updatedServerConfigs.length > 0) {
        this.activeServerConfig = updatedServerConfigs[0];
        this.contentSigningClient = new ContentSigningClient({
          baseUrl: updatedServerConfigs[0].url
        });

        // Set the API key if available
        if (updatedServerConfigs[0].authorApiKey) {
          this.contentSigningClient.setApiKey(updatedServerConfigs[0].authorApiKey, 'author');
        }

        // Try to load author details if we have an authorId
        if (updatedServerConfigs[0].authorId && this.contentSigningClient) {
          try {
            this.currentAuthor = await this.contentSigningClient.getAuthor(updatedServerConfigs[0].authorId);
          } catch (error) {
            console.error('Failed to load author details:', error);
            this.currentAuthor = null;
          }
        } else {
          this.currentAuthor = null;
        }
      }
    } catch (error) {
      throw createError(
        ERROR_CODES.STORAGE_ERROR,
        `Failed to remove server configuration: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * Sign out the current user
   * @returns A promise that resolves when sign out is complete
   */
  async signOut(): Promise<void> {
    if (!this.activeServerConfig) {
      return;
    }

    // Update the active server config to remove the author ID and API key
    const updatedServerConfig: ServerConfig = {
      ...this.activeServerConfig,
      authorId: undefined,
      authorApiKey: undefined
    };

    // Update the settings with the updated server config
    const updatedServerConfigs = this.settings.serverConfigs.map(config =>
      config.id === updatedServerConfig.id ? updatedServerConfig : config
    );

    const updatedSettings: Settings = {
      ...this.settings,
      serverConfigs: updatedServerConfigs
    };

    // Save the updated settings
    await this.storage.set(STORAGE_KEYS.SETTINGS, updatedSettings);
    this.settings = updatedSettings;
    this.activeServerConfig = updatedServerConfig;
    this.currentAuthor = null;

    // Clear the API key in the client
    if (this.contentSigningClient) {
      this.contentSigningClient.clearApiKey('author');
    }
  }

  /**
   * Get the current author
   * @returns The current author, or null if not authenticated
   */
  getCurrentAuthor(): Author | null {
    return this.currentAuthor;
  }

  /**
   * Get the active server configuration
   * @returns The active server configuration, or null if none is active
   */
  getActiveServerConfig(): ServerConfig | null {
    return this.activeServerConfig;
  }

  /**
   * Get all server configurations
   * @returns An array of all server configurations
   */
  getAllServerConfigs(): ServerConfig[] {
    return this.settings.serverConfigs;
  }

  /**
   * Check if the user is authenticated
   * @returns True if the user is authenticated, false otherwise
   */
  isAuthenticated(): boolean {
    return this.currentAuthor !== null && 
           this.activeServerConfig !== null && 
           !!this.activeServerConfig.authorApiKey;
  }

  /**
   * Get the Content Signing API client
   * @returns The Content Signing API client, or null if not initialized
   */
  getContentSigningClient(): ContentSigningClient | null {
    return this.contentSigningClient;
  }
}