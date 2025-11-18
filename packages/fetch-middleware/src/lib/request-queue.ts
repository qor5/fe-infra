import type {
  Middleware,
  Request,
  Next,
  SuitResponse,
  SuitContext,
} from "../middleware";

export interface MatchRuleInfo {
  request: Request;
  ctx: SuitContext;
  meta?: Record<string, any>; // Custom metadata from request (e.g., needAuth, skipQueue, etc.)
}

export interface QueueTriggerInfo {
  response: SuitResponse;
  request: Request;
  ctx: SuitContext;
  meta?: Record<string, any>; // Custom metadata from request (e.g., needAuth, skipQueue, etc.)
}

export interface RequestQueueOptions {
  // Pre-filter: check request information before making the request
  // Return true to enable queue management for this request
  // Return false to skip queue management (request proceeds normally)
  // If not provided, all requests are eligible for queue management
  matchRule?: (info: MatchRuleInfo) => boolean;
  // Determine if the response should trigger queue management
  queueTrigger: (info: QueueTriggerInfo) => boolean | Promise<boolean>;
  // Callback to handle the queue trigger (e.g., refresh session)
  // resolve = retry all queued requests
  // reject = reject all queued requests
  next: () => Promise<void>;
}

interface QueueItem {
  request: Request;
  resolve: (response: SuitResponse) => void;
  reject: (error: Error) => void;
  next: Next;
  ctx: SuitContext;
}

interface ConfigState {
  config: RequestQueueOptions;
  isRefreshing: boolean;
  requestQueue: QueueItem[];
  refreshPromise: Promise<void> | null;
}

interface PendingRequest extends QueueItem {
  id: symbol;
  internalController: AbortController;
  matchedConfigStates?: ConfigState[]; // Which configs this request matches
}

/**
 * Request queue middleware for handling authentication refresh and request retry
 *
 * Supports single or multiple queue configurations with INDEPENDENT QUEUES.
 * Each config maintains its own queue state to avoid conflicts.
 *
 * When a response triggers the queue (e.g., 401 unauthorized):
 * 1. Cancels all other pending requests that match THE SAME config
 * 2. Adds them to THE CONFIG'S independent queue while keeping their promises pending
 * 3. Calls the config's next() callback (e.g., to refresh session)
 * 4. If next() resolves: retries all requests in THIS config's queue
 * 5. If next() rejects: rejects all requests in THIS config's queue with error
 *
 * IMPORTANT: Multiple configs with overlapping matchRule will NOT interfere with each other.
 * Each config processes its own queue independently.
 *
 * @example Single configuration
 * ```typescript
 * requestQueueMiddleware({
 *   queueTrigger: ({ response }) => response.status === 401,
 *   next: async () => {
 *     await refreshSession();
 *   }
 * })
 * ```
 *
 * @example Multiple configurations
 * ```typescript
 * requestQueueMiddleware([
 *   {
 *     queueTrigger: ({ response }) => response.status === 401,
 *     next: async () => {
 *       await refreshSession();
 *     }
 *   },
 *   {
 *     queueTrigger: async ({ response }) => {
 *       if (response.status === 403) {
 *         const body = await response.clone().json();
 *         return body.code === 'PERMISSION_EXPIRED';
 *       }
 *       return false;
 *     },
 *     next: async () => {
 *       await refreshPermissions();
 *     }
 *   }
 * ])
 * ```
 *
 * @example With metadata filtering
 * ```typescript
 * requestQueueMiddleware({
 *   // Only manage requests with needAuth: true
 *   matchRule: ({ meta }) => meta?.needAuth === true,
 *   queueTrigger: ({ response }) => response.status === 401,
 *   next: async () => {
 *     await refreshSession();
 *   }
 * })
 *
 * // Usage:
 * fetchClient.get('/api/user', { meta: { needAuth: true } })  // Managed
 * fetchClient.get('/api/public')  // Not managed
 * ```
 *
 * @example Advanced filtering with URL pattern
 * ```typescript
 * requestQueueMiddleware({
 *   // Only manage requests to /api/user/* endpoints
 *   matchRule: ({ request, meta }) => {
 *     return request.url.includes('/api/user') && meta?.needAuth === true
 *   },
 *   queueTrigger: ({ response }) => response.status === 401,
 *   next: async () => {
 *     await refreshSession();
 *   }
 * })
 * ```
 *
 * @example Multiple configs with overlapping rules (SAFE - independent queues)
 * ```typescript
 * requestQueueMiddleware([
 *   {
 *     matchRule: ({ meta }) => meta?.needAuth === true,
 *     queueTrigger: ({ response }) => response.status === 401,
 *     next: async () => {
 *       await refreshSession();
 *     }
 *   },
 *   {
 *     matchRule: ({ meta }) => meta?.needPermission === true,
 *     queueTrigger: ({ response }) => response.status === 403,
 *     next: async () => {
 *       await refreshPermissions();
 *     }
 *   }
 * ])
 *
 * // Even if a request matches BOTH configs:
 * fetchClient.get('/api/admin', {
 *   meta: { needAuth: true, needPermission: true }
 * })
 * // - If it returns 401, only config 1 triggers, only its queue is used
 * // - If it returns 403, only config 2 triggers, only its queue is used
 * // - Each config processes independently, NO interference
 * ```
 */
