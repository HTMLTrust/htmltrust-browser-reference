/**
 * Utility functions for the Content Signing extension
 */
import { ExtensionError } from './types';

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
export function createError(code: string, message: string, details?: unknown): ExtensionError {
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
  } catch {
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
export function debounce<Args extends unknown[]>(
  func: (...args: Args) => unknown,
  wait: number
): (...args: Args) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return function(...args: Args): void {
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
