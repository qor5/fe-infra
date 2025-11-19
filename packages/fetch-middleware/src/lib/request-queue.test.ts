/**
 * Tests for requestQueueMiddleware
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { requestQueueMiddleware } from "./request-queue";
import type { Request, SuitContext } from "../middleware";

// Test utilities
function createMockContext(): SuitContext {
  return {
    controller: new AbortController(),
    signal: new AbortController().signal,
  };
}

function createMockRequest(url: string, meta?: Record<string, any>): Request {
  return {
    url,
    method: "GET",
    headers: {},
    body: null,
    meta,
  };
}

function createMockResponse(status: number, body?: any): Response {
  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Helper to wait for async operations
async function waitFor(ms: number = 0) {
  await vi.advanceTimersByTimeAsync(ms);
}

describe("requestQueueMiddleware", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should pass through normal requests", async () => {
    const next = vi.fn().mockResolvedValue(createMockResponse(200));
    const handler = vi.fn();
    const middleware = requestQueueMiddleware({
      queueTrigger: () => false,
      handler,
    });

    const res = await middleware(
      createMockRequest("url"),
      next,
      createMockContext(),
    );
    expect(res.status).toBe(200);
    expect(handler).not.toHaveBeenCalled();
  });

  it("should queue and retry requests after successful refresh", async () => {
    const next = vi.fn().mockImplementation(async (req: Request) => {
      if (!req.meta?._retryCount) {
        return createMockResponse(401);
      }
      return createMockResponse(200);
    });

    const handler = vi.fn().mockImplementation(async (nextCallback) => {
      await waitFor(100);
      nextCallback(true);
    });

    const middleware = requestQueueMiddleware({
      queueTrigger: ({ response }) => response.status === 401,
      handler,
    });

    const p1 = middleware(createMockRequest("url1"), next, createMockContext());

    // Wait for refresh to start
    await waitFor(50);

    // Concurrent request during refresh
    const p2 = middleware(createMockRequest("url2"), next, createMockContext());

    await waitFor(200);

    const [res1, res2] = await Promise.all([p1, p2]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    // Initial 401 + Retry 200 for url1 = 2 calls
    // Initial (intercepted) + Retry 200 for url2 = 1 call (next is not called for initial url2)
    // Total = 3 calls
    expect(next).toHaveBeenCalledTimes(3);
  });

  it("should reject all requests when refresh fails", async () => {
    const next = vi.fn().mockResolvedValue(createMockResponse(401));
    const handler = vi.fn().mockImplementation(async (nextCallback) => {
      await waitFor(100);
      nextCallback(false);
    });

    const middleware = requestQueueMiddleware({
      queueTrigger: ({ response }) => response.status === 401,
      handler,
    });

    const p1 = middleware(createMockRequest("url1"), next, createMockContext());
    // Attach expectation immediately to avoid Unhandled Rejection
    const p1Expect = expect(p1).rejects.toThrow(
      "Authentication refresh failed",
    );

    await waitFor(50);
    const p2 = middleware(createMockRequest("url2"), next, createMockContext());
    // Attach expectation immediately
    const p2Expect = expect(p2).rejects.toThrow(
      "Authentication refresh failed",
    );

    await waitFor(200);

    await Promise.all([p1Expect, p2Expect]);
  });

  it("should handle handler error as refresh failure", async () => {
    const next = vi.fn().mockResolvedValue(createMockResponse(401));
    const handler = vi.fn().mockImplementation(async () => {
      throw new Error("Handler error");
    });

    const middleware = requestQueueMiddleware({
      queueTrigger: ({ response }) => response.status === 401,
      handler,
    });

    const p1 = middleware(createMockRequest("url1"), next, createMockContext());
    const p1Expect = expect(p1).rejects.toThrow(
      "Authentication refresh failed",
    );

    await waitFor(100);

    await p1Expect;
  });

  it("should re-queue requests if retry still triggers queue (e.g. token expired again)", async () => {
    let callCount = 0;
    const next = vi.fn().mockImplementation(async (req: Request) => {
      callCount++;
      // 1. Initial 401
      // 2. Retry 1 -> 401 again
      // 3. Retry 2 -> 200
      if (req.url === "url1") {
        if (!req.meta?._retryCount) return createMockResponse(401);
        if (req.meta._retryCount === 1) return createMockResponse(401);
        return createMockResponse(200);
      }
      return createMockResponse(200);
    });

    const handler = vi.fn().mockImplementation(async (nextCallback) => {
      await waitFor(100);
      nextCallback(true);
    });

    const middleware = requestQueueMiddleware({
      queueTrigger: ({ response }) => response.status === 401,
      handler,
      maxRetries: 2,
    });

    const p1 = middleware(createMockRequest("url1"), next, createMockContext());
    await waitFor(1000); // Increase wait time for maxRetries logic
    const res = await p1;

    expect(res.status).toBe(200);
    // Handler called twice: initial 401, and retry 401
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("should give up after max retries", async () => {
    const next = vi.fn().mockResolvedValue(createMockResponse(401));
    const handler = vi.fn().mockImplementation((cb) => cb(true));

    const middleware = requestQueueMiddleware({
      queueTrigger: ({ response }) => response.status === 401,
      handler,
      maxRetries: 1,
    });

    const p = middleware(createMockRequest("url"), next, createMockContext());
    await waitFor(50);
    const res = await p;

    expect(res.status).toBe(401);
    // Initial + 1 Retry
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("should handle abort signal", async () => {
    const next = vi.fn().mockImplementation(async (req: Request) => {
      if (req.signal?.aborted) return Promise.reject(new Error("Aborted"));
      return createMockResponse(401);
    });

    const handler = vi.fn().mockImplementation(async (cb) => {
      await waitFor(100);
      cb(true);
    });

    const middleware = requestQueueMiddleware({
      queueTrigger: ({ response }) => response.status === 401,
      handler,
    });

    const ctx = createMockContext();
    const p = middleware(createMockRequest("url"), next, ctx);

    // Abort before refresh completes
    await waitFor(50);
    ctx.controller.abort();

    await waitFor(100);

    await expect(p).rejects.toThrow("Aborted");
  });

  it("should not queue if queueTrigger returns false", async () => {
    const next = vi.fn().mockResolvedValue(createMockResponse(404));
    const handler = vi.fn();

    const middleware = requestQueueMiddleware({
      queueTrigger: ({ response }) => response.status === 401,
      handler,
    });

    const res = await middleware(
      createMockRequest("url"),
      next,
      createMockContext(),
    );
    expect(res.status).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  });

  it("should handle concurrent requests correctly with parallel processing", async () => {
    const REQUEST_COUNT = 10;
    const next = vi.fn().mockImplementation(async (req: Request) => {
      if (!req.meta?._retryCount) return createMockResponse(401);
      return createMockResponse(200);
    });

    const handler = vi.fn().mockImplementation(async (cb) => {
      await waitFor(100);
      cb(true);
    });

    const middleware = requestQueueMiddleware({
      queueTrigger: ({ response }) => response.status === 401,
      handler,
    });

    const promises = Array.from({ length: REQUEST_COUNT }).map((_, i) =>
      middleware(createMockRequest(`url${i}`), next, createMockContext()),
    );

    await waitFor(200);
    const results = await Promise.all(promises);

    results.forEach((res) => expect(res.status).toBe(200));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(REQUEST_COUNT * 2); // Initial + Retry for each
  });

  it("should process new requests arriving during retry phase immediately without new refresh", async () => {
    const next = vi.fn().mockImplementation(async (req: Request) => {
      if (req.url === "url1" && !req.meta?._retryCount) {
        return createMockResponse(401);
      }
      // Simulate slow retry for url1
      if (req.url === "url1" && req.meta?._retryCount) {
        await waitFor(100);
        return createMockResponse(200);
      }
      return createMockResponse(200);
    });

    const handler = vi.fn().mockImplementation(async (cb) => {
      await waitFor(50);
      cb(true);
    });

    const middleware = requestQueueMiddleware({
      queueTrigger: ({ response }) => response.status === 401,
      handler,
    });

    // 1. Trigger refresh
    const p1 = middleware(createMockRequest("url1"), next, createMockContext());

    // Wait for refresh to complete and retry to start
    await waitFor(60); // 50ms refresh + buffer

    // 2. New request comes in DURING the retry of url1
    // (url1 retry takes 100ms, so we are in the middle of it)
    const p2 = middleware(createMockRequest("url2"), next, createMockContext());

    await waitFor(200);

    const [res1, res2] = await Promise.all([p1, p2]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    // Handler should only be called ONCE (for the initial 401)
    // The request 'url2' should be processed by the recursive processQueue call
    expect(handler).toHaveBeenCalledTimes(1);

    // url1: initial + retry
    // url2: initial (processed via queue but no retry count increment if it didn't fail)
    // Wait, url2 enters queue because isRefreshing is true (during processQueue).
    // Then processQueue picks it up.
    // processQueue calls next(requestWithRetryCount).
    // So url2 WILL have retryCount incremented even if it never failed?
    // Let's check logic: incrementRetryCount is called in processQueue.
    // Yes, any request going through queue gets retryCount + 1.
    expect(next).toHaveBeenCalledTimes(3);
  });

  it("should support async queueTrigger", async () => {
    const next = vi.fn().mockResolvedValue(createMockResponse(401));
    const handler = vi.fn();

    const middleware = requestQueueMiddleware({
      queueTrigger: async ({ response }) => {
        return Promise.resolve(response.status === 401);
      },
      handler,
    });

    // Should trigger handler
    middleware(createMockRequest("url"), next, createMockContext());
    await waitFor(50);
    expect(handler).toHaveBeenCalled();
  });

  it("should access request.meta in queueTrigger", async () => {
    const next = vi.fn().mockImplementation(async (req: Request) => {
      // Retry succeeds
      if (req.meta?._retryCount) return createMockResponse(200);
      return createMockResponse(401);
    });
    const handler = vi.fn().mockImplementation((cb) => cb(true));

    const middleware = requestQueueMiddleware({
      queueTrigger: ({ request }) => {
        return request.meta?.shouldRetry === true;
      },
      handler,
    });

    // 1. Request with meta.shouldRetry = true -> Should queue
    const p1 = middleware(
      createMockRequest("url1", { shouldRetry: true }),
      next,
      createMockContext(),
    );
    await waitFor(50);
    await p1;
    expect(handler).toHaveBeenCalledTimes(1);

    // 2. Request with meta.shouldRetry = false -> Should NOT queue
    const res = await middleware(
      createMockRequest("url2", { shouldRetry: false }),
      next,
      createMockContext(),
    );
    expect(res.status).toBe(401);
    expect(handler).toHaveBeenCalledTimes(1); // Still 1
  });
});
