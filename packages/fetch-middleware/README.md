# Fetch Middleware

A flexible and composable middleware system for `fetch` API.

## Features

- 🎯 **Middleware Chain**: Compose multiple middlewares for request/response processing
- 🔄 **Native Response**: Keeps the original Response object intact, only adds properties
- ⚡ **Type-safe**: Full TypeScript support
- 🎨 **Flexible**: Easy to customize and extend
- 🚀 **Zero Dependencies**: Pure fetch-based implementation

## Installation

```bash
pnpm add fetch-middleware
```

## Core Concepts

### Middleware

A middleware is a function that intercepts requests and responses:

```typescript
import type { Middleware } from "fetch-middleware";

const myMiddleware: Middleware = async (req, next, ctx) => {
  // Before request
  console.log("Request:", req.url);

  // Call next middleware
  const res = await next(req);

  // After response
  console.log("Response:", res.status);

  return res;
};
```

## Built-in Middlewares

### jsonResponseMiddleware

Parses JSON responses and attaches to `_body` property:

```typescript
import { jsonResponseMiddleware } from "fetch-middleware";

const middleware = jsonResponseMiddleware();

// Response will have _body property with parsed JSON
const res = await fetch("/api/data");
console.log(res._body); // Parsed JSON data
```

### extractBodyMiddleware

Extracts `_body` from Response and returns it as the final result. Use this for REST clients:

```typescript
import {
  createRestClient,
  jsonResponseMiddleware,
  extractBodyMiddleware,
} from "fetch-middleware";

const client = createRestClient({
  baseUrl: "https://api.example.com",
  middlewares: [
    jsonResponseMiddleware(), // Parse JSON and attach to _body
    extractBodyMiddleware(), // Extract _body as final result
  ],
});

// Returns parsed data directly (not Response object)
const data = await client.get("/users");
console.log(data); // { users: [...] }
```

### httpErrorMiddleware

Handles HTTP errors with a simple callback. The middleware automatically parses error response body based on content-type:

```typescript
import { httpErrorMiddleware } from "fetch-middleware";
import { toast } from "./toast";

const middleware = httpErrorMiddleware({
  // URLs to skip error handling
  silentUrls: ["/api/refresh"],

  // Error handler receives status, body (auto-parsed), and response
  // Note: Handler is automatically skipped if request was aborted
  onError: async ({ status, body }) => {
    // body is automatically parsed:
    // - JSON responses → parsed object
    // - Text responses → string
    // - Other types → undefined
    const message = body?.message || body?.error || "";

    switch (status) {
      case 401:
      case 419:
      case 440:
        // Authentication errors
        window.location.href = "/login";
        toast.error("Please log in");
        break;

      case 500:
      case 502:
      case 503:
        // Server errors
        toast.error(message || "Server error");
        break;

      default:
        // Other errors
        if (status >= 400) {
          toast.error(message || `Error ${status}`);
        }
    }
  },

  // Whether to throw error after handling (default: true)
  throwError: true,
});
```

### ensureOkMiddleware

Throws an error if response is not ok:

```typescript
import { ensureOkMiddleware } from "fetch-middleware";

const middleware = ensureOkMiddleware();
```

### headersMiddleware

Add or modify request headers:

```typescript
import { headersMiddleware } from "fetch-middleware";

const middleware = headersMiddleware((headers) => {
  headers.set("Authorization", "Bearer token");
  headers.set("X-Custom-Header", "value");
});
```

## Advanced Usage

### Composing Middlewares

```typescript
import {
  createRestClient,
  jsonResponseMiddleware,
  httpErrorMiddleware,
  headersMiddleware,
  retryMiddleware,
} from "fetch-middleware";

const client = createRestClient({
  baseUrl: "https://api.example.com",
  fetchInit: {
    credentials: "include",
  },
  middlewares: [
    // Add headers
    headersMiddleware((headers) => {
      headers.set("Accept", "application/json");
    }),

    // Retry on failure
    retryMiddleware({ retries: 2 }),

    // Handle errors with toast
    httpErrorMiddleware({
      onError: ({ status, body }) => {
        toast.error(body?.message || `Error ${status}`);
      },
    }),

    // Parse JSON
    jsonResponseMiddleware(),
  ],
});
```

### Creating Custom Middleware

```typescript
import type { Middleware } from "fetch-middleware";

// Logging middleware
const loggingMiddleware = (): Middleware => {
  return async (req, next, ctx) => {
    const start = Date.now();
    console.log(`→ ${req.method} ${req.url}`);

    try {
      const res = await next(req);
      const duration = Date.now() - start;
      console.log(`← ${res.status} ${req.url} (${duration}ms)`);
      return res;
    } catch (error) {
      const duration = Date.now() - start;
      console.error(`✗ ${req.url} (${duration}ms)`, error);
      throw error;
    }
  };
};

// Auth middleware
const authMiddleware = (getToken: () => string): Middleware => {
  return async (req, next) => {
    const headers = new Headers(req.headers);
    headers.set("Authorization", `Bearer ${getToken()}`);
    return next({ ...req, headers });
  };
};
```

### Middleware Order Matters

Middlewares are executed in order:

```typescript
middlewares: [
  loggingMiddleware(), // 1. Log request
  authMiddleware(getToken), // 2. Add auth header
  httpErrorMiddleware({}), // 3. Handle errors
  jsonResponseMiddleware(), // 4. Parse JSON
];
```

The response flows in reverse order:

1. `jsonResponseMiddleware` parses JSON first
2. `httpErrorMiddleware` checks status and shows errors
3. `authMiddleware` receives the result
4. `loggingMiddleware` logs the response

## Design Principles

### Keep Response Native

All middlewares should preserve the native `Response` object:

```typescript
// ✅ Good: Add properties to Response
const middleware: Middleware = async (req, next) => {
  const res = await next(req);
  (res as any)._body = await res.clone().json();
  return res; // Still a native Response
};

// ❌ Bad: Return a new object
const middleware: Middleware = async (req, next) => {
  const res = await next(req);
  return { data: await res.json() }; // Lost native Response!
};
```

### Error Information

The `httpErrorMiddleware` provides essential error information:

```typescript
interface HttpErrorInfo {
  status: number; // HTTP status code (200, 401, 404, 500, etc.)
  statusText: string; // HTTP status text
  url: string; // Request URL
  body?: any; // Auto-parsed response body (JSON object, text string, or undefined)
  response: Response; // Native Response object
  signal: AbortSignal; // Abort signal (for advanced use)
}
```

**Response Body Parsing:**

- The middleware automatically parses error responses based on `content-type`:
  - `application/json` → parsed as object
  - `text/*` → returned as string
  - Other types → `undefined`
- Uses `response.clone()` to avoid consuming the original body

**Usage Notes:**

- Use switch/case on `status` to handle different HTTP status codes
- The error handler is automatically skipped if the request was aborted
- The middleware is independent and doesn't require other middlewares

## TypeScript Support

All functions are fully typed:

```typescript
import type {
  Middleware,
  HttpErrorInfo,
  HttpErrorHandler,
} from "fetch-middleware";

const handler: HttpErrorHandler = ({ status, body, signal }) => {
  // Fully typed parameters
};
```

## License

ISC
