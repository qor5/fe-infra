import { describe, it, expect, vi } from "vitest";
import { tagSessionMiddleware } from "./tag-session";
import type { Request, SuitContext } from "../middleware";

function createMockContext(): SuitContext {
  const controller = new AbortController();
  return {
    controller,
    signal: controller.signal,
  };
}

function createMockRequest(url: string, _meta?: Record<string, any>): Request {
  return {
    url,
    method: "GET",
    headers: {},
    body: null,
    _meta,
  };
}

describe("tagSessionMiddleware", () => {
  it("adds tags to request when URL matches endpoint", async () => {
    const endpoints = ["/api/protected", "/api/admin"];
    const tags = { isProtected: true, requiresAuth: true };
    const middleware = tagSessionMiddleware(endpoints, tags);

    const req = createMockRequest("/api/protected/resource");
    const mockResponse = new Response(null, { status: 200 });
    const next = vi.fn().mockResolvedValue(mockResponse);
    const ctx = createMockContext();

    await middleware(req, next, ctx);

    const passedReq = next.mock.calls[0][0];
    expect(passedReq._meta).toEqual({ isProtected: true, requiresAuth: true });
  });

  it("does not add tags when URL does not match", async () => {
    const endpoints = ["/api/protected"];
    const tags = { isProtected: true };
    const middleware = tagSessionMiddleware(endpoints, tags);

    const req = createMockRequest("/api/public/resource");
    const mockResponse = new Response(null, { status: 200 });
    const next = vi.fn().mockResolvedValue(mockResponse);
    const ctx = createMockContext();

    await middleware(req, next, ctx);

    const passedReq = next.mock.calls[0][0];
    expect(passedReq._meta).toBeUndefined();
  });

  it("merges tags with existing _meta", async () => {
    const endpoints = ["/api/protected"];
    const tags = { isProtected: true };
    const middleware = tagSessionMiddleware(endpoints, tags);

    const req = createMockRequest("/api/protected/resource", {
      existingKey: "value",
    });
    const mockResponse = new Response(null, { status: 200 });
    const next = vi.fn().mockResolvedValue(mockResponse);
    const ctx = createMockContext();

    await middleware(req, next, ctx);

    const passedReq = next.mock.calls[0][0];
    expect(passedReq._meta).toEqual({
      existingKey: "value",
      isProtected: true,
    });
  });

  it("matches partial URL paths", async () => {
    const endpoints = ["/api/v1"];
    const tags = { version: 1 };
    const middleware = tagSessionMiddleware(endpoints, tags);

    const req = createMockRequest("/api/v1/users/123");
    const mockResponse = new Response(null, { status: 200 });
    const next = vi.fn().mockResolvedValue(mockResponse);
    const ctx = createMockContext();

    await middleware(req, next, ctx);

    const passedReq = next.mock.calls[0][0];
    expect(passedReq._meta).toEqual({ version: 1 });
  });

  it("matches any endpoint from the list", async () => {
    const endpoints = ["/api/users", "/api/orders", "/api/products"];
    const tags = { tagged: true };
    const middleware = tagSessionMiddleware(endpoints, tags);

    const req = createMockRequest("/api/orders/456");
    const mockResponse = new Response(null, { status: 200 });
    const next = vi.fn().mockResolvedValue(mockResponse);
    const ctx = createMockContext();

    await middleware(req, next, ctx);

    const passedReq = next.mock.calls[0][0];
    expect(passedReq._meta).toEqual({ tagged: true });
  });

  it("handles empty endpoints array", async () => {
    const endpoints: string[] = [];
    const tags = { isProtected: true };
    const middleware = tagSessionMiddleware(endpoints, tags);

    const req = createMockRequest("/api/anything");
    const mockResponse = new Response(null, { status: 200 });
    const next = vi.fn().mockResolvedValue(mockResponse);
    const ctx = createMockContext();

    await middleware(req, next, ctx);

    const passedReq = next.mock.calls[0][0];
    expect(passedReq._meta).toBeUndefined();
  });

  it("passes through to next middleware", async () => {
    const middleware = tagSessionMiddleware(["/api"], { tag: true });
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(JSON.stringify({ ok: true }), {
      status: 200,
    });
    const next = vi.fn().mockResolvedValue(mockResponse);
    const ctx = createMockContext();

    const result = await middleware(req, next, ctx);

    expect(result).toBe(mockResponse);
    expect(next).toHaveBeenCalled();
  });

  it('matches all URLs when endpoints contains "*"', async () => {
    const endpoints = ["*"];
    const tags = { isProtected: true };
    const middleware = tagSessionMiddleware(endpoints, tags);

    const testUrls = [
      "/api/protected/resource",
      "/api/public/resource",
      "/any/url/path",
      "https://example.com/api/test",
      "/",
    ];

    for (const url of testUrls) {
      const req = createMockRequest(url);
      const mockResponse = new Response(null, { status: 200 });
      const next = vi.fn().mockResolvedValue(mockResponse);
      const ctx = createMockContext();

      await middleware(req, next, ctx);

      const passedReq = next.mock.calls[next.mock.calls.length - 1][0];
      expect(passedReq._meta).toEqual({ isProtected: true });
    }
  });

  it('matches all URLs when "*" is mixed with other endpoints', async () => {
    const endpoints = ["*", "/api/specific"];
    const tags = { isProtected: true };
    const middleware = tagSessionMiddleware(endpoints, tags);

    // Test that '*' takes precedence and matches all URLs
    const req = createMockRequest("/completely/different/path");
    const mockResponse = new Response(null, { status: 200 });
    const next = vi.fn().mockResolvedValue(mockResponse);
    const ctx = createMockContext();

    await middleware(req, next, ctx);

    const passedReq = next.mock.calls[0][0];
    expect(passedReq._meta).toEqual({ isProtected: true });
  });

  it('handles "*" in array with other patterns correctly', async () => {
    const endpoints = ["/api/users", "*", "/api/orders"];
    const tags = { tagged: true };
    const middleware = tagSessionMiddleware(endpoints, tags);

    // Even though URL doesn't match /api/users or /api/orders, '*' should match
    const req = createMockRequest("/random/path/123");
    const mockResponse = new Response(null, { status: 200 });
    const next = vi.fn().mockResolvedValue(mockResponse);
    const ctx = createMockContext();

    await middleware(req, next, ctx);

    const passedReq = next.mock.calls[0][0];
    expect(passedReq._meta).toEqual({ tagged: true });
  });
});
