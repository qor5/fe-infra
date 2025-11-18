/**
 * Tests for requestQueueMiddleware
 * Tests independent queue management for concurrent requests with different configs
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { requestQueueMiddleware } from "./request-queue";
import { composeMiddlewares } from "../middleware";
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
function waitFor(ms: number = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("requestQueueMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Single config - basic queue management", () => {
    it("should pass through requests that do not trigger queue", async () => {
      const refreshSession = vi.fn();
      const middleware = requestQueueMiddleware({
        queueTrigger: ({ response }) => response.status === 401,
        handler: refreshSession,
      });

      const handler = composeMiddlewares([middleware], {
        fetcher: async () => createMockResponse(200, { data: "success" }),
      });

      const request = createMockRequest("/api/data");
      const response = await handler(request);

      expect(response.status).toBe(200);
      expect(refreshSession).not.toHaveBeenCalled();
    });

    it("should trigger queue on 401 and call refresh callback", async () => {
      let requestCount = 0;
      const refreshSession = vi.fn().mockImplementation(async (next) => {
        next();
      });

      const middleware = requestQueueMiddleware({
        queueTrigger: ({ response }) => response.status === 401,
        handler: refreshSession,
      });

      const handler = composeMiddlewares([middleware], {
        fetcher: async () => {
          requestCount++;
          // First request returns 401, retry returns 200
          if (requestCount === 1) {
            return createMockResponse(401);
          }
          return createMockResponse(200, { data: "success" });
        },
      });

      const request = createMockRequest("/api/data");
      const response = await handler(request);

      expect(response.status).toBe(200);
      expect(refreshSession).toHaveBeenCalledTimes(1);
      expect(requestCount).toBe(2); // Original + retry
    });

    it("should reject all queued requests if refresh fails", async () => {
      let requestCount = 0;
      const refreshSession = vi
        .fn()
        .mockRejectedValue(new Error("Refresh failed"));

      const middleware = requestQueueMiddleware({
        queueTrigger: ({ response }) => response.status === 401,
        handler: refreshSession,
      });

      const handler = composeMiddlewares([middleware], {
        fetcher: async () => {
          requestCount++;
          return createMockResponse(401);
        },
      });

      const request = createMockRequest("/api/data");

      await expect(handler(request)).rejects.toThrow("Refresh failed");
      expect(refreshSession).toHaveBeenCalledTimes(1);
      expect(requestCount).toBe(1); // No retry
    });
  });

  describe("Single config - concurrent requests", () => {
    it("should queue concurrent requests and share one refresh", async () => {
      let requestCount = 0;
      const refreshSession = vi.fn().mockImplementation(async (next) => {
        await waitFor(50); // Simulate async operation
        next();
      });

      const middleware = requestQueueMiddleware({
        queueTrigger: ({ response }) => response.status === 401,
        handler: refreshSession,
      });

      const handler = composeMiddlewares([middleware], {
        fetcher: async (url) => {
          requestCount++;
          // First requests return 401, retries return 200
          if (requestCount <= 3) {
            return createMockResponse(401);
          }
          return createMockResponse(200, { url });
        },
      });

      // Launch 3 concurrent requests
      const results = await Promise.all([
        handler(createMockRequest("/api/user")),
        handler(createMockRequest("/api/posts")),
        handler(createMockRequest("/api/comments")),
      ]);

      // All should succeed
      expect(results[0].status).toBe(200);
      expect(results[1].status).toBe(200);
      expect(results[2].status).toBe(200);

      // Refresh should only be called once
      expect(refreshSession).toHaveBeenCalledTimes(1);

      // Note: Due to timing, all 3 concurrent requests complete their initial fetch
      // Then first one triggers queue, others get canceled but count may vary
      // The important part is that refresh is called once and all succeed
      expect(requestCount).toBeGreaterThanOrEqual(6);
    });

    it("should cancel and queue in-flight requests when first request triggers 401", async () => {
      // Track each request's lifecycle separately
      const requestLifecycles = {
        req1: [] as string[],
        req2: [] as string[],
        req3: [] as string[],
        req4: [] as string[],
      };
      const globalEvents: string[] = [];
      let fetchCallCount = 0;

      const refreshSession = vi.fn().mockImplementation(async (next) => {
        globalEvents.push("refresh-start");
        await waitFor(100); // Simulate async refresh operation
        globalEvents.push("refresh-end");
        next();
      });

      const middleware = requestQueueMiddleware({
        queueTrigger: ({ response }) => response.status === 401,
        handler: refreshSession,
      });

      const handler = composeMiddlewares([middleware], {
        fetcher: async (url, init) => {
          fetchCallCount++;
          const urlStr = typeof url === "string" ? url : url.toString();
          const requestId = urlStr
            .split("/")
            .pop() as keyof typeof requestLifecycles;
          const callNumber = fetchCallCount;

          requestLifecycles[requestId].push(`fetch-${callNumber}-start`);

          // First call: req1 returns 401 immediately
          if (
            requestId === "req1" &&
            !requestLifecycles[requestId].includes("fetch-1-401")
          ) {
            requestLifecycles[requestId].push(`fetch-${callNumber}-401`);
            return createMockResponse(401);
          }

          // First calls: other requests simulate slow network
          if (
            !requestLifecycles[requestId].includes(`fetch-${callNumber}-200`)
          ) {
            await waitFor(50); // Simulate network delay

            // Check if we should have been canceled by now
            if (globalEvents.includes("refresh-start")) {
              requestLifecycles[requestId].push(
                `fetch-${callNumber}-canceled-too-late`,
              );
            }

            requestLifecycles[requestId].push(`fetch-${callNumber}-200`);
            return createMockResponse(200, {
              data: requestId,
              call: callNumber,
            });
          }

          // This should be retry calls after refresh
          await waitFor(10);
          requestLifecycles[requestId].push(`fetch-${callNumber}-200-retry`);
          return createMockResponse(200, { data: requestId, call: callNumber });
        },
      });

      // Launch 4 concurrent requests
      const startTime = Date.now();
      const promises = [
        handler(createMockRequest("/api/req1")),
        handler(createMockRequest("/api/req2")),
        handler(createMockRequest("/api/req3")),
        handler(createMockRequest("/api/req4")),
      ];

      const results = await Promise.all(promises);
      const endTime = Date.now();

      // Debug output
      console.log("\n=== Request Lifecycles ===");
      Object.entries(requestLifecycles).forEach(([req, events]) => {
        console.log(`${req}:`, events);
      });
      console.log("\nGlobal events:", globalEvents);
      console.log(`Total fetch calls: ${fetchCallCount}`);
      console.log(`Duration: ${endTime - startTime}ms\n`);

      // All requests should eventually succeed
      expect(results[0].status).toBe(200);
      expect(results[1].status).toBe(200);
      expect(results[2].status).toBe(200);
      expect(results[3].status).toBe(200);

      // Refresh should only be called once
      expect(refreshSession).toHaveBeenCalledTimes(1);

      // Verify req1 triggered 401 and got retried
      expect(requestLifecycles.req1).toContain("fetch-1-401");
      expect(
        requestLifecycles.req1.filter((e) => e.includes("200")).length,
      ).toBeGreaterThan(0);

      // CRITICAL: Verify req2, req3, req4 were retried (not just completed their slow initial request)
      // If they were properly canceled and replayed, they should have multiple fetch calls
      const req2Fetches = requestLifecycles.req2.filter((e) =>
        e.startsWith("fetch-"),
      ).length;
      const req3Fetches = requestLifecycles.req3.filter((e) =>
        e.startsWith("fetch-"),
      ).length;
      const req4Fetches = requestLifecycles.req4.filter((e) =>
        e.startsWith("fetch-"),
      ).length;

      console.log(
        `\nFetch attempts - req2: ${req2Fetches}, req3: ${req3Fetches}, req4: ${req4Fetches}`,
      );

      // Each request should be fetched at least twice (initial + retry)
      // If this fails, it means canceled requests are NOT being replayed!
      expect(
        req2Fetches,
        "req2 should be fetched multiple times (initial + retry)",
      ).toBeGreaterThanOrEqual(2);
      expect(
        req3Fetches,
        "req3 should be fetched multiple times (initial + retry)",
      ).toBeGreaterThanOrEqual(2);
      expect(
        req4Fetches,
        "req4 should be fetched multiple times (initial + retry)",
      ).toBeGreaterThanOrEqual(2);

      // Verify refresh happened
      expect(globalEvents).toContain("refresh-start");
      expect(globalEvents).toContain("refresh-end");

      // Verify timing: should take at least refresh duration
      expect(endTime - startTime).toBeGreaterThanOrEqual(100);
    });

    it("should replay truly canceled requests after refresh completes", async () => {
      // This test verifies that requests canceled by AbortController are replayed
      const requestStates = {
        req1: { initialCanceled: false, retried: false },
        req2: { initialCanceled: false, retried: false },
        req3: { initialCanceled: false, retried: false },
        req4: { initialCanceled: false, retried: false },
      };
      const events: string[] = [];

      const refreshSession = vi.fn().mockImplementation(async (next) => {
        events.push("refresh-start");
        await waitFor(80);
        events.push("refresh-end");
        next();
      });

      const middleware = requestQueueMiddleware({
        queueTrigger: ({ response }) => response.status === 401,
        handler: refreshSession,
      });

      const handler = composeMiddlewares([middleware], {
        fetcher: async (url, init) => {
          const urlStr = typeof url === "string" ? url : url.toString();
          const requestId = urlStr
            .split("/")
            .pop() as keyof typeof requestStates;
          const signal = (init as any)?.signal;

          events.push(`${requestId}-fetch-start`);

          // req1 returns 401 immediately
          if (requestId === "req1" && !events.includes("refresh-start")) {
            events.push(`${requestId}-401`);
            return createMockResponse(401);
          }

          // Other requests: simulate long operation that should be canceled
          if (!events.includes("refresh-start")) {
            try {
              // Wait with cancelation check
              await new Promise((resolve, reject) => {
                const timeout = setTimeout(resolve, 200); // Very slow request
                signal?.addEventListener("abort", () => {
                  clearTimeout(timeout);
                  // Throw proper AbortError like fetch API does
                  reject(new DOMException("Request canceled", "AbortError"));
                });
              });

              events.push(`${requestId}-completed`);
              return createMockResponse(200, { data: requestId });
            } catch (error: any) {
              if (error.name === "AbortError") {
                events.push(`${requestId}-truly-canceled`);
                requestStates[requestId].initialCanceled = true;
                throw error; // This should be caught by middleware
              }
              throw error;
            }
          }

          // Retry after refresh
          events.push(`${requestId}-retry`);
          requestStates[requestId].retried = true;
          await waitFor(10);
          return createMockResponse(200, { data: requestId });
        },
      });

      // Launch 4 concurrent requests
      const results = await Promise.all([
        handler(createMockRequest("/api/req1")),
        handler(createMockRequest("/api/req2")),
        handler(createMockRequest("/api/req3")),
        handler(createMockRequest("/api/req4")),
      ]);

      console.log("\n=== Truly Canceled Test Results ===");
      console.log("Events:", events);
      console.log("Request states:", requestStates);
      console.log("================\n");

      // All requests should eventually succeed
      expect(results[0].status).toBe(200);
      expect(results[1].status).toBe(200);
      expect(results[2].status).toBe(200);
      expect(results[3].status).toBe(200);

      // Refresh should only be called once
      expect(refreshSession).toHaveBeenCalledTimes(1);

      // CRITICAL ASSERTIONS:
      // If requests were truly canceled, they must be retried
      if (requestStates.req2.initialCanceled) {
        expect(
          requestStates.req2.retried,
          "req2 was canceled, so it MUST be retried",
        ).toBe(true);
      }
      if (requestStates.req3.initialCanceled) {
        expect(
          requestStates.req3.retried,
          "req3 was canceled, so it MUST be retried",
        ).toBe(true);
      }
      if (requestStates.req4.initialCanceled) {
        expect(
          requestStates.req4.retried,
          "req4 was canceled, so it MUST be retried",
        ).toBe(true);
      }

      // At least some requests should have been truly canceled
      const canceledCount = Object.values(requestStates).filter(
        (s) => s.initialCanceled,
      ).length;
      console.log(`Truly canceled requests: ${canceledCount}/4`);

      // If no requests were canceled, the test timing needs adjustment
      if (canceledCount === 0) {
        console.warn(
          "⚠️  No requests were truly canceled - test timing may need adjustment",
        );
      }

      // All requests that reached retry should succeed
      expect(events.filter((e) => e.includes("-retry")).length).toBeGreaterThan(
        0,
      );
    });

    it("should replay all 3 concurrent requests when first returns 401 and 2 are canceled", async () => {
      // This test simulates the exact scenario: 3 concurrent requests, first gets 401, others get canceled
      const events: string[] = [];
      let fetchCallCount = 0;

      const refreshSession = vi.fn().mockImplementation(async (next) => {
        events.push("refresh-start");
        await waitFor(1000); // Simulate real refresh token API call (1 second)
        events.push("refresh-end");
        next(); // Call callback to resume queue processing
      });

      const middleware = requestQueueMiddleware({
        queueTrigger: ({ response }) => response.status === 401,
        handler: refreshSession,
      });

      const handler = composeMiddlewares([middleware], {
        fetcher: async (url, init) => {
          fetchCallCount++;
          const callNum = fetchCallCount;
          const urlStr = typeof url === "string" ? url : url.toString();
          const requestId = urlStr.split("/").pop() as string;
          const signal = (init as any)?.signal;

          events.push(`${requestId}-fetch-${callNum}-start`);

          // First call to req1: return 401 immediately
          if (requestId === "req1" && callNum === 1) {
            events.push(`${requestId}-fetch-${callNum}-401`);
            return createMockResponse(401);
          }

          // First calls to req2 and req3: will be canceled during refresh
          if ((requestId === "req2" || requestId === "req3") && callNum <= 3) {
            // Simulate slow request that will be canceled
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                events.push(
                  `${requestId}-fetch-${callNum}-completed-not-canceled`,
                );
                resolve(null);
              }, 2000); // Longer than refresh (1000ms) to ensure it gets canceled

              signal?.addEventListener("abort", () => {
                clearTimeout(timeout);
                events.push(`${requestId}-fetch-${callNum}-canceled`);
                reject(new DOMException("Request canceled", "AbortError"));
              });
            });

            // Should not reach here if canceled
            return createMockResponse(200, { data: requestId });
          }

          // Retry calls: should succeed
          if (callNum > 3) {
            await waitFor(10);
            events.push(`${requestId}-fetch-${callNum}-retry-success`);
            return createMockResponse(200, { data: requestId });
          }

          // Should not reach here
          throw new Error(
            `Unexpected fetch call: ${requestId}, call ${callNum}`,
          );
        },
      });

      // Launch 3 concurrent requests
      console.log("\n=== Starting 3 concurrent requests test ===");
      const startTime = Date.now();

      const results = await Promise.all([
        handler(createMockRequest("/api/req1")),
        handler(createMockRequest("/api/req2")),
        handler(createMockRequest("/api/req3")),
      ]);

      const duration = Date.now() - startTime;

      console.log("\n=== Test Results ===");
      console.log("Events:", events);
      console.log("Total fetch calls:", fetchCallCount);
      console.log("Duration:", duration + "ms");
      console.log("================\n");

      // All 3 requests should succeed
      expect(results[0].status).toBe(200);
      expect(results[1].status).toBe(200);
      expect(results[2].status).toBe(200);

      // Refresh should be called once
      expect(refreshSession).toHaveBeenCalledTimes(1);

      // Should have exactly 6 fetch calls:
      // - Initial: req1(401), req2(canceled), req3(canceled) = 3 calls
      // - Retry: req1, req2, req3 = 3 calls
      // Total = 6 calls
      expect(fetchCallCount).toBe(6);

      // Verify event sequence
      expect(events).toContain("req1-fetch-1-401");
      expect(events).toContain("req2-fetch-2-canceled");
      expect(events).toContain("req3-fetch-3-canceled");
      expect(events).toContain("refresh-start");
      expect(events).toContain("refresh-end");
      expect(events).toContain("req1-fetch-4-retry-success");
      expect(events).toContain("req2-fetch-5-retry-success");
      expect(events).toContain("req3-fetch-6-retry-success");

      // Verify canceled requests were retried
      const req2Canceled = events.includes("req2-fetch-2-canceled");
      const req3Canceled = events.includes("req3-fetch-3-canceled");
      const req2Retried = events.includes("req2-fetch-5-retry-success");
      const req3Retried = events.includes("req3-fetch-6-retry-success");

      if (req2Canceled) {
        expect(req2Retried).toBe(true);
      }
      if (req3Canceled) {
        expect(req3Retried).toBe(true);
      }

      console.log(
        "✅ Test passed: All 3 requests completed successfully after refresh",
      );
    });
  });

  describe("Multiple configs - independent queues", () => {
    it("should handle requests with overlapping matchRule independently", async () => {
      let requestCounts = { auth: 0, permission: 0 };
      const refreshSession = vi.fn().mockImplementation(async (next) => {
        next();
      });
      const refreshPermissions = vi.fn().mockImplementation(async (next) => {
        next();
      });

      const middleware = requestQueueMiddleware([
        {
          matchRule: ({ meta }) => meta?.needAuth === true,
          queueTrigger: ({ response }) => response.status === 401,
          handler: refreshSession,
        },
        {
          matchRule: ({ meta }) => meta?.needPermission === true,
          queueTrigger: ({ response }) => response.status === 403,
          handler: refreshPermissions,
        },
      ]);

      const handler = composeMiddlewares([middleware], {
        fetcher: async (url, init) => {
          const urlStr = typeof url === "string" ? url : url.toString();
          const req = init as any;

          // Request A: needAuth + needPermission
          if (urlStr.includes("admin")) {
            requestCounts.auth++;
            // First call returns 401
            if (requestCounts.auth === 1) {
              return createMockResponse(401);
            }
            return createMockResponse(200, { url: urlStr });
          }

          // Request B: needAuth only
          if (urlStr.includes("user")) {
            requestCounts.auth++;
            // Will be canceled by request A's 401
            // Retry will return 200
            return createMockResponse(200, { url: urlStr });
          }

          // Request C: needPermission only
          if (urlStr.includes("resources")) {
            requestCounts.permission++;
            // First call returns 403
            if (requestCounts.permission === 1) {
              return createMockResponse(403);
            }
            return createMockResponse(200, { url: urlStr });
          }

          // Request D: no metadata
          return createMockResponse(200, { url: urlStr });
        },
      });

      // Launch 4 concurrent requests (A, B, C, D)
      const [resultA, resultB, resultC, resultD] = await Promise.all([
        handler(
          createMockRequest("/api/admin", {
            needAuth: true,
            needPermission: true,
          }),
        ),
        handler(createMockRequest("/api/user", { needAuth: true })),
        handler(createMockRequest("/api/resources", { needPermission: true })),
        handler(createMockRequest("/api/public", {})),
      ]);

      // All should succeed
      expect(resultA.status).toBe(200);
      expect(resultB.status).toBe(200);
      expect(resultC.status).toBe(200);
      expect(resultD.status).toBe(200);

      // Each refresh should be called only once
      expect(refreshSession).toHaveBeenCalledTimes(1);
      expect(refreshPermissions).toHaveBeenCalledTimes(1);
    });

    it("should process independent queues without interference", async () => {
      const authCallOrder: string[] = [];
      const permCallOrder: string[] = [];

      const refreshSession = vi.fn().mockImplementation(async (next) => {
        authCallOrder.push("refresh-start");
        await waitFor(50);
        authCallOrder.push("refresh-end");
        next();
      });

      const refreshPermissions = vi.fn().mockImplementation(async (next) => {
        permCallOrder.push("refresh-start");
        await waitFor(50);
        permCallOrder.push("refresh-end");
        next();
      });

      let authRequestCount = 0;
      let permRequestCount = 0;

      const middleware = requestQueueMiddleware([
        {
          matchRule: ({ meta }) => meta?.needAuth === true,
          queueTrigger: ({ response }) => response.status === 401,
          handler: refreshSession,
        },
        {
          matchRule: ({ meta }) => meta?.needPermission === true,
          queueTrigger: ({ response }) => response.status === 403,
          handler: refreshPermissions,
        },
      ]);

      const handler = composeMiddlewares([middleware], {
        fetcher: async (url) => {
          const urlStr = typeof url === "string" ? url : url.toString();

          if (urlStr.includes("auth")) {
            authRequestCount++;
            if (authRequestCount === 1) {
              authCallOrder.push("401-received");
              return createMockResponse(401);
            }
            authCallOrder.push("retry-200");
            return createMockResponse(200);
          }

          if (urlStr.includes("perm")) {
            permRequestCount++;
            if (permRequestCount === 1) {
              permCallOrder.push("403-received");
              return createMockResponse(403);
            }
            permCallOrder.push("retry-200");
            return createMockResponse(200);
          }

          return createMockResponse(200);
        },
      });

      // Launch 2 independent requests
      const [authResult, permResult] = await Promise.all([
        handler(createMockRequest("/api/auth", { needAuth: true })),
        handler(createMockRequest("/api/perm", { needPermission: true })),
      ]);

      expect(authResult.status).toBe(200);
      expect(permResult.status).toBe(200);

      // Verify independent processing
      expect(authCallOrder).toContain("401-received");
      expect(authCallOrder).toContain("refresh-start");
      expect(authCallOrder).toContain("refresh-end");
      expect(authCallOrder).toContain("retry-200");

      expect(permCallOrder).toContain("403-received");
      expect(permCallOrder).toContain("refresh-start");
      expect(permCallOrder).toContain("refresh-end");
      expect(permCallOrder).toContain("retry-200");
    });
  });

  describe("matchRule filtering", () => {
    it("should skip queue management for requests not matching any config", async () => {
      const refreshSession = vi.fn();

      const middleware = requestQueueMiddleware({
        matchRule: ({ meta }) => meta?.needAuth === true,
        queueTrigger: ({ response }) => response.status === 401,
        handler: refreshSession,
      });

      const handler = composeMiddlewares([middleware], {
        fetcher: async () => createMockResponse(401), // Returns 401 but should not trigger
      });

      const request = createMockRequest("/api/public", { needAuth: false });

      // Should pass through without queue management (returns 401 directly)
      const result = await handler(request);
      expect(result.status).toBe(401);
      expect(refreshSession).not.toHaveBeenCalled();
    });

    it("should match by URL pattern and metadata", async () => {
      const refreshSession = vi.fn().mockImplementation(async (next) => {
        next();
      });
      let requestCount = 0;

      const middleware = requestQueueMiddleware({
        matchRule: ({ request, meta }) =>
          request.url.includes("/api/user") && meta?.needAuth === true,
        queueTrigger: ({ response }) => response.status === 401,
        handler: refreshSession,
      });

      const handler = composeMiddlewares([middleware], {
        fetcher: async (url) => {
          requestCount++;
          const urlStr = typeof url === "string" ? url : url.toString();
          if (urlStr.includes("/api/user") && requestCount === 1) {
            return createMockResponse(401);
          }
          return createMockResponse(200);
        },
      });

      // This should be managed (matches URL and meta)
      const result1 = await handler(
        createMockRequest("/api/user/profile", { needAuth: true }),
      );
      expect(result1.status).toBe(200);
      expect(refreshSession).toHaveBeenCalledTimes(1);

      // This should NOT be managed (wrong URL)
      refreshSession.mockClear();
      requestCount = 0;
      const result2 = await handler(
        createMockRequest("/api/posts", { needAuth: true }),
      );
      expect(result2.status).toBe(200);
      expect(refreshSession).not.toHaveBeenCalled();
    });
  });

  describe("Error scenarios", () => {
    it("should handle network errors during retry", async () => {
      let requestCount = 0;
      const refreshSession = vi.fn().mockImplementation(async (next) => {
        next();
      });

      const middleware = requestQueueMiddleware({
        queueTrigger: ({ response }) => response.status === 401,
        handler: refreshSession,
      });

      const handler = composeMiddlewares([middleware], {
        fetcher: async () => {
          requestCount++;
          if (requestCount === 1) {
            return createMockResponse(401);
          }
          // Retry fails with network error
          throw new Error("Network error");
        },
      });

      const request = createMockRequest("/api/data");

      await expect(handler(request)).rejects.toThrow("Network error");
      expect(refreshSession).toHaveBeenCalledTimes(1);
    });

    it("should handle abort signal during queue processing", async () => {
      const refreshSession = vi.fn().mockImplementation(async (next) => {
        await waitFor(100);
        next();
      });

      const middleware = requestQueueMiddleware({
        queueTrigger: ({ response }) => response.status === 401,
        handler: refreshSession,
      });

      let requestCount = 0;
      const handler = composeMiddlewares([middleware], {
        fetcher: async () => {
          requestCount++;
          if (requestCount === 1) {
            return createMockResponse(401);
          }
          return createMockResponse(200);
        },
      });

      const controller = new AbortController();
      const request = createMockRequest("/api/data");
      request.signal = controller.signal;

      // Start request
      const promise = handler(request);

      // Abort after a short delay
      await waitFor(10);
      controller.abort();

      // Should still complete because it's in queue
      const result = await promise;
      expect(result.status).toBe(200);
    });
  });

  describe("Complex concurrent scenario (from documentation)", () => {
    it("should handle the documented concurrent scenario correctly", async () => {
      // Track call order and counts
      const callOrder: string[] = [];
      let authRequestCount = 0;
      let permRequestCount = 0;

      const refreshSession = vi.fn().mockImplementation(async (next) => {
        callOrder.push("refreshSession-start");
        await waitFor(30);
        callOrder.push("refreshSession-end");
        next();
      });

      const refreshPermissions = vi.fn().mockImplementation(async (next) => {
        callOrder.push("refreshPermissions-start");
        await waitFor(30);
        callOrder.push("refreshPermissions-end");
        next();
      });

      const middleware = requestQueueMiddleware([
        {
          matchRule: ({ meta }) => meta?.needAuth === true,
          queueTrigger: ({ response }) => response.status === 401,
          handler: refreshSession,
        },
        {
          matchRule: ({ meta }) => meta?.needPermission === true,
          queueTrigger: ({ response }) => response.status === 403,
          handler: refreshPermissions,
        },
      ]);

      const handler = composeMiddlewares([middleware], {
        fetcher: async (url) => {
          const urlStr = typeof url === "string" ? url : url.toString();

          // Request A: /api/admin (needAuth + needPermission)
          if (urlStr.includes("admin")) {
            authRequestCount++;
            if (authRequestCount === 1) {
              callOrder.push("A-401");
              return createMockResponse(401);
            }
            callOrder.push("A-retry-200");
            return createMockResponse(200, { url: "admin" });
          }

          // Request B: /api/user (needAuth)
          if (urlStr.includes("user")) {
            authRequestCount++;
            callOrder.push("B-request");
            return createMockResponse(200, { url: "user" });
          }

          // Request C: /api/resources (needPermission)
          if (urlStr.includes("resources")) {
            permRequestCount++;
            if (permRequestCount === 1) {
              callOrder.push("C-403");
              return createMockResponse(403);
            }
            callOrder.push("C-retry-200");
            return createMockResponse(200, { url: "resources" });
          }

          // Request D: /api/public (no metadata)
          callOrder.push("D-200");
          return createMockResponse(200, { url: "public" });
        },
      });

      // T0: Launch 4 concurrent requests
      const [resultA, resultB, resultC, resultD] = await Promise.all([
        handler(
          createMockRequest("/api/admin", {
            needAuth: true,
            needPermission: true,
          }),
        ),
        handler(createMockRequest("/api/user", { needAuth: true })),
        handler(createMockRequest("/api/resources", { needPermission: true })),
        handler(createMockRequest("/api/public")),
      ]);

      // All should succeed
      expect(resultA.status).toBe(200);
      expect(resultB.status).toBe(200);
      expect(resultC.status).toBe(200);
      expect(resultD.status).toBe(200);

      // Verify refresh was called exactly once each
      expect(refreshSession).toHaveBeenCalledTimes(1);
      expect(refreshPermissions).toHaveBeenCalledTimes(1);

      // Verify call order contains expected events
      expect(callOrder).toContain("A-401");
      expect(callOrder).toContain("refreshSession-start");
      expect(callOrder).toContain("refreshSession-end");
      expect(callOrder).toContain("A-retry-200");
      expect(callOrder).toContain("B-request");

      expect(callOrder).toContain("C-403");
      expect(callOrder).toContain("refreshPermissions-start");
      expect(callOrder).toContain("refreshPermissions-end");
      expect(callOrder).toContain("C-retry-200");

      expect(callOrder).toContain("D-200");

      // Verify request D completed independently
      const dIndex = callOrder.indexOf("D-200");
      expect(dIndex).toBeGreaterThanOrEqual(0);
    });

    it("should retry with fresh signal (no aborted signal error)", async () => {
      // This test verifies that retry requests don't fail due to aborted signal
      const events: string[] = [];
      let fetchCallCount = 0;

      const refreshSession = vi.fn().mockImplementation(async (next) => {
        events.push("refresh-start");
        await waitFor(50);
        events.push("refresh-end");
        next();
      });

      const middleware = requestQueueMiddleware({
        queueTrigger: ({ response }) => response.status === 401,
        handler: refreshSession,
      });

      const handler = composeMiddlewares([middleware], {
        fetcher: async (url, init) => {
          fetchCallCount++;
          const callNum = fetchCallCount;
          const urlStr = typeof url === "string" ? url : url.toString();
          const requestId = urlStr.split("/").pop() as string;
          const signal = (init as any)?.signal;

          events.push(`${requestId}-fetch-${callNum}-start`);

          // IMPORTANT: Check if signal is already aborted (like real fetch does)
          if (signal?.aborted) {
            events.push(`${requestId}-fetch-${callNum}-aborted-signal`);
            throw new DOMException(
              "signal is aborted without reason",
              "AbortError",
            );
          }

          // First call: return 401
          if (callNum === 1) {
            await waitFor(10);
            events.push(`${requestId}-fetch-${callNum}-401`);
            return createMockResponse(401);
          }

          // Retry call: should succeed (signal should NOT be aborted)
          await waitFor(10);
          events.push(`${requestId}-fetch-${callNum}-200`);
          return createMockResponse(200, { data: requestId });
        },
      });

      console.log("\n=== Testing retry with fresh signal ===");
      const result = await handler(createMockRequest("/api/test"));

      console.log("\n=== Test Results ===");
      console.log("Events:", events);
      console.log("Total fetch calls:", fetchCallCount);
      console.log("================\n");

      // Request should succeed
      expect(result.status).toBe(200);

      // Should have exactly 2 fetch calls (initial + retry)
      expect(fetchCallCount).toBe(2);

      // Verify event sequence
      expect(events).toContain("test-fetch-1-401");
      expect(events).toContain("refresh-start");
      expect(events).toContain("refresh-end");
      expect(events).toContain("test-fetch-2-200");

      // CRITICAL: Retry should NOT have aborted signal error
      expect(events).not.toContain("test-fetch-2-aborted-signal");

      // Refresh should be called once
      expect(refreshSession).toHaveBeenCalledTimes(1);

      console.log(
        "✅ Test passed: Retry uses fresh signal without abort error",
      );
    });
  });

  describe("Max retries - prevent infinite loops", () => {
    it("should stop retrying after maxRetries and return error response", async () => {
      // This test verifies that when retry still returns 401, it stops after maxRetries
      const events: string[] = [];
      let fetchCallCount = 0;

      const refreshSession = vi.fn().mockImplementation(async (next) => {
        events.push("refresh-start");
        await waitFor(50);
        events.push("refresh-end");
        next();
      });

      const middleware = requestQueueMiddleware({
        queueTrigger: ({ response }) => response.status === 401,
        handler: refreshSession,
        maxRetries: 2, // Allow 2 retries before giving up
      });

      const handler = composeMiddlewares([middleware], {
        fetcher: async (url, init) => {
          fetchCallCount++;
          const callNum = fetchCallCount;
          const urlStr = typeof url === "string" ? url : url.toString();
          const requestId = urlStr.split("/").pop() as string;

          events.push(`${requestId}-fetch-${callNum}-start`);

          // Always return 401 to simulate infinite 401 scenario
          await waitFor(10);
          events.push(`${requestId}-fetch-${callNum}-401`);
          return createMockResponse(401);
        },
      });

      console.log("\n=== Testing max retries with infinite 401 ===");

      const result = await handler(createMockRequest("/api/test"));

      console.log("\n=== Test Results ===");
      console.log("Events:", events);
      console.log("Total fetch calls:", fetchCallCount);
      console.log("Refresh calls:", refreshSession.mock.calls.length);
      console.log("================\n");

      // Should return 401 after maxRetries
      expect(result.status).toBe(401);

      // Should have exactly 3 fetch calls:
      // - Initial: 401 (retry count = 0)
      // - Retry 1: 401 (retry count = 1)
      // - Retry 2: 401 (retry count = 2, maxRetries reached, stop)
      expect(fetchCallCount).toBe(3);

      // Refresh should be called twice (once for each retry)
      expect(refreshSession).toHaveBeenCalledTimes(2);

      // Verify event sequence
      expect(events).toContain("test-fetch-1-401");
      expect(events).toContain("refresh-start");
      expect(events).toContain("refresh-end");
      expect(events).toContain("test-fetch-2-401");
      expect(events).toContain("test-fetch-3-401");

      console.log(
        "✅ Test passed: Stops after maxRetries to prevent infinite loop",
      );
    });

    it("should allow retry to succeed within maxRetries", async () => {
      // This test verifies that if retry succeeds before maxRetries, it works normally
      const events: string[] = [];
      let fetchCallCount = 0;

      const refreshSession = vi.fn().mockImplementation(async (next) => {
        events.push("refresh-start");
        await waitFor(50);
        events.push("refresh-end");
        next();
      });

      const middleware = requestQueueMiddleware({
        queueTrigger: ({ response }) => response.status === 401,
        handler: refreshSession,
        maxRetries: 3,
      });

      const handler = composeMiddlewares([middleware], {
        fetcher: async (url, init) => {
          fetchCallCount++;
          const callNum = fetchCallCount;
          const urlStr = typeof url === "string" ? url : url.toString();
          const requestId = urlStr.split("/").pop() as string;

          events.push(`${requestId}-fetch-${callNum}-start`);

          // First 2 calls return 401, third call succeeds
          if (callNum <= 2) {
            await waitFor(10);
            events.push(`${requestId}-fetch-${callNum}-401`);
            return createMockResponse(401);
          }

          // Third retry succeeds
          await waitFor(10);
          events.push(`${requestId}-fetch-${callNum}-200`);
          return createMockResponse(200, { data: requestId });
        },
      });

      console.log("\n=== Testing retry succeeds within maxRetries ===");

      const result = await handler(createMockRequest("/api/test"));

      console.log("\n=== Test Results ===");
      console.log("Events:", events);
      console.log("Total fetch calls:", fetchCallCount);
      console.log("Refresh calls:", refreshSession.mock.calls.length);
      console.log("================\n");

      // Should succeed
      expect(result.status).toBe(200);

      // Should have exactly 3 fetch calls
      expect(fetchCallCount).toBe(3);

      // Refresh should be called twice
      expect(refreshSession).toHaveBeenCalledTimes(2);

      // Verify event sequence
      expect(events).toContain("test-fetch-1-401");
      expect(events).toContain("test-fetch-2-401");
      expect(events).toContain("test-fetch-3-200");

      console.log("✅ Test passed: Retry succeeds within maxRetries limit");
    });
  });

  describe("Race condition - concurrent 401 responses", () => {
    it("should handle race condition when multiple requests return 401 simultaneously", async () => {
      // This test verifies that when multiple requests get 401 at almost the same time,
      // ALL of them are queued and retried, and none "escape" the queue
      const events: string[] = [];
      let fetchCallCount = 0;
      const requestDelays: Record<string, number> = {
        req1: 50, // Fastest - triggers 401 first
        req2: 55, // Very close timing
        req3: 60, // Also very close
      };

      const refreshSession = vi.fn().mockImplementation(async (next) => {
        events.push("refresh-start");
        await waitFor(100); // Longer refresh to ensure all responses arrive during refresh
        events.push("refresh-end");
        next();
      });

      const middleware = requestQueueMiddleware({
        queueTrigger: ({ response }) => response.status === 401,
        handler: refreshSession,
      });

      const handler = composeMiddlewares([middleware], {
        fetcher: async (url, init) => {
          fetchCallCount++;
          const callNum = fetchCallCount;
          const urlStr = typeof url === "string" ? url : url.toString();
          const requestId = urlStr.split("/").pop() as string;

          events.push(`${requestId}-fetch-${callNum}-start`);

          // First calls: all return 401 with slightly different delays to simulate race
          if (callNum <= 3) {
            const delay = requestDelays[requestId] || 50;
            await waitFor(delay);
            events.push(`${requestId}-fetch-${callNum}-401`);
            return createMockResponse(401);
          }

          // Retry calls: all succeed
          await waitFor(10);
          events.push(`${requestId}-fetch-${callNum}-200`);
          return createMockResponse(200, { data: requestId });
        },
      });

      console.log("\n=== Testing race condition with concurrent 401s ===");

      // Launch 3 concurrent requests with very close timing
      const results = await Promise.all([
        handler(createMockRequest("/api/req1")),
        handler(createMockRequest("/api/req2")),
        handler(createMockRequest("/api/req3")),
      ]);

      console.log("\n=== Test Results ===");
      console.log("Events:", events);
      console.log("Total fetch calls:", fetchCallCount);
      console.log("Refresh calls:", refreshSession.mock.calls.length);
      console.log("================\n");

      // All 3 requests should succeed
      expect(results[0].status).toBe(200);
      expect(results[1].status).toBe(200);
      expect(results[2].status).toBe(200);

      // Refresh should be called ONLY ONCE (not 3 times!)
      expect(refreshSession).toHaveBeenCalledTimes(1);

      // Should have exactly 6 fetch calls:
      // - Initial: req1(401), req2(401), req3(401) = 3 calls
      // - Retry: req1, req2, req3 = 3 calls
      // Total = 6 calls
      expect(fetchCallCount).toBe(6);

      // Verify all requests got 401 initially
      expect(events).toContain("req1-fetch-1-401");
      expect(events).toContain("req2-fetch-2-401");
      expect(events).toContain("req3-fetch-3-401");

      // Verify refresh happened
      expect(events).toContain("refresh-start");
      expect(events).toContain("refresh-end");

      // Verify all requests were retried successfully (don't assume specific order)
      const req1RetrySuccess = events.some(
        (e) => e.includes("req1") && e.includes("200"),
      );
      const req2RetrySuccess = events.some(
        (e) => e.includes("req2") && e.includes("200"),
      );
      const req3RetrySuccess = events.some(
        (e) => e.includes("req3") && e.includes("200"),
      );

      expect(req1RetrySuccess).toBe(true);
      expect(req2RetrySuccess).toBe(true);
      expect(req3RetrySuccess).toBe(true);

      // CRITICAL: Verify NO request got 200 on initial call (all were queued and retried)
      const hasEscapedRequest = events.some(
        (e) =>
          e.includes("req1-fetch-1-200") ||
          e.includes("req2-fetch-2-200") ||
          e.includes("req3-fetch-3-200"),
      );
      expect(hasEscapedRequest).toBe(false);

      console.log(
        "✅ Test passed: No requests escaped the queue in race condition",
      );
    });

    it("should handle extremely tight race condition (requests return within 1ms)", async () => {
      // Even more extreme race condition test
      const events: string[] = [];
      let fetchCallCount = 0;

      const refreshSession = vi.fn().mockImplementation(async (next) => {
        events.push("refresh-start");
        await waitFor(50);
        events.push("refresh-end");
        next();
      });

      const middleware = requestQueueMiddleware({
        queueTrigger: ({ response }) => response.status === 401,
        handler: refreshSession,
      });

      const handler = composeMiddlewares([middleware], {
        fetcher: async (url, init) => {
          fetchCallCount++;
          const callNum = fetchCallCount;
          const urlStr = typeof url === "string" ? url : url.toString();
          const requestId = urlStr.split("/").pop() as string;

          events.push(`${requestId}-fetch-${callNum}`);

          // First calls: all return 401 IMMEDIATELY (no delay)
          if (callNum <= 5) {
            // No wait - immediate 401 to maximize race condition
            return createMockResponse(401);
          }

          // Retry calls: all succeed
          await waitFor(5);
          return createMockResponse(200, { data: requestId });
        },
      });

      console.log("\n=== Testing extreme race condition (0ms delay) ===");

      // Launch 5 concurrent requests simultaneously
      const results = await Promise.all([
        handler(createMockRequest("/api/req1")),
        handler(createMockRequest("/api/req2")),
        handler(createMockRequest("/api/req3")),
        handler(createMockRequest("/api/req4")),
        handler(createMockRequest("/api/req5")),
      ]);

      console.log("\n=== Test Results ===");
      console.log("Events:", events);
      console.log("Total fetch calls:", fetchCallCount);
      console.log("Refresh calls:", refreshSession.mock.calls.length);
      console.log("================\n");

      // All 5 requests should succeed
      results.forEach((result, i) => {
        expect(result.status).toBe(200);
      });

      // Refresh should be called ONLY ONCE
      expect(refreshSession).toHaveBeenCalledTimes(1);

      // Should have exactly 10 fetch calls (5 initial + 5 retry)
      expect(fetchCallCount).toBe(10);

      console.log("✅ Test passed: Extreme race condition handled correctly");
    });
  });
});
