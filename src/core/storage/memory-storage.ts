/**
 * In-memory storage implementation for testing
 */
import { BaseStorage } from './storage-interface';

/**
 * In-memory storage implementation
 * This is primarily used for testing and development
 */
export class MemoryStorage extends BaseStorage {
  private storage: Map<string, any> = new Map();

  /**
   * Get a value from storage
   * @param key The key to get
   * @returns A promise that resolves with the value, or null if not found
   */
  async get<T>(key: string): Promise<T | null> {
    if (this.storage.has(key)) {
      return this.storage.get(key) as T;
    }
    return null;
  }

  /**
   * Set a value in storage
   * @param key The key to set
   * @param value The value to set
   * @returns A promise that resolves when the operation is complete
   */
  async set<T>(key: string, value: T): Promise<void> {
    this.storage.set(key, value);
  }

  /**
   * Remove a value from storage
   * @param key The key to remove
   * @returns A promise that resolves when the operation is complete
   */
  async remove(key: string): Promise<void> {
    this.storage.delete(key);
  }

  /**
   * Clear all values from storage
   * @returns A promise that resolves when the operation is complete
   */
  async clear(): Promise<void> {
    this.storage.clear();
  }

  /**
   * Get all keys in storage
   * @returns A promise that resolves with an array of keys
   */
  async getAllKeys(): Promise<string[]> {
    return Array.from(this.storage.keys());
  }
}