import { describe, it, expect, vi, beforeEach } from "vitest";
import { responseTransformMiddleware } from "./response-transform";
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

describe("responseTransformMiddleware", () => {
  let mockContext: SuitContext;

  beforeEach(() => {
    mockContext = createMockContext();
  });

  it("transforms response using transformer function", async () => {
    const transformer = vi.fn(async (res: Response) => {
      const json = await res.json();
      return new Response(JSON.stringify({ ...json, transformed: true }), {
        status: res.status,
        headers: res.headers,
      });
    });

    const middleware = responseTransformMiddleware(transformer);
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(JSON.stringify({ data: "original" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);
    const result = await middleware(req, next, mockContext);

    const json = await result.json();
    expect(json).toEqual({ data: "original", transformed: true });
    expect(transformer).toHaveBeenCalledWith(mockResponse, req);
  });

  it("passes request to transformer", async () => {
    const transformer = vi.fn(async (res: Response, request) => {
      return new Response(JSON.stringify({ url: request.url }), {
        status: res.status,
      });
    });

    const middleware = responseTransformMiddleware(transformer);
    const req = createMockRequest("/api/users/123");
    const mockResponse = new Response(null, { status: 200 });

    const next = vi.fn().mockResolvedValue(mockResponse);
    const result = await middleware(req, next, mockContext);

    const json = await result.json();
    expect(json.url).toBe("/api/users/123");
  });

  it("can modify response headers", async () => {
    const transformer = async (res: Response) => {
      const headers = new Headers(res.headers);
      headers.set("X-Custom-Header", "custom-value");
      return new Response(res.body, {
        status: res.status,
        headers,
      });
    };

    const middleware = responseTransformMiddleware(transformer);
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(null, { status: 200 });

    const next = vi.fn().mockResolvedValue(mockResponse);
    const result = await middleware(req, next, mockContext);

    expect(result.headers.get("X-Custom-Header")).toBe("custom-value");
  });

  it("can modify response status", async () => {
    const transformer = async (res: Response) => {
      return new Response(res.body, {
        status: 201,
        statusText: "Created",
        headers: res.headers,
      });
    };

    const middleware = responseTransformMiddleware(transformer);
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(null, { status: 200 });

    const next = vi.fn().mockResolvedValue(mockResponse);
    const result = await middleware(req, next, mockContext);

    expect(result.status).toBe(201);
  });

  it("skips transformation when request is aborted", async () => {
    const transformer = vi.fn(async (res: Response) => {
      return new Response(JSON.stringify({ transformed: true }), {
        status: res.status,
      });
    });

    const middleware = responseTransformMiddleware(transformer);
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(JSON.stringify({ original: true }), {
      status: 200,
    });

    mockContext.controller.abort();
    const next = vi.fn().mockResolvedValue(mockResponse);
    const result = await middleware(req, next, mockContext);

    expect(result).toBe(mockResponse);
    expect(transformer).not.toHaveBeenCalled();
  });

  it("supports synchronous transformer", async () => {
    const transformer = (res: Response) => {
      return new Response("sync transformed", {
        status: res.status,
        headers: res.headers,
      });
    };

    const middleware = responseTransformMiddleware(transformer);
    const req = createMockRequest("/api/test");
    const mockResponse = new Response("original", { status: 200 });

    const next = vi.fn().mockResolvedValue(mockResponse);
    const result = await middleware(req, next, mockContext);

    expect(await result.text()).toBe("sync transformed");
  });

  it("handles transformer that returns same response", async () => {
    const transformer = async (res: Response) => res;

    const middleware = responseTransformMiddleware(transformer);
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(JSON.stringify({ unchanged: true }), {
      status: 200,
    });

    const next = vi.fn().mockResolvedValue(mockResponse);
    const result = await middleware(req, next, mockContext);

    expect(result).toBe(mockResponse);
  });

  it("can wrap response body in envelope", async () => {
    const transformer = async (res: Response) => {
      const data = await res.json();
      return new Response(
        JSON.stringify({
          success: true,
          data,
          timestamp: Date.now(),
        }),
        {
          status: res.status,
          headers: { "Content-Type": "application/json" },
        },
      );
    };

    const middleware = responseTransformMiddleware(transformer);
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(JSON.stringify({ users: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);
    const result = await middleware(req, next, mockContext);

    const json = await result.json();
    expect(json.success).toBe(true);
    expect(json.data).toEqual({ users: [] });
    expect(json.timestamp).toBeTypeOf("number");
  });
});
