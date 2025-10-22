import {
  composeMiddlewares,
  type CancelablePromise,
  type Middleware,
  type Request,
} from "./middleware";

export type JsonLike = object | string | number | boolean | null;

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type RestClientOptions = {
  baseUrl?: string;
  middlewares?: Middleware[];
  fetcher?: Fetcher;
  fetchInit?: RequestInit;
};

export type RestRequestOptions = {
  headers?: HeadersInit;
  query?: Record<string, string | number | boolean | undefined>;
};

/**
 * Fetch handler function that can be used with any fetch-compatible API
 * This is the function signature returned by createFetchClient
 */
export type FetchHandler = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

/**
 * REST client with convenience methods for HTTP verbs
 * Also acts as a fetch handler that can be passed to connect-es or other libraries
 */
export type RestClient = FetchHandler & {
  get<T = unknown>(
    path: string,
    options?: RestRequestOptions,
  ): CancelablePromise<T>;
  post<T = unknown>(
    path: string,
    body?: JsonLike | Uint8Array | FormData | null,
    options?: RestRequestOptions,
  ): CancelablePromise<T>;
  put<T = unknown>(
    path: string,
    body?: JsonLike | Uint8Array | FormData | null,
    options?: RestRequestOptions,
  ): CancelablePromise<T>;
  patch<T = unknown>(
    path: string,
    body?: JsonLike | Uint8Array | FormData | null,
    options?: RestRequestOptions,
  ): CancelablePromise<T>;
  delete<T = unknown>(
    path: string,
    options?: RestRequestOptions,
  ): CancelablePromise<T>;
};

function joinUrl(baseUrl: string | undefined, path: string): string {
  if (!baseUrl) return path;
  if (/^https?:/i.test(path)) return path;
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function toQueryString(query?: RestRequestOptions["query"]): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

/**
 * Create a fetch client with middlewares
 *
 * Returns a hybrid function that can be:
 * 1. Called as a function for raw fetch operations (compatible with connect-es)
 * 2. Used as an object with convenience methods (get, post, put, patch, delete)
 *
 * @example
 * ```ts
 * import { createFetchClient, jsonResponseMiddleware } from 'fetch-middleware'
 *
 * const client = createFetchClient({
 *   middlewares: [jsonResponseMiddleware()],
 *   fetchInit: {
 *     credentials: 'include',
 *   },
 * })
 *
 * // Use as fetch handler (for connect-es, etc.)
 * const response = await client('https://api.example.com/data', {
 *   method: 'POST',
 *   body: JSON.stringify({ key: 'value' }),
 * })
 *
 * // Use as REST client
 * const data = await client.post('/api/users', { name: 'John' })
 * const user = await client.get('/api/users/123')
 * ```
 */
export function createFetchClient(options: RestClientOptions = {}): RestClient {
  const handler = composeMiddlewares(options.middlewares ?? [], {
    fetcher: (input, init) => {
      const baseFetcher = options.fetcher ?? fetch;
      const mergedInit = mergeRequestInit(options.fetchInit, init);
      return baseFetcher(input, mergedInit);
    },
  });

  // Create the base fetch handler function
  const fetchHandler = (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    return handler({
      url: typeof input === "string" ? input : String(input),
      method: init?.method ?? "GET",
      headers: init?.headers,
      body: init?.body ?? null,
      signal: init?.signal ?? undefined,
    }) as Promise<Response>;
  };

  const run = <T>(request: Request) => {
    const responsePromise = handler(request);
    const cancelable = responsePromise as CancelablePromise<Response>;

    // Cast the response to T
    // Middlewares are responsible for transforming Response to the desired type
    const dataPromise = responsePromise as unknown as CancelablePromise<T>;
    dataPromise.cancel = cancelable.cancel;
    dataPromise.controller = cancelable.controller;
    dataPromise.signal = cancelable.signal;

    return dataPromise;
  };

  // Attach REST methods to the fetch handler function
  const client = fetchHandler as RestClient;

  client.get = function <T = unknown>(path: string, opts?: RestRequestOptions) {
    const url = joinUrl(
      options.baseUrl,
      `${path}${toQueryString(opts?.query)}`,
    );
    return run<T>({
      url,
      method: "GET",
      headers: opts?.headers,
    });
  };

  client.post = function <T = unknown>(
    path: string,
    body?: JsonLike | Uint8Array | FormData | null,
    opts?: RestRequestOptions,
  ) {
    const request = buildRequest(
      "POST",
      joinUrl(options.baseUrl, path),
      body,
      opts?.headers,
    );
    return run<T>(request);
  };

  client.put = function <T = unknown>(
    path: string,
    body?: JsonLike | Uint8Array | FormData | null,
    opts?: RestRequestOptions,
  ) {
    const request = buildRequest(
      "PUT",
      joinUrl(options.baseUrl, path),
      body,
      opts?.headers,
    );
    return run<T>(request);
  };

  client.patch = function <T = unknown>(
    path: string,
    body?: JsonLike | Uint8Array | FormData | null,
    opts?: RestRequestOptions,
  ) {
    const request = buildRequest(
      "PATCH",
      joinUrl(options.baseUrl, path),
      body,
      opts?.headers,
    );
    return run<T>(request);
  };

  client.delete = function <T = unknown>(
    path: string,
    opts?: RestRequestOptions,
  ) {
    const request = buildRequest(
      "DELETE",
      joinUrl(options.baseUrl, path),
      null,
      opts?.headers,
    );
    return run<T>(request);
  };

  return client;
}

function mergeRequestInit(
  base?: RequestInit,
  incoming?: RequestInit,
): RequestInit | undefined {
  if (!base && !incoming) return undefined;

  const mergedHeaders = new Headers();
  if (base?.headers) {
    new Headers(base.headers).forEach((value, key) => {
      mergedHeaders.set(key, value);
    });
  }
  if (incoming?.headers) {
    new Headers(incoming.headers).forEach((value, key) => {
      mergedHeaders.set(key, value);
    });
  }

  const method = incoming?.method ?? base?.method ?? "POST";
  headersMethodOverride(mergedHeaders, method);

  return {
    ...base,
    ...incoming,
    method,
    headers: mergedHeaders,
  };
}

function headersMethodOverride(headers: Headers, method: string) {
  const normalized = method?.toUpperCase();
  if (normalized && normalized !== "GET" && normalized !== "POST") {
    headers.set("X-HTTP-Method-Override", normalized);
  }
}

function buildRequest(
  method: string,
  url: string,
  body: JsonLike | Uint8Array | FormData | null | undefined,
  headersInit?: HeadersInit,
): Request {
  const headers = new Headers(headersInit);
  let payload: BodyInit | null = null;

  if (
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof Uint8Array
  ) {
    payload = body as BodyInit;
  } else if (body == null) {
    payload = null;
  } else {
    payload = JSON.stringify(body);
    // Set Content-Type for JSON payloads if not already set
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
  }

  return {
    url,
    method,
    headers,
    body: payload,
  };
}
