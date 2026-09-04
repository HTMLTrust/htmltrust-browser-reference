import { sha256 } from 'js-sha256';

/** Generate a SHA-256 hex digest for legacy heuristic content processing. */
export function hashContent(content: string): string {
  return sha256(content);
}
