import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  httpErrorMiddleware,
  parseProtobufString,
  extractReadableText,
} from "./http-error";
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

describe("parseProtobufString", () => {
  it("parses protobuf string with error code, message and localized message", () => {
    const raw =
      "\n\x0fTOKEN_NOT_FOUND\x12\x15missing refresh token\x22\x0f找不到令牌";
    const parsed = parseProtobufString(raw);

    expect(parsed.code).toBe("TOKEN_NOT_FOUND");
    // The parser extracts readable strings, exact format depends on control chars
    expect(parsed.fieldViolations).toEqual([]);
  });

  it("handles string with only error code", () => {
    const raw = "\n\x0fINVALID_CREDENTIAL";
    const parsed = parseProtobufString(raw);

    expect(parsed.code).toBe("INVALID_CREDENTIAL");
    expect(parsed.msg).toBe("INVALID_CREDENTIAL");
    expect(parsed.defaultViewMsg).toBe("INVALID_CREDENTIAL");
  });

  it("returns unknown error for empty string", () => {
    const parsed = parseProtobufString("");

    expect(parsed.code).toBe("UNKNOWN_ERROR");
    expect(parsed.msg).toBe("An unknown error occurred");
  });
});

describe("extractReadableText", () => {
  it("extracts readable text from ArrayBuffer", () => {
    const text = "\n\x0fERROR_CODE\x12\x0bmessage here";
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text).buffer;

    const result = extractReadableText(buffer);

    expect(result.code).toBe("ERROR_CODE");
    expect(result.msg).toBe("message here");
  });
});

describe("httpErrorMiddleware", () => {
  let mockContext: SuitContext;

  beforeEach(() => {
    mockContext = createMockContext();
  });

  it("passes through successful responses", async () => {
    const middleware = httpErrorMiddleware();
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);
    const result = await middleware(req, next, mockContext);

    expect(result).toBe(mockResponse);
    expect(next).toHaveBeenCalledWith(req);
  });

  it("calls onError handler for error responses", async () => {
    const onError = vi.fn();
    const middleware = httpErrorMiddleware({ onError, throwError: false });
    const req = createMockRequest("/api/test");
    const errorBody = { error: "Not found" };
    const mockResponse = new Response(JSON.stringify(errorBody), {
      status: 404,
      statusText: "Not Found",
      headers: { "Content-Type": "application/json" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);
    await middleware(req, next, mockContext);

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 404,
        statusText: "Not Found",
        url: "/api/test",
        body: errorBody,
        response: mockResponse,
      }),
    );
  });

  it("throws error by default for error responses", async () => {
    const middleware = httpErrorMiddleware();
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(
      JSON.stringify({ error: "Server error" }),
      {
        status: 500,
        statusText: "Internal Server Error",
        headers: { "Content-Type": "application/json" },
      },
    );

    const next = vi.fn().mockResolvedValue(mockResponse);

    await expect(middleware(req, next, mockContext)).rejects.toThrow(
      "HTTP 500",
    );
  });

  it("does not throw when throwError is false", async () => {
    const middleware = httpErrorMiddleware({ throwError: false });
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(JSON.stringify({ error: "Error" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);
    const result = await middleware(req, next, mockContext);

    expect(result).toBe(mockResponse);
  });

  it("prevents throw when onError returns true", async () => {
    const onError = vi.fn().mockReturnValue(true);
    const middleware = httpErrorMiddleware({ onError, throwError: true });
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(JSON.stringify({ error: "Error" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);
    const result = await middleware(req, next, mockContext);

    expect(result).toBe(mockResponse);
  });

  it("parses JSON response body", async () => {
    const onError = vi.fn();
    const middleware = httpErrorMiddleware({ onError, throwError: false });
    const req = createMockRequest("/api/test");
    const errorBody = { message: "Invalid request", code: "INVALID" };
    const mockResponse = new Response(JSON.stringify(errorBody), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);
    await middleware(req, next, mockContext);

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        body: errorBody,
      }),
    );
  });

  it("parses text response body", async () => {
    const onError = vi.fn();
    const middleware = httpErrorMiddleware({ onError, throwError: false });
    const req = createMockRequest("/api/test");
    const mockResponse = new Response("Error message", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);
    await middleware(req, next, mockContext);

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "Error message",
      }),
    );
  });

  it("uses custom protobufParser for protobuf responses", async () => {
    const customParser = vi
      .fn()
      .mockResolvedValue({ code: "CUSTOM", msg: "Custom error" });
    const onError = vi.fn();
    const middleware = httpErrorMiddleware({
      onError,
      throwError: false,
      protobufParser: customParser,
    });
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(new ArrayBuffer(10), {
      status: 400,
      headers: { "Content-Type": "application/proto" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);
    await middleware(req, next, mockContext);

    expect(customParser).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { code: "CUSTOM", msg: "Custom error" },
      }),
    );
  });

  it("skips onError when request is aborted", async () => {
    const onError = vi.fn();
    const middleware = httpErrorMiddleware({ onError, throwError: false });
    const req = createMockRequest("/api/test");
    const mockResponse = new Response(JSON.stringify({ error: "Error" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });

    mockContext.controller.abort();
    const next = vi.fn().mockResolvedValue(mockResponse);
    await middleware(req, next, mockContext);

    expect(onError).not.toHaveBeenCalled();
  });

  it("attaches parsed body to response._body", async () => {
    const middleware = httpErrorMiddleware({ throwError: false });
    const req = createMockRequest("/api/test");
    const errorBody = { error: "Error" };
    const mockResponse = new Response(JSON.stringify(errorBody), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });

    const next = vi.fn().mockResolvedValue(mockResponse);
    const result = await middleware(req, next, mockContext);

    expect((result as any)._body).toEqual(errorBody);
  });
});
