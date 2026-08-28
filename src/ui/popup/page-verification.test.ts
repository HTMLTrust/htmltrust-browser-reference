import { parsePageVerificationResponse } from './page-verification';

const validResult = {
  index: 0,
  valid: true,
  cryptoValid: true,
  inputState: 'rendered-match' as const,
  sourceVerified: true,
  renderedVerified: true,
  reason: null,
  trustScore: 100,
  trustIndicator: 'green' as const,
  trustLabel: 'Trusted',
  trustInputs: [{ source: 'signature', contribution: 100, rationale: 'valid' }],
  keyid: 'key-1',
  algorithm: 'RSA',
  signedAt: '2026-01-01T00:00:00.000Z',
  domain: 'https://example.test',
  claims: { title: 'Example' },
};

describe('parsePageVerificationResponse', () => {
  it('accepts a complete page verification response', () => {
    expect(parsePageVerificationResponse({ results: [validResult] })).toEqual([validResult]);
  });

  it('rejects malformed records instead of trusting a type assertion', () => {
    expect(parsePageVerificationResponse({ results: [{ ...validResult, trustInputs: 1 }] })).toEqual([]);
    expect(parsePageVerificationResponse({ results: [{ ...validResult, claims: { score: 1 } }] })).toEqual([]);
  });
});
