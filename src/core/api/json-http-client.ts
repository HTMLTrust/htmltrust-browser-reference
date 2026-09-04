export type QueryValue = string | number | boolean | null | undefined;

export interface JsonRequestOptions {
  params?: Record<string, QueryValue>;
}

export interface JsonResponse<T> {
  data: T;
  status: number;
}

export type JsonResponseValidator<T> = (value: unknown) => value is T;

/** Error returned for HTTP failures, timeouts, and transport failures. */
export class JsonHttpError extends Error {
  readonly status?: number;
  readonly responseData?: unknown;
  readonly originalError?: unknown;

  constructor(
    message: string,
    options: { status?: number; responseData?: unknown; originalError?: unknown } = {},
  ) {
    super(message);
    this.name = 'JsonHttpError';
    this.status = options.status;
    this.responseData = options.responseData;
    this.originalError = options.originalError;
  }
}

function responseMessage(data: unknown, status: number): string {
  if (data && typeof data === 'object') {
    const message = (data as Record<string, unknown>).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  if (typeof data === 'string' && data.trim()) return data;
  return `Request failed with status ${status}`;
}

async function parseResponse(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** Minimal JSON client for extension-to-server API calls. */
export class JsonHttpClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  constructor(baseUrl: string, timeout = 10_000) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.timeout = timeout;
  }

  setHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  clearHeader(name: string): void {
    delete this.headers[name];
  }

  get(path: string, options?: JsonRequestOptions): Promise<JsonResponse<unknown>>;
  get<T>(path: string, options: JsonRequestOptions | undefined, validate: JsonResponseValidator<T>): Promise<JsonResponse<T>>;
  get<T>(path: string, options?: JsonRequestOptions, validate?: JsonResponseValidator<T>): Promise<JsonResponse<T> | JsonResponse<unknown>> {
    return this.request<T>('GET', path, undefined, options, validate);
  }

  post(path: string, body?: unknown): Promise<JsonResponse<unknown>>;
  post<T>(path: string, body: unknown, validate: JsonResponseValidator<T>): Promise<JsonResponse<T>>;
  post<T>(path: string, body?: unknown, validate?: JsonResponseValidator<T>): Promise<JsonResponse<T> | JsonResponse<unknown>> {
    return this.request<T>('POST', path, body, undefined, validate);
  }

  put(path: string, body?: unknown): Promise<JsonResponse<unknown>>;
  put<T>(path: string, body: unknown, validate: JsonResponseValidator<T>): Promise<JsonResponse<T>>;
  put<T>(path: string, body?: unknown, validate?: JsonResponseValidator<T>): Promise<JsonResponse<T> | JsonResponse<unknown>> {
    return this.request<T>('PUT', path, body, undefined, validate);
  }

  delete(path: string): Promise<JsonResponse<unknown>> {
    return this.request('DELETE', path);
  }

  private buildUrl(path: string, params?: Record<string, QueryValue>): string {
    const url = new URL(`${this.baseUrl}/${path.replace(/^\/+/, '')}`);
    for (const [name, value] of Object.entries(params ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(name, String(value));
    }
    return url.toString();
  }

  private request(method: string, path: string, body?: unknown, options?: JsonRequestOptions): Promise<JsonResponse<unknown>>;
  private request<T>(method: string, path: string, body: unknown, options: JsonRequestOptions | undefined, validate: JsonResponseValidator<T>): Promise<JsonResponse<T>>;
  private request<T>(method: string, path: string, body: unknown, options: JsonRequestOptions | undefined, validate?: JsonResponseValidator<T>): Promise<JsonResponse<T> | JsonResponse<unknown>>;
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: JsonRequestOptions,
    validate?: JsonResponseValidator<T>,
  ): Promise<JsonResponse<T> | JsonResponse<unknown>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await fetch(this.buildUrl(path, options?.params), {
        method,
        headers: { ...this.headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'omit',
        signal: controller.signal,
      });
      const data = await parseResponse(response);
      if (!response.ok) {
        throw new JsonHttpError(responseMessage(data, response.status), {
          status: response.status,
          responseData: data,
        });
      }
      if (validate && !validate(data)) {
        throw new JsonHttpError(`Invalid JSON response for ${method} ${path}`, {
          status: response.status,
          responseData: data,
        });
      }
      return { data, status: response.status };
    } catch (error) {
      if (error instanceof JsonHttpError) throw error;
      const timedOut = controller.signal.aborted;
      throw new JsonHttpError(
        timedOut ? `Request timed out after ${this.timeout} ms` : 'Network request failed',
        { originalError: error },
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
