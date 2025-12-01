import { describe, it, expect, vi } from "vitest";
import { extractBodyMiddleware } from "./extract-body";
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

describe("extractBodyMiddleware", () => {
  it("extracts _body from response and returns it", async () => {
    const middleware = extractBodyMiddleware();
    const req = createMockRequest("/api/test");
    const responseData = { users: [{ id: 1, name: "John" }] };

    const mockResponse = new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    (mockResponse as any)._body = responseData;

    const next = vi.fn().mockResolvedValue(mockResponse);
    const ctx = createMockContext();

    const result = await middleware(req, next, ctx);

    expect(result).toEqual(responseData);
  });

  it("returns response as-is when _body is undefined", async () => {
    const middleware = extractBodyMiddleware();
    const req = createMockRequest("/api/test");

    const mockResponse = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    // _body is not set

    const next = vi.fn().mockResolvedValue(mockResponse);
    const ctx = createMockContext();

    const result = await middleware(req, next, ctx);

    expect(result).toBe(mockResponse);
  });

  it("handles null _body correctly", async () => {
    const middleware = extractBodyMiddleware();
    const req = createMockRequest("/api/test");

    const mockResponse = new Response(null, { status: 204 });
    (mockResponse as any)._body = null;

    const next = vi.fn().mockResolvedValue(mockResponse);
    const ctx = createMockContext();

    const result = await middleware(req, next, ctx);

    expect(result).toBeNull();
  });

  it("handles empty object _body", async () => {
    const middleware = extractBodyMiddleware();
    const req = createMockRequest("/api/test");

    const mockResponse = new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    (mockResponse as any)._body = {};

    const next = vi.fn().mockResolvedValue(mockResponse);
    const ctx = createMockContext();

    const result = await middleware(req, next, ctx);

    expect(result).toEqual({});
  });

  it("handles array _body", async () => {
    const middleware = extractBodyMiddleware();
    const req = createMockRequest("/api/test");
    const arrayData = [1, 2, 3, 4, 5];

    const mockResponse = new Response(JSON.stringify(arrayData), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    (mockResponse as any)._body = arrayData;

    const next = vi.fn().mockResolvedValue(mockResponse);
    const ctx = createMockContext();

    const result = await middleware(req, next, ctx);

    expect(result).toEqual(arrayData);
  });

  it("handles string _body", async () => {
    const middleware = extractBodyMiddleware();
    const req = createMockRequest("/api/test");

    const mockResponse = new Response('"hello"', {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    (mockResponse as any)._body = "hello";

    const next = vi.fn().mockResolvedValue(mockResponse);
    const ctx = createMockContext();

    const result = await middleware(req, next, ctx);

    expect(result).toBe("hello");
  });

  it("handles number _body", async () => {
    const middleware = extractBodyMiddleware();
    const req = createMockRequest("/api/test");

    const mockResponse = new Response("42", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    (mockResponse as any)._body = 42;

    const next = vi.fn().mockResolvedValue(mockResponse);
    const ctx = createMockContext();

    const result = await middleware(req, next, ctx);

    expect(result).toBe(42);
  });

  it("handles boolean false _body", async () => {
    const middleware = extractBodyMiddleware();
    const req = createMockRequest("/api/test");

    const mockResponse = new Response("false", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    (mockResponse as any)._body = false;

    const next = vi.fn().mockResolvedValue(mockResponse);
    const ctx = createMockContext();

    const result = await middleware(req, next, ctx);

    expect(result).toBe(false);
  });

  it("passes request through to next middleware", async () => {
    const middleware = extractBodyMiddleware();
    const req = createMockRequest("/api/test");

    const mockResponse = new Response(null, { status: 200 });
    const next = vi.fn().mockResolvedValue(mockResponse);
    const ctx = createMockContext();

    await middleware(req, next, ctx);

    expect(next).toHaveBeenCalledWith(req);
  });
});
