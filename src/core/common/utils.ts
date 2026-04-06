/**
 * Utility functions for the Content Signing extension
 */
import { sha256 } from 'js-sha256';
import { ExtensionError } from './types';

/**
 * Generates a hash of the provided content
 * @param content The content to hash
 * @returns The SHA-256 hash of the content
 */
export function hashContent(content: string): string {
  return sha256(content);
}

/**
 * Formats a timestamp as a human-readable date string
 * @param timestamp The timestamp to format
 * @returns A formatted date string
 */
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

/**
 * Creates a standardized error object
 * @param code The error code
 * @param message The error message
 * @param details Additional error details
 * @returns An ExtensionError object
 */
export function createError(code: string, message: string, details?: any): ExtensionError {
  return {
    code,
    message,
    details,
  };
}

/**
 * Validates a URL string
 * @param url The URL to validate
 * @returns True if the URL is valid, false otherwise
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Truncates a string to a specified length
 * @param str The string to truncate
 * @param maxLength The maximum length of the string
 * @returns The truncated string
 */
export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength) + '...';
}

/**
 * Debounces a function call
 * @param func The function to debounce
 * @param wait The time to wait in milliseconds
 * @returns A debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return function(...args: Parameters<T>): void {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Generates a random ID
 * @param length The length of the ID
 * @returns A random ID string
 */
export function generateId(length: number = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}