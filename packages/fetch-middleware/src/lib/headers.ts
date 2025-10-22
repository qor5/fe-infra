import type { Middleware } from "../middleware";

/**
 * Add or mutate headers.
 *
 * @example
 * ```ts
 * const authMiddleware = headersMiddleware((headers) => {
 *   headers.set('Authorization', `Bearer ${token}`)
 * })
 * ```
 */
export function headersMiddleware(
  builder: (headers: Headers) => void,
): Middleware {
  return async (req, next) => {
    const headers = new Headers(req.headers);
    builder(headers);
    return next({ ...req, headers });
  };
}
