/**
 * Abstract storage interface for the Content Signing extension
 */

/**
 * Interface for storage operations
 */
export interface StorageInterface {
  /**
   * Get a value from storage
   * @param key The key to get
   * @returns A promise that resolves with the value, or null if not found
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Set a value in storage
   * @param key The key to set
   * @param value The value to set
   * @returns A promise that resolves when the operation is complete
   */
  set<T>(key: string, value: T): Promise<void>;

  /**
   * Remove a value from storage
   * @param key The key to remove
   * @returns A promise that resolves when the operation is complete
   */
  remove(key: string): Promise<void>;

  /**
   * Clear all values from storage
   * @returns A promise that resolves when the operation is complete
   */
  clear(): Promise<void>;

  /**
   * Get all keys in storage
   * @returns A promise that resolves with an array of keys
   */
  getAllKeys(): Promise<string[]>;

  /**
   * Check if a key exists in storage
   * @param key The key to check
   * @returns A promise that resolves with a boolean indicating if the key exists
   */
  has(key: string): Promise<boolean>;
}

/**
 * Abstract base class for storage implementations
 */
export abstract class BaseStorage implements StorageInterface {
  /**
   * Get a value from storage
   * @param key The key to get
   * @returns A promise that resolves with the value, or null if not found
   */
  abstract get<T>(key: string): Promise<T | null>;

  /**
   * Set a value in storage
   * @param key The key to set
   * @param value The value to set
   * @returns A promise that resolves when the operation is complete
   */
  abstract set<T>(key: string, value: T): Promise<void>;

  /**
   * Remove a value from storage
   * @param key The key to remove
   * @returns A promise that resolves when the operation is complete
   */
  abstract remove(key: string): Promise<void>;

  /**
   * Clear all values from storage
   * @returns A promise that resolves when the operation is complete
   */
  abstract clear(): Promise<void>;

  /**
   * Get all keys in storage
   * @returns A promise that resolves with an array of keys
   */
  abstract getAllKeys(): Promise<string[]>;

  /**
   * Check if a key exists in storage
   * @param key The key to check
   * @returns A promise that resolves with a boolean indicating if the key exists
   */
  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }
}