import type { Middleware, Request } from "../middleware";

export type ResponseTransformer = (
  response: Response,
  request: Request,
) => Promise<Response> | Response;

/**
 * Transform the response before passing it back to the caller.
 *
 * @example
 * ```ts
 * const transformMiddleware = responseTransformMiddleware(async (response, request) => {
 *   // Add custom headers
 *   const headers = new Headers(response.headers)
 *   headers.set('X-Custom-Header', 'value')
 *   return new Response(response.body, { ...response, headers })
 * })
 * ```
 */
export function responseTransformMiddleware(
  transformer: ResponseTransformer,
): Middleware {
  return async (req, next, ctx) => {
    const res = await next(req);
    if (ctx.signal.aborted) {
      return res;
    }
    return transformer(res, req);
  };
}
