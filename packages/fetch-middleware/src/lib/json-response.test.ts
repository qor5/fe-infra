import { describe, it, expect, vi, beforeEach } from "vitest";
import { jsonResponseMiddleware } from "./json-response";
import type { Request, SuitContext } from "../middleware";

function createMockContext(): SuitContext {
  const controller = new AbortController();
  return {
    controller,
    signal: controller.signal,
  };
}

function createMockRequest(url: string): Request {
  return {
    url,
    method: "GET",
    headers: {},
    body: null,
  };
}

describe("jsonResponseMiddleware", () => {
  let mockContext: SuitContext;

  beforeEach(() => {
    mockContext = createMockContext();
  });

  it("sets Accept header to application/json if not present", async () => {
    const middleware = jsonResponseMiddleware();
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);
    await middleware(req, next, mockContext);

    const passedReq = next.mock.calls[0][0];
    const headers = new Headers(passedReq.headers);
    expect(headers.get("Accept")).toBe("application/json");
  });

  it("does not override existing Accept header", async () => {
    const middleware = jsonResponseMiddleware();
    const req = createMockRequest("/api/test");
    req.headers = { Accept: "application/xml" };
    const mockResponse = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);
    await middleware(req, next, mockContext);

    const passedReq = next.mock.calls[0][0];
    const headers = new Headers(passedReq.headers);
    expect(headers.get("Accept")).toBe("application/xml");
  });

  it("parses JSON response and attaches to _body", async () => {
    const middleware = jsonResponseMiddleware();
    const req = createMockRequest("/api/test");
    const responseData = { users: [{ id: 1, name: "John" }] };
    const mockResponse = new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);
    const result = await middleware(req, next, mockContext);

    expect((result as any)._body).toEqual(responseData);
  });

  it("skips parsing for 204 No Content", async () => {
    const middleware = jsonResponseMiddleware();
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(null, {
      status: 204,
      headers: { "Content-Type": "application/json" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);
    const result = await middleware(req, next, mockContext);

    expect(result.status).toBe(204);
    expect((result as any)._body).toBeUndefined();
  });

  it("skips parsing for 205 Reset Content", async () => {
    const middleware = jsonResponseMiddleware();
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(null, {
      status: 205,
    });

    const next = vi.fn().mockResolvedValue(mockResponse);
    const result = await middleware(req, next, mockContext);

    expect(result.status).toBe(205);
  });

  it("skips parsing for 304 Not Modified", async () => {
    const middleware = jsonResponseMiddleware();
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(null, {
      status: 304,
    });

    const next = vi.fn().mockResolvedValue(mockResponse);
    const result = await middleware(req, next, mockContext);

    expect(result.status).toBe(304);
  });

  it("throws error for non-JSON content-type", async () => {
    const middleware = jsonResponseMiddleware();
    const req = createMockRequest("/api/test");
    const mockResponse = new Response("<html>Error</html>", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);

    await expect(middleware(req, next, mockContext)).rejects.toThrow(
      "Expected application/json response",
    );
  });

  it("throws error for invalid JSON body", async () => {
    const middleware = jsonResponseMiddleware();
    const req = createMockRequest("/api/test");
    const mockResponse = new Response("not valid json", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);

    await expect(middleware(req, next, mockContext)).rejects.toThrow(
      "Invalid JSON response body",
    );
  });

  it("returns response as-is when aborted", async () => {
    const middleware = jsonResponseMiddleware();
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    mockContext.controller.abort();
    const next = vi.fn().mockResolvedValue(mockResponse);
    const result = await middleware(req, next, mockContext);

    expect(result).toBe(mockResponse);
    expect((result as any)._body).toBeUndefined();
  });

  it("handles application/json with charset", async () => {
    const middleware = jsonResponseMiddleware();
    const req = createMockRequest("/api/test");
    const responseData = { ok: true };
    const mockResponse = new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);
    const result = await middleware(req, next, mockContext);

    expect((result as any)._body).toEqual(responseData);
  });
});
