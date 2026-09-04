import { JsonHttpClient, JsonHttpError } from './json-http-client';

function jsonResponse(status: number, data: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn().mockResolvedValue(data === undefined ? '' : JSON.stringify(data)),
  } as unknown as Response;
}

describe('JsonHttpClient', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('joins the base path, encodes query parameters, and parses JSON', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(200, { authors: [] }));
    const client = new JsonHttpClient('https://api.example/v1/');

    const response = await client.get('/authors', {
      params: { name: 'Alice Smith', page: 2, omitted: undefined },
    });

    expect(response).toEqual({ data: { authors: [] }, status: 200 });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.example/v1/authors?name=Alice+Smith&page=2',
      expect.objectContaining({ method: 'GET', credentials: 'omit' }),
    );
  });

  it('sends configured headers and a JSON body', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(201, { id: 'author-1' }));
    const client = new JsonHttpClient('https://api.example');
    client.setHeader('X-AUTHOR-API-KEY', 'secret');

    await client.post('/authors', { name: 'Alice' });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.example/authors',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-AUTHOR-API-KEY': 'secret',
        },
        body: '{"name":"Alice"}',
      }),
    );
  });

  it('returns the server message and status for an HTTP failure', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(403, { message: 'Forbidden' }));
    const client = new JsonHttpClient('https://api.example');

    await expect(client.get('/authors')).rejects.toMatchObject({
      name: 'JsonHttpError',
      message: 'Forbidden',
      status: 403,
      responseData: { message: 'Forbidden' },
    });
  });

  it('aborts requests after the configured timeout', async () => {
    jest.useFakeTimers();
    globalThis.fetch = jest.fn((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const client = new JsonHttpClient('https://api.example', 25);

    const request = client.get('/authors');
    const rejection = expect(request).rejects.toEqual(expect.objectContaining<JsonHttpError>({
      name: 'JsonHttpError',
      message: 'Request timed out after 25 ms',
    }));
    await jest.advanceTimersByTimeAsync(25);
    await rejection;
  });
});
