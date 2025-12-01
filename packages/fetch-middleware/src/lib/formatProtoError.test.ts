import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatProtoErrorMiddleware } from "./formatProtoError";
import type { Request, SuitContext } from "../middleware";

// Mock the proto-errors module to avoid protobuf parsing issues
vi.mock("../utils/proto-errors", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {
    name = "UnauthorizedError";
    errors = {};
    constructor(url: string, _body: Uint8Array) {
      super(`Unauthorized error on ${url}`);
    }
  },
  AuthenticationError: class AuthenticationError extends Error {
    name = "AuthenticationError";
    errors = {};
    constructor(url: string, _body: Uint8Array) {
      super(`Authentication error on ${url}`);
    }
  },
  NotFoundError: class NotFoundError extends Error {
    name = "NotFoundError";
    errors = {};
    constructor(url: string, _body: Uint8Array) {
      super(`Not found error on ${url}`);
    }
  },
  ValidationError: class ValidationError extends Error {
    name = "ValidationError";
    errors = {};
    constructor(_body: Uint8Array, url: string) {
      super(`Validation error on ${url}`);
    }
  },
  ServiceError: class ServiceError extends Error {
    name = "ServiceError";
    errors = {};
    constructor(url: string, _body: Uint8Array) {
      super(`Service error on ${url}`);
    }
  },
  AppError: class AppError extends Error {
    name = "AppError";
    errors = {};
    constructor(url: string, _body: Uint8Array) {
      super(`App error on ${url}`);
    }
  },
}));

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

describe("formatProtoErrorMiddleware", () => {
  let mockContext: SuitContext;

  beforeEach(() => {
    mockContext = createMockContext();
  });

  it("passes through successful responses", async () => {
    const middleware = formatProtoErrorMiddleware();
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);
    const result = await middleware(req, next, mockContext);

    expect(result).toBe(mockResponse);
  });

  it("passes through JSON error responses for connect-es handling", async () => {
    const middleware = formatProtoErrorMiddleware();
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(
      JSON.stringify({ code: "invalid_argument", message: "Error" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );

    const next = vi.fn().mockResolvedValue(mockResponse);
    const result = await middleware(req, next, mockContext);

    expect(result).toBe(mockResponse);
  });

  it("throws error with name UnauthorizedError for 401 status", async () => {
    const middleware = formatProtoErrorMiddleware();
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(new ArrayBuffer(10), {
      status: 401,
      headers: { "Content-Type": "application/proto" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);

    await expect(middleware(req, next, mockContext)).rejects.toThrow(
      "Unauthorized error",
    );
  });

  it("throws error with name AuthenticationError for 403 status", async () => {
    const middleware = formatProtoErrorMiddleware();
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(new ArrayBuffer(10), {
      status: 403,
      headers: { "Content-Type": "application/proto" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);

    await expect(middleware(req, next, mockContext)).rejects.toThrow(
      "Authentication error",
    );
  });

  it("throws error with name NotFoundError for 404 status", async () => {
    const middleware = formatProtoErrorMiddleware();
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(new ArrayBuffer(10), {
      status: 404,
      headers: { "Content-Type": "application/proto" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);

    await expect(middleware(req, next, mockContext)).rejects.toThrow(
      "Not found error",
    );
  });

  it("throws error with name ValidationError for 422 status", async () => {
    const middleware = formatProtoErrorMiddleware();
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(new ArrayBuffer(10), {
      status: 422,
      headers: { "Content-Type": "application/proto" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);

    await expect(middleware(req, next, mockContext)).rejects.toThrow(
      "Validation error",
    );
  });

  it("throws error with name ServiceError for 500 status", async () => {
    const middleware = formatProtoErrorMiddleware();
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(new ArrayBuffer(10), {
      status: 500,
      headers: { "Content-Type": "application/proto" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);

    await expect(middleware(req, next, mockContext)).rejects.toThrow(
      "Service error",
    );
  });

  it("throws error with name ServiceError for 502 status", async () => {
    const middleware = formatProtoErrorMiddleware();
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(new ArrayBuffer(10), {
      status: 502,
      headers: { "Content-Type": "application/proto" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);

    await expect(middleware(req, next, mockContext)).rejects.toThrow(
      "Service error",
    );
  });

  it("throws error with name ServiceError for 503 status", async () => {
    const middleware = formatProtoErrorMiddleware();
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(new ArrayBuffer(10), {
      status: 503,
      headers: { "Content-Type": "application/proto" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);

    await expect(middleware(req, next, mockContext)).rejects.toThrow(
      "Service error",
    );
  });

  it("throws error with name AppError for other non-200 status codes", async () => {
    const middleware = formatProtoErrorMiddleware();
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(new ArrayBuffer(10), {
      status: 400,
      headers: { "Content-Type": "application/proto" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);

    await expect(middleware(req, next, mockContext)).rejects.toThrow(
      "App error",
    );
  });

  it("throws error with error name for 404 status", async () => {
    const middleware = formatProtoErrorMiddleware();
    const req = createMockRequest("/api/users/123");
    const mockResponse = new Response(new ArrayBuffer(10), {
      status: 404,
      headers: { "Content-Type": "application/proto" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);

    try {
      await middleware(req, next, mockContext);
      expect.fail("Should have thrown");
    } catch (error) {
      expect((error as Error).name).toBe("NotFoundError");
    }
  });

  it("handles non-JSON error responses as proto error", async () => {
    const middleware = formatProtoErrorMiddleware();
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(new ArrayBuffer(10), {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);

    await expect(middleware(req, next, mockContext)).rejects.toThrow(
      "Service error",
    );
  });

  it("throws AppError for non-200 2xx responses without JSON content-type", async () => {
    const middleware = formatProtoErrorMiddleware();
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(new ArrayBuffer(10), {
      status: 201,
      headers: { "Content-Type": "application/proto" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);

    // 201 is not 200, so it falls into the "else if (status !== 200)" branch
    await expect(middleware(req, next, mockContext)).rejects.toThrow(
      "App error",
    );
  });
});
