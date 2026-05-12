/**
 * Tests for the trust-directory settings normalizer.
 *
 * getTrustDirectoryUrls() is the single source of truth that turns the user's
 * persisted settings (which may carry the legacy single-URL field or the new
 * list field, or both) into a clean list for the resolver chain. The local-
 * verify migration relies on this — both the content script and background
 * script feed its output directly into defaultResolverChain().
 */
import { getTrustDirectoryUrls } from './types';

describe('getTrustDirectoryUrls', () => {
  it('returns the explicit list when populated', () => {
    expect(
      getTrustDirectoryUrls({
        trustDirectoryUrls: ['https://a.example/', 'https://b.example/'],
      }),
    ).toEqual(['https://a.example/', 'https://b.example/']);
  });

  it('falls back to the legacy single URL when the list is empty', () => {
    expect(
      getTrustDirectoryUrls({
        trustDirectoryUrls: [],
        trustDirectoryUrl: 'https://legacy.example/',
      }),
    ).toEqual(['https://legacy.example/']);
  });

  it('falls back to the legacy single URL when the list is undefined', () => {
    expect(
      getTrustDirectoryUrls({
        trustDirectoryUrl: 'https://legacy.example/',
      }),
    ).toEqual(['https://legacy.example/']);
  });

  it('trims whitespace from the legacy URL', () => {
    expect(
      getTrustDirectoryUrls({
        trustDirectoryUrl: '  https://legacy.example/  ',
      }),
    ).toEqual(['https://legacy.example/']);
  });

  it('filters empty/whitespace entries from the list', () => {
    expect(
      getTrustDirectoryUrls({
        trustDirectoryUrls: ['https://a.example/', '', '   '],
      }),
    ).toEqual(['https://a.example/']);
  });

  it('returns an empty list when neither field is populated', () => {
    expect(getTrustDirectoryUrls({})).toEqual([]);
  });

  it('returns an empty list when only an empty legacy URL is set', () => {
    expect(getTrustDirectoryUrls({ trustDirectoryUrl: '   ' })).toEqual([]);
  });
});