export function requestQueueMiddleware(
  options: RequestQueueOptions | RequestQueueOptions[],
): Middleware {
  // Normalize to array
  const configs = Array.isArray(options) ? options : [options];

  // Each config has its own queue state to avoid conflicts
  const configStates: ConfigState[] = configs.map((config) => ({
    config,
    isRefreshing: false,
    requestQueue: [],
    refreshPromise: null,
  }));

  // Shared pending requests (to track and cancel)
  const pendingRequests = new Map<symbol, PendingRequest>();

  return async (request: Request, next: Next, ctx: SuitContext) => {
    // Find which config(s) this request matches
    const matchedConfigStates = configStates.filter((state) => {
      if (!state.config.matchRule) return true; // No matchRule means always match
      return state.config.matchRule({
        request,
        ctx,
        meta: request.meta,
      });
    });

    // If no config matches, skip queue management
    if (matchedConfigStates.length === 0) {
      return next(request);
    }

    // Check if any matched config is currently refreshing
    const refreshingState = matchedConfigStates.find((s) => s.isRefreshing);
    if (refreshingState) {
      // Add to the refreshing config's queue
      return new Promise<SuitResponse>((resolve, reject) => {
        refreshingState.requestQueue.push({
          request,
          resolve,
          reject,
          next,
          ctx,
        });
      });
    }

    // Create internal controller to cancel request if needed
    const requestId = Symbol("request-id");
    const internalController = new AbortController();

    // Create promise for this request
    return new Promise<SuitResponse>((resolve, reject) => {
      // Store in pending requests with matched configs
      const pendingRequest: PendingRequest = {
        id: requestId,
        internalController,
        request,
        resolve,
        reject,
        next,
        ctx,
        matchedConfigStates,
      };
      pendingRequests.set(requestId, pendingRequest);

      // Link internal abort signal with external signal
      const originalSignal = request.signal;
      if (originalSignal?.aborted) {
        internalController.abort();
      } else if (originalSignal) {
        originalSignal.addEventListener(
          "abort",
          () => {
            // External abort - cancel and reject normally
            const isAnyRefreshing = matchedConfigStates.some(
              (s) => s.isRefreshing,
            );
            if (!isAnyRefreshing) {
              internalController.abort();
            }
          },
          { once: true },
        );
      }

      // Link internal abort to reject
      internalController.signal.addEventListener(
        "abort",
        () => {
          // Only reject if not refreshing (if refreshing, we'll handle it in queue)
          const isAnyRefreshing = matchedConfigStates.some(
            (s) => s.isRefreshing,
          );
          if (!isAnyRefreshing) {
            pendingRequests.delete(requestId);
            reject(new DOMException("Request aborted", "AbortError"));
          }
        },
        { once: true },
      );

      // Execute request with internal signal
      const requestWithSignal = {
        ...request,
        signal: internalController.signal,
      };

      next(requestWithSignal)
        .then(async (response) => {
          // Check if request was already moved to queue by another request
          if (!pendingRequests.has(requestId)) {
            // Already in queue, waiting for processing
            return;
          }

          // Check if this response triggers any matched config's queue
          let triggeredConfigState: ConfigState | null = null;
          for (const state of matchedConfigStates) {
            const shouldTrigger = await state.config.queueTrigger({
              response,
              request,
              ctx,
              meta: request.meta,
            });
            if (shouldTrigger) {
              triggeredConfigState = state;
              break; // Use first matching config
            }
          }

          if (triggeredConfigState && !triggeredConfigState.isRefreshing) {
            // First trigger for this config - start refresh process
            triggeredConfigState.isRefreshing = true;

            // Cancel and move all pending requests that match THIS config
            for (const [id, pending] of pendingRequests.entries()) {
              // Check if this pending request also matches the triggered config
              const matchesThisConfig =
                pending.matchedConfigStates?.includes(triggeredConfigState);
              if (matchesThisConfig) {
                if (id !== requestId) {
                  // Abort the request
                  pending.internalController.abort();
                }
                // Move to THIS config's queue (including current request)
                triggeredConfigState.requestQueue.push({
                  request: pending.request,
                  resolve: pending.resolve,
                  reject: pending.reject,
                  next: pending.next,
                  ctx: pending.ctx,
                });
                pendingRequests.delete(id);
              }
            }

            // Start refresh with this config's callback
            triggeredConfigState.refreshPromise =
              triggeredConfigState.config.next();

            try {
              await triggeredConfigState.refreshPromise;
              // Success - retry all queued requests for this config
              await processQueue(triggeredConfigState, true);
            } catch (error) {
              // Failure - reject all queued requests for this config
              await processQueue(triggeredConfigState, false, error);
            } finally {
              // Reset state for this config
              triggeredConfigState.isRefreshing = false;
              triggeredConfigState.refreshPromise = null;
            }
          } else if (
            triggeredConfigState &&
            triggeredConfigState.isRefreshing
          ) {
            // Another request already triggered refresh for this config, add to its queue
            pendingRequests.delete(requestId);
            triggeredConfigState.requestQueue.push({
              request,
              resolve,
              reject,
              next,
              ctx,
            });
          } else {
            // Normal response - remove from pending and resolve
            pendingRequests.delete(requestId);
            resolve(response);
          }
        })
        .catch((error) => {
          // If aborted during any config's refresh, it's already in queue
          const isAnyRefreshing = matchedConfigStates.some(
            (s) => s.isRefreshing,
          );
          if (error.name === "AbortError" && isAnyRefreshing) {
            // Don't reject, wait for queue processing
            return;
          }

          // Otherwise, normal error
          pendingRequests.delete(requestId);
          reject(error);
        });
    });
  };

  async function processQueue(
    configState: ConfigState,
    success: boolean,
    error?: unknown,
  ) {
    const queue = [...configState.requestQueue];
    configState.requestQueue.length = 0; // Clear this config's queue

    if (success) {
      // Retry all requests in this config's queue
      for (const item of queue) {
        try {
          const response = await item.next(item.request);
          item.resolve(response);
        } catch (err) {
          item.reject(err as Error);
        }
      }
    } else {
      // Reject all requests in this config's queue
      const errorToThrow =
        error instanceof Error ? error : new Error("Queue processing failed");

      for (const item of queue) {
        item.reject(errorToThrow);
      }
    }
  }
}
