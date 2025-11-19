export type Request = {
  url: string;
  method: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
  signal?: AbortSignal;
  _meta?: Record<string, any>; // Internal metadata stripped before request (for middlewares)
};

export type SuitResponse = Response;

export type SuitContext = {
  controller: AbortController;
  signal: AbortSignal;
};

export type CancelablePromise<T> = Promise<T> & {
  cancel: () => void;
  controller: AbortController;
  signal: AbortSignal;
};

export type Next = (request: Request) => Promise<SuitResponse>;

export type Middleware = (
  request: Request,
  next: Next,
  ctx: SuitContext,
) => Promise<SuitResponse>;

export type ComposeOptions = {
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

/**
 * Compose middlewares into a single handler (onion model).
 */
export function composeMiddlewares(
  middlewares: Middleware[],
  options: ComposeOptions = {},
) {
  const baseFetch = options.fetcher ?? ((input, init) => fetch(input, init));

  const attachCancel = <T>(
    promise: Promise<T>,
    ctx: SuitContext,
  ): CancelablePromise<T> => {
    const cancelable = promise as CancelablePromise<T>;
    cancelable.cancel = () => ctx.controller.abort();
    cancelable.controller = ctx.controller;
    cancelable.signal = ctx.signal;
    return cancelable;
  };

  const dispatch = (
    index: number,
    req: Request,
    ctx: SuitContext,
  ): Promise<SuitResponse> => {
    const signal = req.signal ?? ctx.signal;
    if (req.signal && req.signal !== ctx.signal) {
      if (req.signal.aborted) {
        ctx.controller.abort();
      } else {
        req.signal.addEventListener("abort", () => ctx.controller.abort(), {
          once: true,
        });
      }
    }
    const enrichedRequest = req.signal ? req : { ...req, signal };

    if (index === middlewares.length) {
      return baseFetch(enrichedRequest.url, {
        method: enrichedRequest.method,
        headers: enrichedRequest.headers,
        body: enrichedRequest.body,
        signal: enrichedRequest.signal ?? ctx.signal,
      });
    }

    const mw = middlewares[index];
    return mw(
      enrichedRequest,
      (nextReq) => dispatch(index + 1, nextReq, ctx),
      ctx,
    );
  };

  return (req: Request): CancelablePromise<SuitResponse> => {
    const controller = new AbortController();
    const ctx: SuitContext = {
      controller,
      signal: controller.signal,
    };

    const promise = dispatch(0, req, ctx);
    return attachCancel(promise, ctx);
  };
}
