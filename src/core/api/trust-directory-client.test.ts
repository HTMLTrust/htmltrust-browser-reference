import { ERROR_CODES } from '../common/constants';
import { TrustDirectoryClient } from './trust-directory-client';

function jsonResponse(status: number, data: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn().mockResolvedValue(data === undefined ? '' : JSON.stringify(data)),
  } as unknown as Response;
}

describe('TrustDirectoryClient response contracts', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns valid trust directory entries', async () => {
    const entry = {
      id: 'entry-1',
      userId: 'user-1',
      domain: 'example.test',
      publicKey: 'public-key',
      createdAt: 1,
      updatedAt: 2,
      active: true,
    };
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(200, [entry]));
    const client = new TrustDirectoryClient({ baseUrl: 'https://directory.example' });

    await expect(client.getAllEntries()).resolves.toEqual([entry]);
  });

  it('rejects malformed trust directory entries at the typed boundary', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(200, [{ id: 'entry-1' }]));
    const client = new TrustDirectoryClient({ baseUrl: 'https://directory.example' });

    await expect(client.getAllEntries()).rejects.toMatchObject({
      code: ERROR_CODES.UNKNOWN_ERROR,
      message: 'Failed to get trust directory entries',
    });
  });

  it('rejects malformed optional verification fields at the typed boundary', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(200, {
      verified: true,
      verifiedAt: 1,
      trustInputs: [{ source: 'signature', contribution: '100', rationale: 'valid' }],
    }));
    const client = new TrustDirectoryClient({ baseUrl: 'https://directory.example' });

    await expect(client.verifySignature('example.test', 'hash', 'signature', 'public-key')).rejects.toMatchObject({
      code: ERROR_CODES.UNKNOWN_ERROR,
      message: 'Failed to verify signature',
    });
  });
});
