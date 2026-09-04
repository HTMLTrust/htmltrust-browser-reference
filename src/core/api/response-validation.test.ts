import {
  isAuthor,
  isPublicKey,
  isReportResponse,
  isVerificationResult,
} from './response-validation';

describe('API response enum validation', () => {
  it('requires primitive string enum values', () => {
    expect(isAuthor({
      id: 'author-1',
      name: 'Alice',
      keyType: new String('HUMAN'),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })).toBe(false);
    expect(isPublicKey({
      id: 'key-1',
      authorId: 'author-1',
      key: 'public-key',
      algorithm: new String('ED25519'),
      createdAt: '2026-01-01T00:00:00.000Z',
    })).toBe(false);
    expect(isVerificationResult({
      verified: true,
      verifiedAt: 1,
      trustStatus: new String('trusted'),
    })).toBe(false);
    expect(isReportResponse({
      reportId: 'report-1',
      status: new String('PENDING'),
    })).toBe(false);
  });
});
