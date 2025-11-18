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
  // Handler to process the queue trigger (e.g., refresh session)
  // Call next() when ready to retry all queued requests
  // If next() is never called, requests will be blocked forever
  handler: (next: () => void) => void | Promise<void>;
  // Maximum number of retries before giving up (default: 1)
  // This prevents infinite loops when refresh fails or retry still returns error
  maxRetries?: number;
  // Enable debug logging (default: false)
  // When true, logs detailed information about request queuing and retrying
  debug?: boolean;
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
  addedToQueue: boolean; // Track if already added to queue to prevent duplicates
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
 *   handler: async (next) => {
 *     await refreshSession();
 *     next(); // Call next to resume queue processing
 *   },
 *   maxRetries: 1, // Retry once, then give up
 *   debug: true, // Enable debug logging (default: false)
 * })
 * ```
 *
 * @example Multiple configurations
 * ```typescript
 * requestQueueMiddleware([
 *   {
 *     queueTrigger: ({ response }) => response.status === 401,
 *     handler: async (next) => {
 *       await refreshSession();
 *       next(); // Resume queue processing
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
 *     handler: async (next) => {
 *       await refreshPermissions();
 *       next(); // Resume queue processing
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
 *   handler: async (next) => {
 *     await refreshSession();
 *     next(); // Resume queue processing
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
 *   handler: async (next) => {
 *     await refreshSession();
 *     next(); // Resume queue processing
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
 *     handler: async (next) => {
 *       await refreshSession();
 *       next();
 *     }
 *   },
 *   {
 *     matchRule: ({ meta }) => meta?.needPermission === true,
 *     queueTrigger: ({ response }) => response.status === 403,
 *     handler: async (next) => {
 *       await refreshPermissions();
 *       next();
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
  const configs = Array.isArray(options) ? options : [options];
  const REFRESH_START_DELAY_MS = 10; // Delay to catch concurrent 401 responses

  const configStates: ConfigState[] = configs.map((config) => ({
    config,
    isRefreshing: false,
    requestQueue: [],
    refreshPromise: null,
  }));

  const pendingRequests = new Map<symbol, PendingRequest>();
  const isDebugEnabled = configs.some((config) => config.debug === true);
  const debug = (...args: any[]) => {
    if (isDebugEnabled) console.log("[RequestQueue]", ...args);
  };

  const createFreshRequestContext = (
    request: Request,
    ctx: SuitContext,
  ): Request => {
    const freshController = new AbortController();
    ctx.controller = freshController;
    ctx.signal = freshController.signal;
    return { ...request, signal: undefined };
  };

  const addToQueue = (
    configState: ConfigState,
    request: Request,
    resolve: (response: SuitResponse) => void,
    reject: (error: Error) => void,
    next: Next,
    ctx: SuitContext,
  ) => {
    configState.requestQueue.push({ request, resolve, reject, next, ctx });
  };

  const startRefreshHandler = (configState: ConfigState): Promise<void> => {
    return new Promise((resolve, reject) => {
      const next = () => resolve();
      const result = configState.config.handler(next);
      if (result instanceof Promise) result.catch(reject);
    });
  };

  const incrementRetryCount = (request: Request): Request => {
    const currentRetryCount = (request.meta?._retryCount as number) || 0;
    return {
      ...request,
      meta: { ...request.meta, _retryCount: currentRetryCount + 1 },
    };
  };

  return async (request: Request, next: Next, ctx: SuitContext) => {
    const matchedConfigStates = configStates.filter((state) => {
      if (!state.config.matchRule) return true;
      return state.config.matchRule({ request, ctx, meta: request.meta });
    });

    if (matchedConfigStates.length === 0) return next(request);

    // If refresh in progress, queue immediately
    const refreshingState = matchedConfigStates.find((s) => s.isRefreshing);
    if (refreshingState) {
      debug(`Request starting during refresh, adding to queue: ${request.url}`);
      return new Promise<SuitResponse>((resolve, reject) => {
        const freshRequest = createFreshRequestContext(request, ctx);
        addToQueue(refreshingState, freshRequest, resolve, reject, next, ctx);
      });
    }

    const requestId = Symbol("request-id");
    const internalController = new AbortController();

    return new Promise<SuitResponse>((resolve, reject) => {
      const pendingRequest: PendingRequest = {
        id: requestId,
        internalController,
        request,
        resolve,
        reject,
        next,
        ctx,
        matchedConfigStates,
        addedToQueue: false,
      };
      pendingRequests.set(requestId, pendingRequest);
      debug(
        `Request started, added to pending: ${request.url} (total pending: ${pendingRequests.size})`,
      );

      // Link external abort signal (don't cancel if refreshing)
      const originalSignal = request.signal;
      if (originalSignal?.aborted) {
        internalController.abort();
      } else if (originalSignal) {
        originalSignal.addEventListener(
          "abort",
          () => {
            const isAnyRefreshing = matchedConfigStates.some(
              (s) => s.isRefreshing,
            );
            if (!isAnyRefreshing) internalController.abort();
          },
          { once: true },
        );
      }

      const requestWithSignal = {
        ...request,
        signal: internalController.signal,
      };

      next(requestWithSignal)
        .then(async (response) => {
          debug(
            `Response received for: ${request.url}, status=${response.status}, addedToQueue=${pendingRequest.addedToQueue}`,
          );

          if (pendingRequest.addedToQueue) {
            debug(`Request already queued, skipping: ${request.url}`);
            return;
          }

          // Race condition guard: Check if refresh started while response was in-flight
          const alreadyRefreshing = matchedConfigStates.find(
            (s) => s.isRefreshing,
          );
          if (alreadyRefreshing) {
            const shouldQueue = await alreadyRefreshing.config.queueTrigger({
              response,
              request,
              ctx,
              meta: request.meta,
            });

            if (shouldQueue) {
              debug(
                `Response triggers queue during refresh, adding: ${request.url}`,
              );
              pendingRequest.addedToQueue = true;
              const freshRequest = createFreshRequestContext(request, ctx);
              addToQueue(
                alreadyRefreshing,
                freshRequest,
                resolve,
                reject,
                next,
                ctx,
              );
              return;
            }
          }

          // Check if this response should trigger refresh
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
              break;
            }
          }

          if (triggeredConfigState && !triggeredConfigState.isRefreshing) {
            const retryCount = (request.meta?._retryCount as number) || 0;
            const maxRetries = triggeredConfigState.config.maxRetries ?? 1;

            if (retryCount >= maxRetries) {
              debug(
                `Max retries (${maxRetries}) reached for: ${request.url}, giving up`,
              );
              pendingRequests.delete(requestId);
              resolve(response);
              return;
            }

            debug(
              `Trigger detected, starting refresh for: ${request.url} (retry ${retryCount}/${maxRetries})`,
            );

            // Set flag first to catch other in-flight responses
            triggeredConfigState.isRefreshing = true;
            await new Promise((resolve) =>
              setTimeout(resolve, REFRESH_START_DELAY_MS),
            );

            // Collect and cancel matching pending requests
            const toQueue: PendingRequest[] = [];
            debug(`Scanning ${pendingRequests.size} pending requests...`);
            for (const pending of pendingRequests.values()) {
              const matchesThisConfig =
                pending.matchedConfigStates?.includes(triggeredConfigState);
              debug(
                `  - ${pending.request.url}: matches=${matchesThisConfig}, addedToQueue=${pending.addedToQueue}`,
              );
              if (matchesThisConfig && !pending.addedToQueue) {
                toQueue.push(pending);
                pending.addedToQueue = true;
              }
            }

            debug(
              `Collected ${toQueue.length} requests to queue and cancel (from ${pendingRequests.size} pending)`,
            );

            // Abort then move to retry queue
            for (const pending of toQueue) {
              debug(`Canceling request: ${pending.request.url}`);
              pending.internalController.abort();
            }

            for (const pending of toQueue) {
              debug(`Adding to retry queue: ${pending.request.url}`);
              const freshRequest = createFreshRequestContext(
                pending.request,
                pending.ctx,
              );
              addToQueue(
                triggeredConfigState,
                freshRequest,
                pending.resolve,
                pending.reject,
                pending.next,
                pending.ctx,
              );
            }

            // Execute refresh and process queue
            debug(`Starting refresh...`);
            triggeredConfigState.refreshPromise =
              startRefreshHandler(triggeredConfigState);

            try {
              await triggeredConfigState.refreshPromise;
              debug(
                `Refresh success, replaying ${triggeredConfigState.requestQueue.length} requests`,
              );
              await processQueue(triggeredConfigState, true);
            } catch (error) {
              debug(
                `Refresh failed, rejecting ${triggeredConfigState.requestQueue.length} requests`,
              );
              await processQueue(triggeredConfigState, false, error);
            } finally {
              triggeredConfigState.isRefreshing = false;
              triggeredConfigState.refreshPromise = null;
            }
          } else if (
            triggeredConfigState &&
            triggeredConfigState.isRefreshing
          ) {
            debug(`Trigger during refresh, adding to queue: ${request.url}`);
            pendingRequest.addedToQueue = true;
            const freshRequest = createFreshRequestContext(request, ctx);
            addToQueue(
              triggeredConfigState,
              freshRequest,
              resolve,
              reject,
              next,
              ctx,
            );
          } else {
            pendingRequests.delete(requestId);
            debug(
              `✅ Request completed successfully: ${request.url} (status=${response.status}, remaining: ${pendingRequests.size})`,
            );
            resolve(response);
          }
        })
        .catch((error) => {
          if (error.name === "AbortError" && pendingRequest.addedToQueue) {
            debug(`Request aborted for retry: ${request.url}`);
            return;
          }

          pendingRequests.delete(requestId);
          debug(`Request failed: ${request.url}, error=${error.message}`);
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
    configState.requestQueue.length = 0;

    debug(`Processing queue: ${queue.length} requests, success=${success}`);

    if (success) {
      for (const item of queue) {
        try {
          debug(`Retrying request: ${item.request.url}`);
          const requestWithRetryCount = incrementRetryCount(item.request);
          const response = await item.next(requestWithRetryCount);
          debug(
            `Retry success: ${item.request.url}, status=${response.status}`,
          );

          const shouldTriggerAgain = await configState.config.queueTrigger({
            response,
            request: requestWithRetryCount,
            ctx: item.ctx,
            meta: requestWithRetryCount.meta,
          });

          if (shouldTriggerAgain) {
            const retryCount =
              (requestWithRetryCount.meta?._retryCount as number) || 0;
            const maxRetries = configState.config.maxRetries ?? 1;

            if (retryCount >= maxRetries) {
              debug(
                `Max retries (${maxRetries}) reached for: ${item.request.url}, giving up`,
              );
              item.resolve(response);
            } else {
              debug(
                `Retry still triggers queue for: ${item.request.url} (retry ${retryCount}/${maxRetries}), re-queueing`,
              );
              configState.requestQueue.push({
                ...item,
                request: requestWithRetryCount,
              });
            }
          } else {
            item.resolve(response);
          }
        } catch (err) {
          debug(
            `Retry failed: ${item.request.url}, error=${(err as Error).message}`,
          );
          item.reject(err as Error);
        }
      }

      // Recursive processing if retry triggered again
      if (configState.requestQueue.length > 0) {
        debug(
          `Retry triggered queue again (${configState.requestQueue.length} requests), starting refresh...`,
        );
        configState.refreshPromise = startRefreshHandler(configState);

        try {
          await configState.refreshPromise;
          debug(
            `Refresh success, replaying ${configState.requestQueue.length} requests`,
          );
          await processQueue(configState, true);
        } catch (error) {
          debug(
            `Refresh failed, rejecting ${configState.requestQueue.length} requests`,
          );
          await processQueue(configState, false, error);
        }
      }
    } else {
      const errorToThrow =
        error instanceof Error ? error : new Error("Queue processing failed");
      for (const item of queue) {
        debug(`Rejecting request: ${item.request.url}`);
        item.reject(errorToThrow);
      }
    }
  }
}
