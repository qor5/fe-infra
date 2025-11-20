import type { Middleware } from "../middleware";

/**
 * Middleware to tag requests as protected based on URL whitelist
 */
export function tagSessionMiddleware(
  endpoints: string[],
  tags: Record<string, any>,
): Middleware {
  return async (req, next, ctx) => {
    if (endpoints.some((endpoint) => req.url.includes(endpoint))) {
      req._meta = { ...req._meta, ...tags };
    }
    return next(req);
  };
}
