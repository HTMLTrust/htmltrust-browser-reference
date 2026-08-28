export interface PageVerification {
  index: number;
  valid: boolean;
  cryptoValid: boolean;
  inputState: 'source-only' | 'stale' | 'rendered-match';
  sourceVerified: boolean;
  renderedVerified: boolean;
  reason: string | null;
  trustScore: number;
  trustIndicator: 'green' | 'yellow' | 'red';
  trustLabel: string;
  trustInputs: Array<{ source: string; contribution: number; rationale: string }>;
  keyid: string;
  algorithm: string;
  signedAt: string;
  domain: string;
  claims: Record<string, string>;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isTrustInput(value: unknown): value is PageVerification['trustInputs'][number] {
  if (!record(value)) return false;
  return typeof value.source === 'string' &&
    typeof value.contribution === 'number' && Number.isFinite(value.contribution) &&
    typeof value.rationale === 'string';
}

function isPageVerification(value: unknown): value is PageVerification {
  if (!record(value)) return false;
  const claims = value.claims;
  return typeof value.index === 'number' && Number.isInteger(value.index) && value.index >= 0 &&
    typeof value.valid === 'boolean' && typeof value.cryptoValid === 'boolean' &&
    (value.inputState === 'source-only' || value.inputState === 'stale' || value.inputState === 'rendered-match') &&
    typeof value.sourceVerified === 'boolean' && typeof value.renderedVerified === 'boolean' &&
    (value.reason === null || typeof value.reason === 'string') &&
    typeof value.trustScore === 'number' && Number.isFinite(value.trustScore) &&
    (value.trustIndicator === 'green' || value.trustIndicator === 'yellow' || value.trustIndicator === 'red') &&
    typeof value.trustLabel === 'string' &&
    Array.isArray(value.trustInputs) && value.trustInputs.every(isTrustInput) &&
    typeof value.keyid === 'string' && typeof value.algorithm === 'string' &&
    typeof value.signedAt === 'string' && typeof value.domain === 'string' &&
    record(claims) && Object.values(claims).every((claim) => typeof claim === 'string');
}

export function parsePageVerificationResponse(value: unknown): PageVerification[] {
  if (!record(value) || !Array.isArray(value.results) || !value.results.every(isPageVerification)) {
    return [];
  }
  return value.results;
}
