import type {
  Middleware,
  Request,
  Next,
  SuitResponse,
  SuitContext,
} from "../middleware";

export interface QueueTriggerInfo {
  response: SuitResponse;
  request: Request;
  ctx: SuitContext;
}

export interface RequestQueueOptions {
  // Determine if the response should trigger queue management
  // Return true to trigger queue management and retry this request
  // Return false to skip queue management (request completes normally)
  queueTrigger: (info: QueueTriggerInfo) => boolean | Promise<boolean>;
  // Handler to process the queue trigger (e.g., refresh session)
  // Call next(true) to retry all queued requests after successful refresh
  // Call next(false) to reject all queued requests, but resolve the first one with original error
  // If next() is never called, requests will be blocked forever
  handler: (next: (success: boolean) => void) => void | Promise<void>;
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
  originalSignal?: AbortSignal;
}

interface PendingRequest extends QueueItem {
  id: symbol;
  internalController: AbortController;
  addedToQueue: boolean; // Track if already added to queue to prevent duplicates
}

/**
 * Request queue middleware for handling authentication refresh and request retry
 *
 * When a response triggers the queue (determined by queueTrigger, e.g., 401 unauthorized):
 * 1. Cancels all other pending requests
 * 2. Adds them to the queue while keeping their promises pending
 * 3. Calls the handler with next() callback (e.g., to refresh session)
 * 4. If handler calls next(true): retries all requests in the queue
 * 5. If handler calls next(false): rejects all requests in the queue
 */
