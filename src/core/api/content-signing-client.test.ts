/**
 * Tests for ContentSigningClient — focused on the local-verification migration.
 *
 * Asserts:
 *   1. verifySignedSectionLocal() delegates to @htmltrust/browser-client's
 *      verifySignedSection() and forwards the configured resolver chain. This
 *      is the spec §3.1 path; the assertion is the load-bearing one for the
 *      migration.
 *   2. The deprecated verifyContent() does NOT make a network call and returns
 *      a structured { valid: false } failure. This guards against accidental
 *      regression to server-side verification.
 *   3. setTrustDirectories() rebuilds the resolver chain.
 */

// The library is mocked at module level so we can assert call arguments
// without instantiating the real SubtleCrypto-backed verifier.
jest.mock('@htmltrust/browser-client', () => {
  const mockResolver = { name: 'mock-resolver' };
  return {
    verifySignedSection: jest.fn(),
    defaultResolverChain: jest.fn(() => [mockResolver]),
    evaluateTrustPolicy: jest.fn(),
  };
});

import * as browserClient from '@htmltrust/browser-client';
import { ContentSigningClient } from './content-signing-client';

describe('ContentSigningClient — local verification (spec §3.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (browserClient.defaultResolverChain as jest.Mock).mockReturnValue([
      { name: 'mock-resolver' },
    ]);
  });

  describe('constructor', () => {
    it('builds a resolver chain from configured trust directories', () => {
      const directories = ['https://dir-a.example/', 'https://dir-b.example/'];
      new ContentSigningClient({
        baseUrl: 'https://api.example/',
        trustDirectories: directories,
      });
      expect(browserClient.defaultResolverChain).toHaveBeenCalledWith({
        directories,
      });
    });

    it('builds a resolver chain with an empty list when no directories are provided', () => {
      new ContentSigningClient({ baseUrl: 'https://api.example/' });
      expect(browserClient.defaultResolverChain).toHaveBeenCalledWith({
        directories: [],
      });
    });
  });

  describe('verifySignedSectionLocal', () => {
    it('delegates to verifySignedSection with the configured resolver chain', async () => {
      const fakeResult = { valid: true, keyid: 'k1', reason: undefined };
      (browserClient.verifySignedSection as jest.Mock).mockResolvedValueOnce(
        fakeResult,
      );

      const client = new ContentSigningClient({
        baseUrl: 'https://api.example/',
        trustDirectories: ['https://dir.example/'],
      });

      const section = '<signed-section signature="sig"></signed-section>';
      const result = await client.verifySignedSectionLocal({
        section,
        domain: 'example.test',
      });

      expect(result).toBe(fakeResult);
      expect(browserClient.verifySignedSection).toHaveBeenCalledTimes(1);
      const [arg0, arg1] = (browserClient.verifySignedSection as jest.Mock).mock
        .calls[0];
      expect(arg0).toBe(section);
      expect(arg1.domain).toBe('example.test');
      // The resolver chain must be the one the constructor built.
      expect(arg1.keyResolvers).toEqual(client.getResolverChain());
    });

    it('honors caller-supplied resolver chain over the configured default', async () => {
      (browserClient.verifySignedSection as jest.Mock).mockResolvedValueOnce({
        valid: false,
      });

      const client = new ContentSigningClient({
        baseUrl: 'https://api.example/',
        trustDirectories: ['https://dir.example/'],
      });

      const customChain = [{ name: 'custom' }] as any;
      await client.verifySignedSectionLocal({
        section: '<signed-section></signed-section>',
        keyResolvers: customChain,
      });

      const [, arg1] = (browserClient.verifySignedSection as jest.Mock).mock
        .calls[0];
      expect(arg1.keyResolvers).toBe(customChain);
    });
  });

  describe('verifyContent (deprecated server endpoint)', () => {
    it('returns a failure without contacting the server', async () => {
      const client = new ContentSigningClient({
        baseUrl: 'https://api.example/',
      });

      // Spy on the internal axios client to confirm it is never used for
      // verification. If a regression reintroduces a server call, this fails.
      const post = jest.spyOn((client as any).client, 'post');
      const get = jest.spyOn((client as any).client, 'get');

      const result = await client.verifyContent(
        'sha256-...',
        'example.test',
        'author-id',
        'sig',
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/deprecated/i);
      expect(post).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
    });
  });

  describe('setTrustDirectories', () => {
    it('rebuilds the resolver chain when directories change', () => {
      const client = new ContentSigningClient({
        baseUrl: 'https://api.example/',
        trustDirectories: ['https://old.example/'],
      });
      (browserClient.defaultResolverChain as jest.Mock).mockClear();

      const next = ['https://new-a.example/', 'https://new-b.example/'];
      client.setTrustDirectories(next);

      expect(browserClient.defaultResolverChain).toHaveBeenCalledWith({
        directories: next,
      });
    });
  });
});
