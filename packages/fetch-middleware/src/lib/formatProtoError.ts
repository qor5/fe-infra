import type { Middleware } from "../middleware";
import {
  UnauthorizedError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
  ServiceError,
  AppError,
} from "../utils/proto-errors";

/**
 * Middleware that validates HTTP status and throws appropriate errors
 * Reference: ConnectComponent.tsx validateStatus function
 *
 * For Proto (ProTTP) responses, parses the protobuf ValidationError and throws typed errors.
 * For JSON (Connect) responses, lets connect-es handle the error parsing.
 *
 * These errors will be caught by connect-es and wrapped in ConnectError,
 * but the original error with parsed ValidationError is preserved in the cause chain.
 *
 * @returns Middleware that validates response status
 */
export function formatProtoErrorMiddleware(): Middleware {
  return async (req, next, ctx) => {
    const res = await next(req);

    const response = res as Response;
    const { status, url } = response;
    const contentType = response.headers.get("Content-Type");

    // For JSON errors (Connect style), let connect-es handle it
    if (
      contentType?.includes("application/json") &&
      (status < 200 || status > 299)
    ) {
      return response;
    }

    // For Proto errors (ProTTP style), parse and throw typed errors
    if (status >= 500) {
      const body = await response.arrayBuffer();
      throw new ServiceError(url, new Uint8Array(body));
    } else if (status === 401) {
      const body = await response.arrayBuffer();
      throw new UnauthorizedError(url, new Uint8Array(body));
    } else if (status === 403) {
      const body = await response.arrayBuffer();
      throw new AuthenticationError(url, new Uint8Array(body));
    } else if (status === 404) {
      const body = await response.arrayBuffer();
      throw new NotFoundError(url, new Uint8Array(body));
    } else if (status === 422) {
      const body = await response.arrayBuffer();
      throw new ValidationError(new Uint8Array(body), url);
    } else if (status !== 200) {
      const body = await response.arrayBuffer();
      throw new AppError(url, new Uint8Array(body));
    }

    return response;
  };
}
