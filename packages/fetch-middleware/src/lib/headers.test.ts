import { describe, it, expect, vi } from "vitest";
import { headersMiddleware } from "./headers";
import type { Request, SuitContext } from "../middleware";

function createMockContext(): SuitContext {
  const controller = new AbortController();
  return {
    controller,
    signal: controller.signal,
  };
}

function createMockRequest(
  url: string,
  headers?: Record<string, string>,
): Request {
  return {
    url,
    method: "GET",
    headers: headers || {},
    body: null,
  };
}

describe("headersMiddleware", () => {
  it("adds new headers to request", async () => {
    const middleware = headersMiddleware((headers) => {
      headers.set("Authorization", "Bearer token123");
    });

    const req = createMockRequest("/api/test");
    const mockResponse = new Response(null, { status: 200 });
    const next = vi.fn().mockResolvedValue(mockResponse);
    const ctx = createMockContext();

    await middleware(req, next, ctx);

    const passedReq = next.mock.calls[0][0];
    const headers = new Headers(passedReq.headers);
    expect(headers.get("Authorization")).toBe("Bearer token123");
  });

  it("modifies existing headers", async () => {
    const middleware = headersMiddleware((headers) => {
      headers.set("Content-Type", "application/xml");
    });

    const req = createMockRequest("/api/test", {
      "Content-Type": "application/json",
    });
    const mockResponse = new Response(null, { status: 200 });
    const next = vi.fn().mockResolvedValue(mockResponse);
    const ctx = createMockContext();

    await middleware(req, next, ctx);

    const passedReq = next.mock.calls[0][0];
    const headers = new Headers(passedReq.headers);
    expect(headers.get("Content-Type")).toBe("application/xml");
  });

  it("adds multiple headers", async () => {
    const middleware = headersMiddleware((headers) => {
      headers.set("X-Api-Key", "abc123");
      headers.set("X-Request-Id", "req-456");
      headers.set("Accept-Language", "en-US");
    });

    const req = createMockRequest("/api/test");
    const mockResponse = new Response(null, { status: 200 });
    const next = vi.fn().mockResolvedValue(mockResponse);
    const ctx = createMockContext();

    await middleware(req, next, ctx);

    const passedReq = next.mock.calls[0][0];
    const headers = new Headers(passedReq.headers);
    expect(headers.get("X-Api-Key")).toBe("abc123");
    expect(headers.get("X-Request-Id")).toBe("req-456");
    expect(headers.get("Accept-Language")).toBe("en-US");
  });

  it("preserves existing headers when adding new ones", async () => {
    const middleware = headersMiddleware((headers) => {
      headers.set("X-New-Header", "new-value");
    });

    const req = createMockRequest("/api/test", {
      "X-Existing": "existing-value",
    });
    const mockResponse = new Response(null, { status: 200 });
    const next = vi.fn().mockResolvedValue(mockResponse);
    const ctx = createMockContext();

    await middleware(req, next, ctx);

    const passedReq = next.mock.calls[0][0];
    const headers = new Headers(passedReq.headers);
    expect(headers.get("X-Existing")).toBe("existing-value");
    expect(headers.get("X-New-Header")).toBe("new-value");
  });

  it("can delete headers", async () => {
    const middleware = headersMiddleware((headers) => {
      headers.delete("X-Remove-Me");
    });

    const req = createMockRequest("/api/test", {
      "X-Remove-Me": "should-be-removed",
    });
    const mockResponse = new Response(null, { status: 200 });
    const next = vi.fn().mockResolvedValue(mockResponse);
    const ctx = createMockContext();

    await middleware(req, next, ctx);

    const passedReq = next.mock.calls[0][0];
    const headers = new Headers(passedReq.headers);
    expect(headers.has("X-Remove-Me")).toBe(false);
  });

  it("can append to existing header values", async () => {
    const middleware = headersMiddleware((headers) => {
      headers.append("Accept", "text/html");
    });

    const req = createMockRequest("/api/test", { Accept: "application/json" });
    const mockResponse = new Response(null, { status: 200 });
    const next = vi.fn().mockResolvedValue(mockResponse);
    const ctx = createMockContext();

    await middleware(req, next, ctx);

    const passedReq = next.mock.calls[0][0];
    const headers = new Headers(passedReq.headers);
    expect(headers.get("Accept")).toContain("application/json");
    expect(headers.get("Accept")).toContain("text/html");
  });

  it("passes response through unchanged", async () => {
    const middleware = headersMiddleware((headers) => {
      headers.set("X-Test", "value");
    });

    const req = createMockRequest("/api/test");
    const mockResponse = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "X-Response-Header": "response-value" },
    });
    const next = vi.fn().mockResolvedValue(mockResponse);
    const ctx = createMockContext();

    const result = await middleware(req, next, ctx);

    expect(result).toBe(mockResponse);
    expect(result.headers.get("X-Response-Header")).toBe("response-value");
  });

  it("works with empty builder function", async () => {
    const middleware = headersMiddleware(() => {
      // No-op
    });

    const req = createMockRequest("/api/test", { "X-Existing": "value" });
    const mockResponse = new Response(null, { status: 200 });
    const next = vi.fn().mockResolvedValue(mockResponse);
    const ctx = createMockContext();

    await middleware(req, next, ctx);

    const passedReq = next.mock.calls[0][0];
    const headers = new Headers(passedReq.headers);
    expect(headers.get("X-Existing")).toBe("value");
  });
});
