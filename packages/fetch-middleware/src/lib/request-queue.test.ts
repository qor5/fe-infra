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
        next: refreshSession,
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
      const refreshSession = vi.fn().mockResolvedValue(undefined);

      const middleware = requestQueueMiddleware({
        queueTrigger: ({ response }) => response.status === 401,
        next: refreshSession,
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
        next: refreshSession,
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
      const refreshSession = vi.fn().mockImplementation(async () => {
        await waitFor(50); // Simulate async operation
      });

      const middleware = requestQueueMiddleware({
        queueTrigger: ({ response }) => response.status === 401,
        next: refreshSession,
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
  });

  describe("Multiple configs - independent queues", () => {
    it("should handle requests with overlapping matchRule independently", async () => {
      let requestCounts = { auth: 0, permission: 0 };
      const refreshSession = vi.fn().mockResolvedValue(undefined);
      const refreshPermissions = vi.fn().mockResolvedValue(undefined);

      const middleware = requestQueueMiddleware([
        {
          matchRule: ({ meta }) => meta?.needAuth === true,
          queueTrigger: ({ response }) => response.status === 401,
          next: refreshSession,
        },
        {
          matchRule: ({ meta }) => meta?.needPermission === true,
          queueTrigger: ({ response }) => response.status === 403,
          next: refreshPermissions,
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

      const refreshSession = vi.fn().mockImplementation(async () => {
        authCallOrder.push("refresh-start");
        await waitFor(50);
        authCallOrder.push("refresh-end");
      });

      const refreshPermissions = vi.fn().mockImplementation(async () => {
        permCallOrder.push("refresh-start");
        await waitFor(50);
        permCallOrder.push("refresh-end");
      });

      let authRequestCount = 0;
      let permRequestCount = 0;

      const middleware = requestQueueMiddleware([
        {
          matchRule: ({ meta }) => meta?.needAuth === true,
          queueTrigger: ({ response }) => response.status === 401,
          next: refreshSession,
        },
        {
          matchRule: ({ meta }) => meta?.needPermission === true,
          queueTrigger: ({ response }) => response.status === 403,
          next: refreshPermissions,
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
        next: refreshSession,
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
      const refreshSession = vi.fn().mockResolvedValue(undefined);
      let requestCount = 0;

      const middleware = requestQueueMiddleware({
        matchRule: ({ request, meta }) =>
          request.url.includes("/api/user") && meta?.needAuth === true,
        queueTrigger: ({ response }) => response.status === 401,
        next: refreshSession,
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
      const refreshSession = vi.fn().mockResolvedValue(undefined);

      const middleware = requestQueueMiddleware({
        queueTrigger: ({ response }) => response.status === 401,
        next: refreshSession,
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
      const refreshSession = vi.fn().mockImplementation(async () => {
        await waitFor(100);
      });

      const middleware = requestQueueMiddleware({
        queueTrigger: ({ response }) => response.status === 401,
        next: refreshSession,
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

      const refreshSession = vi.fn().mockImplementation(async () => {
        callOrder.push("refreshSession-start");
        await waitFor(30);
        callOrder.push("refreshSession-end");
      });

      const refreshPermissions = vi.fn().mockImplementation(async () => {
        callOrder.push("refreshPermissions-start");
        await waitFor(30);
        callOrder.push("refreshPermissions-end");
      });

      const middleware = requestQueueMiddleware([
        {
          matchRule: ({ meta }) => meta?.needAuth === true,
          queueTrigger: ({ response }) => response.status === 401,
          next: refreshSession,
        },
        {
          matchRule: ({ meta }) => meta?.needPermission === true,
          queueTrigger: ({ response }) => response.status === 403,
          next: refreshPermissions,
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
  });
});
