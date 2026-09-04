import { ContentSigningClient } from './content-signing-client';
import type { JsonHttpClient } from './json-http-client';
import { ERROR_CODES } from '../common/constants';

function jsonResponse(status: number, data: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn().mockResolvedValue(data === undefined ? '' : JSON.stringify(data)),
  } as unknown as Response;
}

const author = {
  id: 'author-1',
  name: 'Alice',
  keyType: 'HUMAN' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('ContentSigningClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('verifyContent (deprecated server endpoint)', () => {
    it('returns a failure without contacting the server', async () => {
      const client = new ContentSigningClient({
        baseUrl: 'https://api.example/',
      });

      // Spy on the internal HTTP client to confirm it is never used for
      // verification. If a regression reintroduces a server call, this fails.
      const internalClient = (client as unknown as { client: JsonHttpClient }).client;
      const post = jest.spyOn(internalClient, 'post');
      const get = jest.spyOn(internalClient, 'get');

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

  describe('typed API response contracts', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
      jest.useRealTimers();
    });

    it('sends configured auth headers and encodes list query parameters', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(200, {
        authors: [author],
        pagination: { total: 1, pages: 1, page: 2, limit: 10 },
      }));
      const client = new ContentSigningClient({ baseUrl: 'https://api.example/v1' });
      client.setApiKey('author-secret', 'author');

      await client.listAuthors('Alice Smith', 'HUMAN', 2, 10);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.example/v1/authors?name=Alice+Smith&keyType=HUMAN&page=2&limit=10',
        expect.objectContaining({
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-AUTHOR-API-KEY': 'author-secret',
          },
          credentials: 'omit',
        }),
      );
    });

    it('maps non-success responses to the public auth error contract', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(403, { message: 'Forbidden' }));
      const client = new ContentSigningClient({ baseUrl: 'https://api.example/v1' });

      await expect(client.getAuthor('author-1')).rejects.toMatchObject({
        code: ERROR_CODES.AUTH_ERROR,
        message: 'Forbidden',
      });
    });

    it('rejects malformed successful responses at the typed boundary', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(200, { id: 'author-1' }));
      const client = new ContentSigningClient({ baseUrl: 'https://api.example/v1' });

      await expect(client.getAuthor('author-1')).rejects.toMatchObject({
        code: ERROR_CODES.UNKNOWN_ERROR,
        message: 'Failed to get author with ID author-1',
      });
    });

    it('maps an aborted request to the public unknown-error contract', async () => {
      jest.useFakeTimers();
      globalThis.fetch = jest.fn((_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }));
      const client = new ContentSigningClient({ baseUrl: 'https://api.example/v1', timeout: 25 });

      const request = client.getAuthor('author-1');
      const rejection = expect(request).rejects.toMatchObject({
        code: ERROR_CODES.UNKNOWN_ERROR,
        message: 'Failed to get author with ID author-1',
      });
      await jest.advanceTimersByTimeAsync(25);
      await rejection;
    });
  });
});
