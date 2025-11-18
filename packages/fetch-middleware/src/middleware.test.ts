import { describe, expect, it, vi, beforeEach } from "vitest";
import { composeMiddlewares, type Middleware } from "./middleware";
import { responseTransformMiddleware } from "./lib/response-transform";

describe("Middleware Onion Model", () => {
  let executionLog: string[];

  beforeEach(() => {
    executionLog = [];
  });

  // Helper to create a logging middleware
  const createLoggingMiddleware = (name: string): Middleware => {
    return async (req, next, ctx) => {
      executionLog.push(`${name}-before`);
      const res = await next(req);
      executionLog.push(`${name}-after`);
      return res;
    };
  };

  it("executes middlewares in onion model (outside-in, then inside-out)", async () => {
    const mockFetcher = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const handler = composeMiddlewares(
      [
        createLoggingMiddleware("outer"),
        createLoggingMiddleware("middle"),
        createLoggingMiddleware("inner"),
      ],
      { fetcher: mockFetcher },
    );

    await handler({ url: "/test", method: "GET" });

    // Request phase: outer -> middle -> inner -> fetch
    // Response phase: fetch -> inner -> middle -> outer
    expect(executionLog).toEqual([
      "outer-before",
      "middle-before",
      "inner-before",
      "inner-after",
      "middle-after",
      "outer-after",
    ]);
  });

  it("passes request through middleware chain", async () => {
    const mockFetcher = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const addHeaderMiddleware: Middleware = async (req, next) => {
      const headers = new Headers(req.headers);
      headers.set("X-Custom", "value");
      return next({ ...req, headers });
    };

    const checkHeaderMiddleware: Middleware = async (req, next) => {
      const headers = new Headers(req.headers);
      expect(headers.get("X-Custom")).toBe("value");
      return next(req);
    };

    const handler = composeMiddlewares(
      [addHeaderMiddleware, checkHeaderMiddleware],
      { fetcher: mockFetcher },
    );

    await handler({ url: "/test", method: "GET" });
  });

  it("allows middleware to modify response", async () => {
    const mockFetcher = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const addStatusHeaderMiddleware: Middleware = async (req, next) => {
      const res = await next(req);
      const headers = new Headers(res.headers);
      headers.set("X-Status", String(res.status));
      return new Response(res.body, {
        status: res.status,
        headers,
      });
    };

    const handler = composeMiddlewares([addStatusHeaderMiddleware], {
      fetcher: mockFetcher,
    });

    const res = await handler({ url: "/test", method: "GET" });
    expect(res.headers.get("X-Status")).toBe("200");
  });

  it("supports multiple layers of response transformation", async () => {
    const wrapInData: Middleware = async (req, next) => {
      const res = await next(req);
      const json = await res.json();
      return new Response(JSON.stringify({ data: json }), {
        status: res.status,
        headers: res.headers,
      });
    };

    const addTimestamp: Middleware = async (req, next) => {
      const res = await next(req);
      const json = await res.json();
      return new Response(JSON.stringify({ ...json, timestamp: Date.now() }), {
        status: res.status,
        headers: res.headers,
      });
    };

    // Custom fetcher that returns simple JSON
    const mockFetcher = vi.fn(
      async () => new Response(JSON.stringify({ value: 42 }), { status: 200 }),
    );

    const handler = composeMiddlewares([wrapInData, addTimestamp], {
      fetcher: mockFetcher,
    });

    const res = await handler({ url: "/test", method: "GET" });
    const json = await res.json();

    expect(json).toHaveProperty("data");
    expect(json.data).toHaveProperty("value", 42);
    expect(json.data).toHaveProperty("timestamp");
    expect(typeof json.data.timestamp).toBe("number");
  });

  it("handles errors thrown in middleware", async () => {
    const errorMiddleware: Middleware = async () => {
      throw new Error("Middleware error");
    };

    const handler = composeMiddlewares([errorMiddleware]);

    await expect(handler({ url: "/test", method: "GET" })).rejects.toThrow(
      "Middleware error",
    );
  });

  it("catches errors and allows error handling middleware", async () => {
    const throwingMiddleware: Middleware = async () => {
      throw new Error("Intentional error");
    };

    const errorCatcherMiddleware: Middleware = async (req, next) => {
      try {
        return await next(req);
      } catch (error) {
        executionLog.push("error-caught");
        return new Response(
          JSON.stringify({ error: (error as Error).message }),
          { status: 500 },
        );
      }
    };

    const handler = composeMiddlewares([
      errorCatcherMiddleware,
      throwingMiddleware,
    ]);

    const res = await handler({ url: "/test", method: "GET" });
    expect(res.status).toBe(500);
    expect(executionLog).toContain("error-caught");
  });

  it("supports cancellation via AbortController", async () => {
    const delayMiddleware: Middleware = async (req, next) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return next(req);
    };

    const handler = composeMiddlewares([delayMiddleware]);

    const promise = handler({ url: "/test", method: "GET" });

    // Cancel immediately
    promise.cancel();

    await expect(promise).rejects.toThrow();
  });

  it("exposes controller and signal on cancelable promise", async () => {
    const mockFetcher = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const handler = composeMiddlewares([], { fetcher: mockFetcher });

    const promise = handler({ url: "/test", method: "GET" });

    expect(promise.cancel).toBeTypeOf("function");
    expect(promise.controller).toBeInstanceOf(AbortController);
    expect(promise.signal).toBeInstanceOf(AbortSignal);

    await promise; // Clean up
  });

  it("respects external AbortSignal", async () => {
    const externalController = new AbortController();

    const checkSignalMiddleware: Middleware = async (req, next, ctx) => {
      // External signal should propagate to context
      expect(req.signal).toBe(externalController.signal);
      return next(req);
    };

    const handler = composeMiddlewares([checkSignalMiddleware]);

    externalController.abort();

    await expect(
      handler({
        url: "/test",
        method: "GET",
        signal: externalController.signal,
      }),
    ).rejects.toThrow();
  });

  it("middleware can short-circuit the chain", async () => {
    const shortCircuitMiddleware: Middleware = async () => {
      executionLog.push("short-circuit");
      return new Response(JSON.stringify({ shortCircuited: true }), {
        status: 200,
      });
    };

    const neverReachedMiddleware: Middleware = async (req, next) => {
      executionLog.push("never-reached");
      return next(req);
    };

    const handler = composeMiddlewares([
      shortCircuitMiddleware,
      neverReachedMiddleware,
    ]);

    const res = await handler({ url: "/test", method: "GET" });
    const json = await res.json();

    expect(json.shortCircuited).toBe(true);
    expect(executionLog).toEqual(["short-circuit"]);
    expect(executionLog).not.toContain("never-reached");
  });

  it("executes with custom fetcher", async () => {
    const mockFetcher = vi.fn(
      async (url: RequestInfo | URL) =>
        new Response(JSON.stringify({ url: url.toString() }), { status: 200 }),
    );

    const handler = composeMiddlewares([], { fetcher: mockFetcher });

    await handler({ url: "/custom", method: "POST" });

    expect(mockFetcher).toHaveBeenCalledWith("/custom", {
      method: "POST",
      headers: undefined,
      body: undefined,
      signal: expect.any(AbortSignal),
    });
  });
});

describe("responseTransformMiddleware", () => {
  it("transforms the response before returning", async () => {
    const transformer = vi.fn(async (res: Response) => {
      const json = await res.json();
      return new Response(JSON.stringify({ ...json, transformed: true }), {
        status: res.status,
        headers: res.headers,
      });
    });

    const mockFetcher = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const handler = composeMiddlewares(
      [responseTransformMiddleware(transformer)],
      { fetcher: mockFetcher },
    );

    const promise = handler({ url: "/ping", method: "GET" });
    expect(promise.cancel).toBeTypeOf("function");
    const res = await promise;
    const payload = await res.json();

    expect(payload).toEqual({ ok: true, transformed: true });
    expect(transformer).toHaveBeenCalledOnce();
  });
});
