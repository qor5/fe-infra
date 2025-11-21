import {
  requestQueueMiddleware,
  type RequestQueueOptions,
} from "./request-queue";
import type { Middleware } from "../middleware";

/**
 * Interface for authentication handlers required by the refresh middleware.
 * This decouples the middleware from specific SDK implementations.
 */
export interface RefreshableAuthHandler {
  refreshSession: () => Promise<any>;
  getState: () => any;
}

/**
 * Configuration for the auth refresh middleware
 */
export interface SessionRefreshMiddlewareOptions {
  /**
   * Function to get the AuthHandler instance.
   * Using a getter allows handling circular dependencies during initialization.
   */
  getAuthHandler: () => RefreshableAuthHandler;
  /**
   * Callback when session refresh fails or is invalid.
   * Use this to clear global auth state or redirect to login.
   */
  onSessionInvalid: () => void;
  /**
   * Optional function to determine if a request should be ignored by the refresh logic.
   * Return true to skip refresh handling for this request.
   *
   * @example
   * // Ignore requests that are not marked as protected
   * ignoreRequest: (req) => !req._meta?.isProtected
   */
  ignoreRequest?: (request: any) => boolean;
  /**
   * Enable debug logging
   */
  debug?: boolean;
}

/**
 * Read current auth session expiry timestamp from the provided auth handler.
 *
 * Priority:
 * 1) auth.getState().session.expiresAt
 * 2) auth.getState().expiresAt
 */
function getAuthSessionExpiresAt(
  getAuthHandler: () => RefreshableAuthHandler,
): number | undefined {
  const state = getAuthHandler().getState();
  const session = (state as any)?.session ?? state;
  const rawExpiresAt = (session as any)?.expiresAt as unknown;

  if (typeof rawExpiresAt === "number") {
    return rawExpiresAt;
  }
  if (typeof rawExpiresAt === "string" && rawExpiresAt) {
    const n = Number(rawExpiresAt);
    if (!Number.isNaN(n)) return n;
  }

  return undefined;
}

/**
 * Determine whether the current session should be treated as expired.
 * Adds a small safety margin (1s) to account for clock skew and network delay.
 */
function isSessionExpired(
  getAuthHandler: () => RefreshableAuthHandler,
): boolean {
  const expiresAt = getAuthSessionExpiresAt(getAuthHandler);
  // Treat session as expired if it will expire within the next second (safety margin)
  return !!(expiresAt && expiresAt < Date.now() + 1000);
}

/**
 * Creates a middleware that handles automatic session refreshing for REST clients.
 * It uses the standard requestQueueAuthHandlePreset suitable for general HTTP requests.
 *
 * @example
 * ```ts
 * const sessionRefreshMiddleware = createSessionRefreshMiddleware({
 *   getAuthHandler: () => ciamHandlers,
 *   onSessionInvalid: () => useAuthStore.getState().clearAuth(),
 *   // Only handle requests with _meta.isProtected = true
 *   ignoreRequest: (req) => !req._meta?.isProtected
 * })
 * ```
 */
export function createSessionRefreshMiddleware(
  options: SessionRefreshMiddlewareOptions,
): Middleware {
  const {
    getAuthHandler,
    onSessionInvalid,
    ignoreRequest,
    debug = false,
  } = options;

  // Build queue options inline instead of using a preset helper
  const queueOptions: RequestQueueOptions = {
    // Trigger on:
    // - Any 401 response
    // - Or when the current session is already expired
    queueTrigger: (info) => {
      if (ignoreRequest && ignoreRequest(info.request)) return false;
      if (info.response.status === 401) return true;
      if (isSessionExpired(getAuthHandler)) return true;
      return false;
    },
    handler: async (next) => {
      try {
        await getAuthHandler().refreshSession();
        next(true);
      } catch (error) {
        onSessionInvalid();
        next(false);
      }
    },
    debug,
  };

  // Apply custom ignore logic if provided
  if (ignoreRequest) {
    queueOptions.ignore = ignoreRequest;
  }

  return requestQueueMiddleware(queueOptions);
}
