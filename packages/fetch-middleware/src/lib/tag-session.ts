import type { Middleware } from "../middleware";

/**
 * Middleware to tag requests as protected based on URL whitelist
 *
 * @param endpoints - Array of endpoint patterns to match. Use ['*'] to match all URLs.
 * @param tags - Tags to attach to matching requests
 */
export function tagSessionMiddleware(
  endpoints: string[],
  tags: Record<string, any>,
): Middleware {
  return async (req, next, ctx) => {
    // If '*' is in endpoints, match all URLs
    if (
      endpoints.includes("*") ||
      endpoints.some((endpoint) => req.url.includes(endpoint))
    ) {
      req._meta = { ...req._meta, ...tags };
    }
    return next(req);
  };
}
