/**
 * Validation of the fields a trust server returns from the signing endpoint.
 *
 * These values end up as attributes on a <signed-section> in the page, so they
 * are untrusted input regardless of how much the user trusts their own server.
 * Each check rejects rather than sanitizes: a signing response that does not
 * match the spec's shape is a failure, not something to patch up.
 *
 * Injection into the page passes these values as structured-cloned arguments
 * (PlatformAdapter.executeFunction), never as interpolated script text, so
 * these checks are the second line of defence rather than the only one.
 */

/** Canonical unpadded standard Base64, per spec §6.1. */
const CANONICAL_BASE64_RE = /^[A-Za-z0-9+/]+$/;
/** `sha256:` followed by 32 bytes of canonical unpadded Base64. */
const CONTENT_HASH_RE = /^sha256:[A-Za-z0-9+/]{43}$/;
/** RFC3339 date-time, the form the spec uses for `signed-at`. */
const TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;
/** Server-issued author identifiers: opaque, but URL-path safe. */
const AUTHOR_ID_RE = /^[A-Za-z0-9._~-]{1,128}$/;
/** Claim names that a `<meta name>` carries unambiguously. */
const CLAIM_NAME_RE = /^[A-Za-z0-9._:-]{1,128}$/;

const MAX_SIGNATURE_LENGTH = 8192;
const MAX_CLAIM_VALUE_LENGTH = 4096;

export function requireCanonicalBase64(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_SIGNATURE_LENGTH) {
    throw new Error(`Trust server returned a malformed ${field}`);
  }
  if (!CANONICAL_BASE64_RE.test(value) || value.length % 4 === 1) {
    throw new Error(`Trust server returned a malformed ${field}`);
  }
  return value;
}

export function requireContentHash(value: unknown): string {
  if (typeof value !== 'string' || !CONTENT_HASH_RE.test(value)) {
    throw new Error('Trust server returned a malformed contentHash');
  }
  return value;
}

export function requireTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string' || !TIMESTAMP_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`Trust server returned a malformed ${field}`);
  }
  return value;
}

/**
 * Build the keyid URL from the configured server and the returned author id.
 * The author id is pattern-checked rather than escaped so it cannot introduce
 * path segments, a query, or a fragment that would repoint key resolution.
 */
export function buildKeyidUrl(serverUrl: string, authorId: unknown): string {
  if (typeof authorId !== 'string' || !AUTHOR_ID_RE.test(authorId)) {
    throw new Error('Trust server returned a malformed authorId');
  }
  const base = new URL(serverUrl);
  if (base.protocol !== 'https:' && base.protocol !== 'http:') {
    throw new Error('Active trust server URL is not an http(s) URL');
  }
  return `${base.origin}${base.pathname.replace(/\/+$/, '')}/api/authors/${authorId}/public-key`;
}

/**
 * Flatten the returned claims map to [name, value] string pairs. Claims with a
 * name a `<meta>` cannot carry, and nested objects that have no single sensible
 * string form, are dropped rather than guessed at.
 */
export function sanitizeClaims(claims: unknown): Array<[string, string]> {
  if (!claims || typeof claims !== 'object') return [];
  const out: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(claims as Record<string, unknown>)) {
    if (!CLAIM_NAME_RE.test(key)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') continue;
    out.push([key, String(value).slice(0, MAX_CLAIM_VALUE_LENGTH)]);
  }
  return out;
}
