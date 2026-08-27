/**
 * The signing path writes these values into the page. A trust server that is
 * hostile or merely broken must not be able to get anything through that isn't
 * the shape the spec describes.
 */
import {
  buildKeyidUrl,
  requireCanonicalBase64,
  requireContentHash,
  requireTimestamp,
  sanitizeClaims,
} from './signature-fields';

const VALID_HASH = 'sha256:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU';

describe('requireCanonicalBase64', () => {
  it('accepts canonical unpadded standard Base64', () => {
    expect(requireCanonicalBase64('abcd', 'signature')).toBe('abcd');
  });

  it.each<[unknown, string]>([
    ["'; alert(1); //", 'script-breaking punctuation'],
    ['abcd=', 'padding'],
    ['ab-cd', 'base64url alphabet'],
    ['abcde', 'impossible length'],
    ['', 'empty'],
    [undefined, 'missing'],
    [{}, 'non-string'],
  ])('rejects %p (%s)', (value, _why) => {
    expect(() => requireCanonicalBase64(value, 'signature')).toThrow(/malformed signature/);
  });
});

describe('requireContentHash', () => {
  it('accepts a sha256 hash of the right length', () => {
    expect(requireContentHash(VALID_HASH)).toBe(VALID_HASH);
  });

  it.each([
    'sha256:tooshort',
    'sha512:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU',
    "sha256:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuF'",
    VALID_HASH + 'A',
  ])('rejects %p', (value) => {
    expect(() => requireContentHash(value)).toThrow(/malformed contentHash/);
  });
});

describe('requireTimestamp', () => {
  it('accepts RFC3339 date-times', () => {
    expect(requireTimestamp('2026-04-28T12:00:00Z', 'createdAt')).toBe('2026-04-28T12:00:00Z');
    expect(requireTimestamp('2026-04-28T12:00:00.500-05:00', 'createdAt')).toBe(
      '2026-04-28T12:00:00.500-05:00',
    );
  });

  it.each([
    "2026-04-28T12:00:00Z'; alert(1); //",
    '2026-04-28',
    'yesterday',
    '2026-13-45T99:00:00Z',
  ])('rejects %p', (value) => {
    expect(() => requireTimestamp(value, 'createdAt')).toThrow(/malformed createdAt/);
  });
});

describe('buildKeyidUrl', () => {
  it('builds the public-key endpoint for a well-formed author id', () => {
    expect(buildKeyidUrl('https://trust.example', 'author-123')).toBe(
      'https://trust.example/api/authors/author-123/public-key',
    );
  });

  it('preserves a base path on the configured server', () => {
    expect(buildKeyidUrl('https://trust.example/trust/', 'a1')).toBe(
      'https://trust.example/trust/api/authors/a1/public-key',
    );
  });

  it.each<[string, string]>([
    ['../../evil', 'path traversal'],
    ['a/b', 'extra path segment'],
    ['a?x=1', 'query'],
    ['a#f', 'fragment'],
    ["a'", 'quote'],
    ['', 'empty'],
  ])('rejects author id %p (%s)', (authorId, _why) => {
    expect(() => buildKeyidUrl('https://trust.example', authorId)).toThrow(/malformed authorId/);
  });

  it('rejects a non-http(s) server URL', () => {
    expect(() => buildKeyidUrl('javascript:alert(1)', 'a1')).toThrow();
  });
});

describe('sanitizeClaims', () => {
  it('returns name/value pairs as strings', () => {
    expect(sanitizeClaims({ title: 'Hello', count: 3 })).toEqual([
      ['title', 'Hello'],
      ['count', '3'],
    ]);
  });

  it('drops names a meta element cannot carry', () => {
    expect(sanitizeClaims({ 'bad name': 'x', 'quote"': 'y', ok: 'z' })).toEqual([['ok', 'z']]);
  });

  it('drops nested objects and nullish values', () => {
    expect(sanitizeClaims({ nested: { a: 1 }, missing: null, ok: 'z' })).toEqual([['ok', 'z']]);
  });

  it('returns an empty list for a non-object', () => {
    expect(sanitizeClaims(undefined)).toEqual([]);
    expect(sanitizeClaims('claims')).toEqual([]);
  });

  it('keeps a quote in a claim value, which is data and never code', () => {
    expect(sanitizeClaims({ title: "It's fine" })).toEqual([['title', "It's fine"]]);
  });
});
