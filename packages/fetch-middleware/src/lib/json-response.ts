import type { Middleware } from "../middleware";

/**
 * JSON response middleware
 *
 * Features:
 * - Automatically sets Accept: application/json header if not present
 * - Parses JSON response and attaches to _body property
 * - Validates that response is application/json
 * - Handles empty bodies (204, 205, 304)
 *
 * Keeps the original Response object intact and only adds properties:
 * - _body: parsed JSON data
 * - Business code can access res._body for parsed data
 * - Error handling middlewares can still access all Response properties
 *
 * This ensures every middleware receives the native fetch Response object.
 *
 * @example
 * ```ts
 * const client = createFetchClient({
 *   middlewares: [jsonResponseMiddleware()],
 * })
 * ```
 */
export function jsonResponseMiddleware(): Middleware {
  return async (req, next, ctx) => {
    // Set Accept header if not already set
    const headers = new Headers(req.headers);
    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }

    // Pass the request with updated headers
    const res = await next({ ...req, headers });
    if (ctx.signal.aborted) return res;

    // Skip bodies that are defined as empty by spec
    if (res.status === 204 || res.status === 205 || res.status === 304) {
      return res;
    }

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      try {
        const parsed = await res.clone().json();

        // Attach parsed data to the original Response object
        (res as any)._body = parsed;

        return res;
      } catch (e) {
        const error = new Error("Invalid JSON response body");
        (error as any).status = res.status;
        (error as any).url = req.url;
        (error as any).response = res;
        throw error;
      }
    }

    const error = new Error("Expected application/json response");
    (error as any).status = res.status;
    (error as any).url = req.url;
    (error as any).contentType = ct;
    (error as any).response = res;
    throw error;
  };
}
