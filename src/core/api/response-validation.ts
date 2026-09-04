import type {
  Author,
  BatchVoteResult,
  Claim,
  ClaimMap,
  ContentOccurrence,
  ContentSignature,
  KeyReputation,
  PublicKey,
  TrustDirectoryEntry,
  User,
  VerificationResult,
} from '../common/types';

type ReportStatus = 'PENDING' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED';
type Pagination = { total: number; pages: number; page: number; limit: number };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function string(value: unknown): value is string {
  return typeof value === 'string';
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function stringEnum<const T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && allowed.includes(value as T);
}

function optional(value: Record<string, unknown>, key: string, guard: (value: unknown) => boolean): boolean {
  return value[key] === undefined || guard(value[key]);
}

function claimMap(value: unknown): value is ClaimMap {
  return record(value) && Object.values(value).every((claim) =>
    string(claim) || typeof claim === 'boolean' || finiteNumber(claim));
}

function isTrustInput(value: unknown): value is NonNullable<VerificationResult['trustInputs']>[number] {
  if (!record(value)) return false;
  return string(value.source) && finiteNumber(value.contribution) && string(value.rationale);
}

function isVerificationSettings(value: unknown): value is NonNullable<VerificationResult['settings']> {
  if (!record(value)) return false;
  return optional(value, 'autoVerify', (item) => typeof item === 'boolean') &&
    optional(value, 'showBadges', (item) => typeof item === 'boolean') &&
    optional(value, 'highlightVerified', (item) => typeof item === 'boolean') &&
    optional(value, 'highlightUnverified', (item) => typeof item === 'boolean');
}

export function isAuthor(value: unknown): value is Author {
  if (!record(value)) return false;
  return string(value.id) && string(value.name) &&
    stringEnum(value.keyType, ['HUMAN', 'AI', 'HUMAN_AI_MIX', 'ORGANIZATION']) &&
    string(value.createdAt) && string(value.updatedAt) &&
    optional(value, 'description', string) && optional(value, 'url', string);
}

export function isPublicKey(value: unknown): value is PublicKey {
  if (!record(value)) return false;
  return string(value.id) && string(value.authorId) && string(value.key) &&
    stringEnum(value.algorithm, ['RSA', 'ECDSA', 'ED25519']) &&
    string(value.createdAt) && optional(value, 'expiresAt', string);
}

export function isClaim(value: unknown): value is Claim {
  if (!record(value)) return false;
  return string(value.id) && string(value.name) && string(value.description) &&
    string(value.createdAt) && string(value.updatedAt) &&
    (value.possibleValues === undefined ||
      (Array.isArray(value.possibleValues) && value.possibleValues.every(string)));
}

export function isContentSignature(value: unknown): value is ContentSignature {
  if (!record(value)) return false;
  return string(value.contentHash) && string(value.domain) && string(value.authorId) &&
    string(value.signature) && claimMap(value.claims) && optional(value, 'createdAt', string);
}

export function isKeyReputation(value: unknown): value is KeyReputation {
  if (!record(value)) return false;
  return string(value.keyId) && finiteNumber(value.trustScore) &&
    finiteNumber(value.verifiedSignatures) && optional(value, 'reports', finiteNumber) &&
    optional(value, 'lastUpdated', string);
}

export function isContentOccurrence(value: unknown): value is ContentOccurrence {
  if (!record(value)) return false;
  return string(value.url) && string(value.domain) && string(value.firstSeen) &&
    optional(value, 'lastSeen', string) && optional(value, 'authorId', string) &&
    optional(value, 'signatureValid', (item) => typeof item === 'boolean');
}

export function isTrustDirectoryEntry(value: unknown): value is TrustDirectoryEntry {
  if (!record(value)) return false;
  return string(value.id) && string(value.userId) && string(value.domain) &&
    string(value.publicKey) && finiteNumber(value.createdAt) && finiteNumber(value.updatedAt) &&
    typeof value.active === 'boolean';
}