export function requestQueueMiddleware(
  options: RequestQueueOptions,
): Middleware {
  const config = options;
  const REFRESH_START_DELAY_MS = 10; // Delay to catch concurrent 401 responses

  let isRefreshing = false;
  const requestQueue: QueueItem[] = [];
  let refreshPromise: Promise<boolean> | null = null;

  const pendingRequests = new Map<symbol, PendingRequest>();
  const debug = (...args: any[]) => {
    if (config.debug) console.log("[RequestQueue]", ...args);
  };

  const createFreshRequestContext = (
    request: Request,
    ctx: SuitContext,
  ): Request => {
    const freshController = new AbortController();
    ctx.controller = freshController;
    ctx.signal = freshController.signal;
    return { ...request, signal: ctx.signal };
  };

  const addToQueue = (
    request: Request,
    resolve: (response: SuitResponse) => void,
    reject: (error: Error) => void,
    next: Next,
    ctx: SuitContext,
  ) => {
    requestQueue.push({ request, resolve, reject, next, ctx });
  };

  const startRefreshHandler = (): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      const next = (success: boolean) => resolve(success);
      const result = config.handler(next);
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
    // If refreshing, queue immediately
    if (isRefreshing) {
      debug(`Request starting during refresh, adding to queue: ${request.url}`);
      return new Promise<SuitResponse>((resolve, reject) => {
        const freshRequest = createFreshRequestContext(request, ctx);
        addToQueue(freshRequest, resolve, reject, next, ctx);
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
        addedToQueue: false,
      };
      pendingRequests.set(requestId, pendingRequest);
      debug(
        `Request started, added to pending: ${request.url} (total pending: ${pendingRequests.size})`,
      );

      // Link external abort signal
      const originalSignal = request.signal;
      if (originalSignal?.aborted) {
        internalController.abort();
      } else if (originalSignal) {
        originalSignal.addEventListener(
          "abort",
          () => {
            internalController.abort();
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
          if (isRefreshing) {
            const shouldQueue = await config.queueTrigger({
              response,
              request,
              ctx,
            });

            if (shouldQueue) {
              debug(
                `Response triggers queue during refresh, adding: ${request.url}`,
              );
              pendingRequest.addedToQueue = true;
              const freshRequest = createFreshRequestContext(request, ctx);
              addToQueue(freshRequest, resolve, reject, next, ctx);
              return;
            }
          }

          // Check if this response should trigger refresh
          const shouldTrigger = await config.queueTrigger({
            response,
            request,
            ctx,
          });

          if (shouldTrigger && !isRefreshing) {
            const retryCount = (request.meta?._retryCount as number) || 0;
            const maxRetries = config.maxRetries ?? 1;

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
            isRefreshing = true;
            await new Promise((resolve) =>
              setTimeout(resolve, REFRESH_START_DELAY_MS),
            );

            // Collect and cancel all pending requests
            const toQueue: PendingRequest[] = [];
            debug(`Scanning ${pendingRequests.size} pending requests...`);
            for (const pending of pendingRequests.values()) {
              debug(
                `  - ${pending.request.url}: addedToQueue=${pending.addedToQueue}`,
              );
              if (!pending.addedToQueue) {
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

            // Prepend pending requests to requestQueue to maintain order
            // (pending requests are older than requests arrived during the delay)
            for (let i = toQueue.length - 1; i >= 0; i--) {
              const pending = toQueue[i];
              debug(`Adding to retry queue: ${pending.request.url}`);
              const freshRequest = createFreshRequestContext(
                pending.request,
                pending.ctx,
              );
              requestQueue.unshift({
                request: freshRequest,
                resolve: pending.resolve,
                reject: pending.reject,
                next: pending.next,
                ctx: pending.ctx,
              });
            }

            // Execute refresh and process queue
            debug(`Starting refresh...`);
            refreshPromise = startRefreshHandler();

            try {
              const success = await refreshPromise;
              if (success) {
                debug(
                  `Refresh success, replaying ${requestQueue.length} requests`,
                );
                await processQueue(true);
              } else {
                debug(
                  `Refresh failed, resolving first request with error, rejecting others (${requestQueue.length} requests)`,
                );
                await processQueue(false);
              }
            } catch (error) {
              debug(
                `Handler error, resolving first request with error, rejecting others (${requestQueue.length} requests)`,
              );
              await processQueue(false);
            } finally {
              isRefreshing = false;
              refreshPromise = null;
            }
          } else if (isRefreshing) {
            debug(`Trigger during refresh, adding to queue: ${request.url}`);
            pendingRequest.addedToQueue = true;
            const freshRequest = createFreshRequestContext(request, ctx);
            addToQueue(freshRequest, resolve, reject, next, ctx);
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

  async function processQueue(success: boolean) {
    const queue = [...requestQueue];
    requestQueue.length = 0;

    debug(`Processing queue: ${queue.length} requests, success=${success}`);

    if (success) {
      let needRefresh = false; // Track if any retry triggers queueTrigger

      // Process queue concurrently
      await Promise.all(
        queue.map(async (item) => {
          try {
            debug(`Retrying request: ${item.request.url}`);
            const requestWithRetryCount = incrementRetryCount(item.request);
            const response = await item.next(requestWithRetryCount);
            debug(
              `Retry success: ${item.request.url}, status=${response.status}`,
            );

            const shouldTriggerAgain = await config.queueTrigger({
              response,
              request: requestWithRetryCount,
              ctx: item.ctx,
            });

            if (shouldTriggerAgain) {
              const retryCount =
                (requestWithRetryCount.meta?._retryCount as number) || 0;
              const maxRetries = config.maxRetries ?? 1;

              if (retryCount >= maxRetries) {
                debug(
                  `Max retries (${maxRetries}) reached for: ${item.request.url}, giving up`,
                );
                item.resolve(response);
              } else {
                debug(
                  `Retry still triggers queue for: ${item.request.url} (retry ${retryCount}/${maxRetries}), re-queueing`,
                );
                requestQueue.push({
                  ...item,
                  request: requestWithRetryCount,
                });
                needRefresh = true; // Mark that we need another refresh
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
        }),
      );

      // Check if there are new requests in queue
      // These could be from two sources:
      // 1. Requests that triggered queueTrigger again (needRefresh = true)
      // 2. New requests that arrived during processQueue (needRefresh = false)
      if (requestQueue.length > 0) {
        if (needRefresh) {
          // Case 1: Retry triggered queueTrigger again - need to call handler
          debug(
            `Retry triggered queue again (${requestQueue.length} requests), starting refresh...`,
          );
          refreshPromise = startRefreshHandler();

          try {
            const retrySuccess = await refreshPromise;
            if (retrySuccess) {
              debug(
                `Refresh success, replaying ${requestQueue.length} requests`,
              );
              await processQueue(true);
            } else {
              debug(
                `Refresh failed, resolving first request with error, rejecting others (${requestQueue.length} requests)`,
              );
              await processQueue(false);
            }
          } catch (error) {
            debug(
              `Handler error, resolving first request with error, rejecting others (${requestQueue.length} requests)`,
            );
            await processQueue(false);
          }
        } else {
          // Case 2: New requests arrived during processQueue - directly retry without calling handler
          debug(
            `New requests arrived during processQueue (${requestQueue.length} requests), retrying directly...`,
          );
          await processQueue(true);
        }
      }
    } else {
      // Refresh failed: reject all requests
      const errorToThrow = new Error("Authentication refresh failed");
      for (const item of queue) {
        debug(`Rejecting request: ${item.request.url}`);
        item.reject(errorToThrow);
      }
    }
  }
}
