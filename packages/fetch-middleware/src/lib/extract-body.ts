import type { Middleware } from "../middleware";

/**
 * Extract _body from Response and return it as the final result
 *
 * This middleware extracts the parsed JSON data from the _body property
 * (added by jsonResponseMiddleware) and returns it as the final result.
 *
 * This is useful for REST clients that expect parsed data instead of Response objects.
 *
 * @example
 * ```ts
 * const client = createRestClient({
 *   middlewares: [
 *     jsonResponseMiddleware(),  // Parse JSON and attach to _body
 *     extractBodyMiddleware(),   // Extract _body as final result
 *   ],
 * })
 *
 * // Returns parsed data directly
 * const data = await client.get('/api/users')
 * console.log(data) // { users: [...] }
 * ```
 */
export function extractBodyMiddleware(): Middleware {
  return async (req, next) => {
    const res = await next(req);

    // Extract _body from Response (added by jsonResponseMiddleware)
    // and return it as the final result for REST clients
    if ((res as any)._body !== undefined) {
      return (res as any)._body;
    }

    // If no _body, return the Response as-is
    return res;
  };
}