export function isTrustDirectoryEntryList(value: unknown): value is TrustDirectoryEntry[] {
  return Array.isArray(value) && value.every(isTrustDirectoryEntry);
}

export function isUser(value: unknown): value is User {
  if (!record(value)) return false;
  return string(value.id) && string(value.name) && string(value.email) &&
    string(value.publicKey) && typeof value.verified === 'boolean';
}

export function isVerificationResult(value: unknown): value is VerificationResult {
  if (!record(value)) return false;
  return typeof value.verified === 'boolean' && finiteNumber(value.verifiedAt) &&
    optional(value, 'reason', string) && optional(value, 'user', isUser) &&
    optional(value, 'trustDirectoryEntry', isTrustDirectoryEntry) &&
    optional(value, 'trustStatus', (item) => stringEnum(item, ['trusted', 'untrusted', 'unknown'])) &&
    optional(value, 'cryptoValid', (item) => typeof item === 'boolean') &&
    optional(value, 'trustScore', finiteNumber) &&
    optional(value, 'trustIndicator', (item) =>
      stringEnum(item, ['trusted', 'unknown', 'untrusted', 'green', 'yellow', 'red'])) &&
    optional(value, 'domain', string) &&
    optional(value, 'trustInputs', (item) => Array.isArray(item) && item.every(isTrustInput)) &&
    optional(value, 'settings', isVerificationSettings);
}

export function isPagination(value: unknown): value is { total: number; pages: number; page: number; limit: number } {
  if (!record(value)) return false;
  return finiteNumber(value.total) && finiteNumber(value.pages) &&
    finiteNumber(value.page) && finiteNumber(value.limit);
}

export function isAuthorListResponse(value: unknown): value is { authors: Author[]; pagination: Pagination } {
  return record(value) && Array.isArray(value.authors) && value.authors.every(isAuthor) && isPagination(value.pagination);
}

export function isCreateAuthorResponse(value: unknown): value is { author: Author; authorApiKey: string } {
  return record(value) && isAuthor(value.author) && string(value.authorApiKey);
}

export function isClaimListResponse(value: unknown): value is { claims: Claim[]; pagination: Pagination } {
  return record(value) && Array.isArray(value.claims) && value.claims.every(isClaim) && isPagination(value.pagination);
}

export function isKeySearchResponse(value: unknown): value is {
  keys: Array<PublicKey & { author: Author; trustScore: number }>;
  pagination: Pagination;
} {
  return record(value) && Array.isArray(value.keys) && value.keys.every((key) =>
    record(key) && isPublicKey(key) && isAuthor(key.author) && finiteNumber(key.trustScore)) && isPagination(value.pagination);
}

export function isContentSearchResponse(value: unknown): value is {
  signatures: Array<ContentSignature & { author: Author; occurrences: number }>;
  pagination: Pagination;
} {
  return record(value) && Array.isArray(value.signatures) && value.signatures.every((signature) =>
    record(signature) && isContentSignature(signature) && isAuthor(signature.author) && finiteNumber(signature.occurrences)) &&
    isPagination(value.pagination);
}

export function isOccurrenceResponse(value: unknown): value is {
  occurrences: ContentOccurrence[];
  pagination: Pagination;
} {
  return record(value) && Array.isArray(value.occurrences) && value.occurrences.every(isContentOccurrence) &&
    isPagination(value.pagination);
}

export function isReportResponse(value: unknown): value is { reportId: string; status: ReportStatus } {
  return record(value) && string(value.reportId) &&
    stringEnum(value.status, ['PENDING', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED']);
}

export function isBatchVoteResult(value: unknown): value is BatchVoteResult {
  if (!record(value) || typeof value.success !== 'boolean') return false;
  if (!optional(value, 'error', string)) return false;
  if (value.results === undefined) return true;
  return record(value.results) && Object.values(value.results).every((result) => {
    if (!record(result) || typeof result.success !== 'boolean') return false;
    return optional(result, 'error', string);
  });
}
