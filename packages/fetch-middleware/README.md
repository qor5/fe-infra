# Fetch Middleware

A flexible and composable middleware system for `fetch` API with support for both REST and Connect-RPC.

## Features

- 🎯 **Middleware Chain**: Compose multiple middlewares for request/response processing
- 🔄 **Native Response**: Keeps the original Response object intact, only adds properties
- ⚡ **Type-safe**: Full TypeScript support with full generics support
- 🎨 **Flexible**: Easy to customize and extend
- 🔌 **Connect-RPC Ready**: Built-in support for Connect-RPC and Protobuf errors
- 🚀 **Minimal Dependencies**: Lightweight implementation

## Installation

### From GitHub Packages

```bash
# Configure npm to use GitHub Packages (one-time setup)
echo "@theplant:registry=https://npm.pkg.github.com" >> .npmrc

# Install the package
pnpm add @theplant/fetch-middleware
```

### From npm (if published)

```bash
pnpm add @theplant/fetch-middleware
```

## Core Concepts

### Middleware

A middleware is a function that intercepts requests and responses:

```typescript
import type { Middleware } from "@theplant/fetch-middleware";

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

### Quick Start

#### REST Client

```typescript
import {
  createFetchClient,
  jsonResponseMiddleware,
  extractBodyMiddleware,
  httpErrorMiddleware,
} from "@theplant/fetch-middleware";

// Create a REST client
const client = createFetchClient({
  baseUrl: "https://api.example.com",
  fetchInit: {
    credentials: "include",
  },
  middlewares: [
    extractBodyMiddleware(), // Extract _body as final result
    jsonResponseMiddleware(), // Parse JSON and attach to _body
    httpErrorMiddleware(), // Handle HTTP errors
  ],
});

// Use the client
const users = await client.get<User[]>("/users");
const user = await client.post<User>("/users", { name: "John" });
```

#### Connect-RPC Client

```typescript
import {
  createFetchClient,
  formatProtoErrorMiddleware,
  parseConnectError,
} from "@theplant/fetch-middleware";
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";

// Use binary format (protobuf) instead of JSON
const useBinaryFormat = false;

// Create fetch client for Connect-RPC
const fetchClient = createFetchClient({
  fetchInit: {
    credentials: "include",
    headers: {
      Accept: useBinaryFormat ? "application/proto" : "application/json",
      // Ensure server returns Connect standard error format with Details
      "X-Ensure-Connect-Error": "true",
    },
  },
  middlewares: [formatProtoErrorMiddleware()],
});

// Create Connect transport with the fetch client
const transport = createConnectTransport({
  baseUrl: "http://localhost:8787",
  useBinaryFormat,
  fetch: fetchClient, // Pass as fetch handler
});

// Create RPC client
const client = createClient(YourService, transport);

// Handle errors
try {
  await client.login(credentials);
} catch (err) {
  const parsed = parseConnectError(err);
  console.log(parsed.code); // Connect error code
  console.log(parsed.validationError); // ValidationError details
}
```

## Built-in Middlewares

### jsonResponseMiddleware

Parses JSON responses and attaches to `_body` property:

```typescript
import { jsonResponseMiddleware } from "@theplant/fetch-middleware";

const middleware = jsonResponseMiddleware();

// Response will have _body property with parsed JSON
const res = await fetch("/api/data");
console.log(res._body); // Parsed JSON data
```

### extractBodyMiddleware

Extracts `_body` from Response and returns it as the final result. Use this for REST clients:

```typescript
import {
  createFetchClient,
  jsonResponseMiddleware,
  extractBodyMiddleware,
} from "@theplant/fetch-middleware";

const client = createFetchClient({
  baseUrl: "https://api.example.com",
  middlewares: [
    extractBodyMiddleware(), // Extract _body as final result
    jsonResponseMiddleware(), // Parse JSON and attach to _body
  ],
});

// Returns parsed data directly (not Response object)
const data = await client.get("/users");
console.log(data); // { users: [...] }
```

### formatProtoErrorMiddleware

Handles Protobuf (ProTTP) and JSON (Connect) error responses. For Proto errors, it parses the protobuf ValidationError and throws typed errors. For JSON errors, it lets connect-es handle the error parsing:

```typescript
import { formatProtoErrorMiddleware } from "@theplant/fetch-middleware";

const middleware = formatProtoErrorMiddleware();

// Automatically throws typed errors:
// - UnauthorizedError (401)
// - AuthenticationError (403)
// - NotFoundError (404)
// - ValidationError (422)
// - ServiceError (500+)
// - AppError (other errors)
```

### httpErrorMiddleware

Handles HTTP errors with a simple callback. The middleware automatically parses error response body based on content-type:

```typescript
import { httpErrorMiddleware } from "@theplant/fetch-middleware";
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

### headersMiddleware

Add or modify request headers:

```typescript
import { headersMiddleware } from "@theplant/fetch-middleware";

const middleware = headersMiddleware((headers) => {
  headers.set("Authorization", "Bearer token");
  headers.set("X-Custom-Header", "value");
});
```

### requestQueueMiddleware

Manages request queues for handling authentication refresh and automatic retry. Supports single or multiple queue configurations with **INDEPENDENT QUEUES**. Each config maintains its own queue state to avoid conflicts.

When a response matches the trigger condition (e.g., 401 unauthorized), this middleware:

1. Cancels all other pending requests that match **THE SAME config**
2. Adds them to **THE CONFIG'S independent queue** while keeping their promises pending
3. Calls the config's `next()` callback (e.g., to refresh session)
4. If `next()` resolves: retries all requests in **THIS config's queue**
5. If `next()` rejects: rejects all requests in **THIS config's queue** with error

**IMPORTANT**: Multiple configs with overlapping matchRule will NOT interfere with each other. Each config processes its own queue independently.

**Basic usage (single configuration):**

```typescript
import { requestQueueMiddleware } from "@theplant/fetch-middleware";

const middleware = requestQueueMiddleware({
  // Determine if response should trigger queue management
  queueTrigger: ({ response, request, ctx }) => {
    return response.status === 401;
  },
  // Callback to handle the trigger (e.g., refresh session)
  // resolve = retry all queued requests
  // reject = reject all queued requests
  next: async () => {
    await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
  },
});
```

**Multiple configurations (array):**

```typescript
const middleware = requestQueueMiddleware([
  // Handle 401 - session expired
  {
    queueTrigger: ({ response }) => response.status === 401,
    next: async () => {
      await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
    },
  },
  // Handle 403 with specific code - permission expired
  {
    queueTrigger: async ({ response }) => {
      if (response.status === 403) {
        try {
          const body = await response.clone().json();
          return body.code === "PERMISSION_EXPIRED";
        } catch {
          return false;
        }
      }
      return false;
    },
    next: async () => {
      await fetch("/api/permissions/refresh", {
        method: "POST",
        credentials: "include",
      });
    },
  },
]);

// SAFE: Even if a request matches BOTH configs
fetchClient.get("/api/admin", {
  meta: { needAuth: true, needPermission: true },
});
// - If it returns 401, only config 1 triggers, only its queue is used
// - If it returns 403, only config 2 triggers, only its queue is used
// - Each config processes independently, NO interference
```

**With metadata filtering (matchRule):**

```typescript
const middleware = requestQueueMiddleware({
  // Only manage requests with needAuth: true
  matchRule: ({ meta }) => meta?.needAuth === true,
  queueTrigger: ({ response }) => response.status === 401,
  next: async () => {
    await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
  },
});

// Usage in API calls
const fetchClient = createFetchClient({
  middlewares: [extractBodyMiddleware(), jsonResponseMiddleware(), middleware],
});

// This request will be managed by queue (needAuth: true)
const user = await fetchClient.get("/api/user", {
  meta: { needAuth: true },
});

// This request will NOT be managed by queue (no needAuth)
const publicData = await fetchClient.get("/api/public");

// This request will NOT be managed by queue (needAuth: false)
const config = await fetchClient.get("/api/config", {
  meta: { needAuth: false },
});
```

**Advanced filtering with URL pattern:**

```typescript
const middleware = requestQueueMiddleware({
  // Only manage authenticated requests to /api/user/* endpoints
  matchRule: ({ request, meta }) => {
    return request.url.includes("/api/user") && meta?.needAuth === true;
  },
  queueTrigger: ({ response }) => response.status === 401,
  next: async () => {
    await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
  },
});

// Multiple conditions
const middleware2 = requestQueueMiddleware({
  matchRule: ({ request, meta, ctx }) => {
    // Match by URL pattern
    const isApiEndpoint = request.url.startsWith("/api/");
    // Match by metadata
    const requiresAuth = meta?.needAuth === true;
    // Match by method
    const isModifying = ["POST", "PUT", "PATCH", "DELETE"].includes(
      request.method,
    );
    // Combine conditions
    return isApiEndpoint && requiresAuth && !ctx.signal.aborted;
  },
  queueTrigger: ({ response }) => response.status === 401,
  next: async () => {
    await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
  },
});
```

**Advanced usage with custom trigger logic:**

```typescript
const middleware = requestQueueMiddleware({
  queueTrigger: async ({ response, request }) => {
    // Check status code
    if (response.status === 401) {
      return true;
    }
    // Check response body
    if (response.status === 403) {
      try {
        const body = await response.clone().json();
        return body.code === "SESSION_EXPIRED";
      } catch {
        return false;
      }
    }
    return false;
  },
  next: async () => {
    const refreshResponse = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
    if (!refreshResponse.ok) {
      throw new Error("Failed to refresh session");
    }
  },
});
```

**Execution flow example (concurrent requests):**

```
Scenario: 4 concurrent requests with 2 independent queue configs

T0: Requests A, B, C, D initiated simultaneously
    |
    ├─ A: sending... (needAuth + needPermission)
    ├─ B: sending... (needAuth)
    ├─ C: sending... (needPermission)
    └─ D: sending... (no metadata)

T1: Request A returns 401 first
    |
    ├─ Detect 401, trigger configState0 (auth config)
    ├─ configState0.isRefreshing = true
    ├─ Cancel request B (still pending, matches configState0)
    ├─ Add A, B to configState0.requestQueue
    └─ Call refreshSession() ← Called ONCE for all matched requests!

T2: Request B's cancel callback triggered
    |
    └─ Receives AbortError
       └─ Check isAnyRefreshing → configState0.isRefreshing = true
          └─ Don't reject, B is already in queue waiting for retry

T3: refreshSession() completes successfully
    |
    └─ processQueue(configState0, true) ← Process all queued requests
       |
       ├─ Retry request A (with original params)
       ├─ Request A returns 200 → resolve A's promise ✅
       ├─ Retry request B (with original params)
       └─ Request B returns 200 → resolve B's promise ✅

T4: Request C returns 403
    |
    ├─ Detect 403, trigger configState1 (permission config)
    ├─ configState1.isRefreshing = true
    ├─ Add C to configState1.requestQueue
    └─ Call refreshPermissions() ← Independent, called ONCE!

T5: refreshPermissions() completes successfully
    |
    └─ processQueue(configState1, true)
       |
       ├─ Retry request C
       └─ Request C returns 200 → resolve C's promise ✅

Final result:
- refreshSession() called: 1 time (shared by A and B)
- refreshPermissions() called: 1 time (for C only)
- Request A: ✅ triggered 401 → queued → waited for refreshSession → retried
- Request B: ✅ canceled → queued → waited for refreshSession → retried
- Request C: ✅ triggered 403 → queued → waited for refreshPermissions → retried
- Request D: ✅ completed directly (no queue management)
```

**Key features:**

- Generic trigger condition based on response, request, context, or metadata
- Supports single or multiple queue configurations
- **Request metadata filtering**: Use `matchRule` to control which requests are managed by queue
- **Custom metadata**: Pass `meta` in request options to tag requests (e.g., `needAuth`, `skipQueue`)
- **Shared refresh**: Multiple requests matching the same config share ONE refresh callback
- Automatic cancellation of pending requests
- Promise queuing keeps original promises pending during refresh
- Automatic retry with original parameters after successful refresh
- Type-safe with full TypeScript support

## Error Handling

### parseConnectError

Parse ConnectError into structured error information. Works with both Proto (ProTTP) and JSON (Connect) errors:

```typescript
import { parseConnectError } from "@theplant/fetch-middleware";

try {
  await client.login(credentials);
} catch (err) {
  const parsed = parseConnectError(err);

  // Access structured error information
  console.log(parsed.code); // Connect error code (e.g., "invalid_argument")
  console.log(parsed.message); // Error message
  console.log(parsed.rawMessage); // Raw error message
  console.log(parsed.localizedMessage); // Localized message (if available)
  console.log(parsed.errorInfo); // ErrorInfo details
  console.log(parsed.badRequest); // BadRequest details
  console.log(parsed.validationError); // ValidationError with field errors
  console.log(parsed.cause); // Original error cause
}
```

### Typed Error Classes

The library provides typed error classes for common HTTP errors:

```typescript
import {
  UnauthorizedError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
  ServiceError,
  AppError,
} from "@theplant/fetch-middleware";

try {
  await fetchData();
} catch (err) {
  if (err instanceof UnauthorizedError) {
    // Handle 401 errors
    console.log(err.errors); // ValidationError with details
  } else if (err instanceof ValidationError) {
    // Handle 422 validation errors
    console.log(err.errors.fieldErrors); // Field-specific errors
  }
}
```

## Advanced Usage

### Composing Middlewares

```typescript
import {
  createFetchClient,
  jsonResponseMiddleware,
  extractBodyMiddleware,
  httpErrorMiddleware,
  headersMiddleware,
} from "@theplant/fetch-middleware";

const client = createFetchClient({
  baseUrl: "https://api.example.com",
  fetchInit: {
    credentials: "include",
  },
  middlewares: [
    // Add headers
    headersMiddleware((headers) => {
      headers.set("Accept", "application/json");
    }),

    // Extract body (for REST API)
    extractBodyMiddleware(),

    // Parse JSON
    jsonResponseMiddleware(),

    // Handle errors with toast
    httpErrorMiddleware({
      onError: ({ status, body }) => {
        toast.error(body?.message || `Error ${status}`);
      },
    }),
  ],
});
```

### Creating Custom Middleware

```typescript
import type { Middleware } from "@theplant/fetch-middleware";

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

// Retry middleware
const retryMiddleware = (maxRetries = 3): Middleware => {
  return async (req, next) => {
    let lastError;
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await next(req);
      } catch (error) {
        lastError = error;
        if (i < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
    }
    throw lastError;
  };
};
```

### Middleware Order Matters

Middlewares are executed in order:

```typescript
middlewares: [
  loggingMiddleware(), // 1. Log request
  authMiddleware(getToken), // 2. Add auth header
  extractBodyMiddleware(), // 3. Extract body (REST only)
  jsonResponseMiddleware(), // 4. Parse JSON
  httpErrorMiddleware({}), // 5. Handle errors
];
```

The response flows in reverse order:

1. `httpErrorMiddleware` handles errors first
2. `jsonResponseMiddleware` parses JSON
3. `extractBodyMiddleware` extracts body
4. `authMiddleware` receives the result
5. `loggingMiddleware` logs the response

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

### Dual-Mode Support

The `createFetchClient` function returns a hybrid that works as both:

1. **Fetch Handler**: Can be passed to libraries like connect-es
2. **REST Client**: Provides convenience methods (get, post, etc.)

```typescript
const client = createFetchClient({ middlewares: [...] });

// As fetch handler (for connect-es)
const transport = createConnectTransport({ fetch: client });

// As REST client
const data = await client.get('/api/users');
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

## Complete Examples

### REST API Client with Error Handling

```typescript
import {
  createFetchClient,
  jsonResponseMiddleware,
  extractBodyMiddleware,
  httpErrorMiddleware,
  headersMiddleware,
} from "@theplant/fetch-middleware";
import { toast } from "@/lib/toast";

const apiClient = createFetchClient({
  baseUrl: "https://api.example.com",
  fetchInit: {
    credentials: "include",
  },
  middlewares: [
    // Add headers
    headersMiddleware((headers) => {
      headers.set("Accept", "application/json");
      const token = localStorage.getItem("token");
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    }),

    // Extract body as final result
    extractBodyMiddleware(),

    // Parse JSON responses
    jsonResponseMiddleware(),

    // Handle HTTP errors
    httpErrorMiddleware({
      onError: async ({ status, body }) => {
        const message = body?.message || `Error ${status}`;

        if (status === 401) {
          toast.error("Please log in");
          window.location.href = "/login";
        } else if (status >= 500) {
          toast.error("Server error. Please try again later.");
        } else {
          toast.error(message);
        }
      },
    }),
  ],
});

// Usage
interface User {
  id: string;
  name: string;
  email: string;
}

const users = await apiClient.get<User[]>("/users");
const user = await apiClient.post<User>("/users", {
  name: "John Doe",
  email: "john@example.com",
});
```

### Connect-RPC Client with Interceptors

```typescript
import {
  createFetchClient,
  formatProtoErrorMiddleware,
  parseConnectError,
} from "@theplant/fetch-middleware";
import { createClient, type Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { AuthService } from "./proto/auth_pb";
import { toast } from "@/lib/toast";

// Use binary format (protobuf) instead of JSON
const useBinaryFormat = false;

// Create fetch client with Proto error handling
const fetchClient = createFetchClient({
  fetchInit: {
    credentials: "include",
    headers: {
      Accept: useBinaryFormat ? "application/proto" : "application/json",
      // Ensure server returns Connect standard error format with Details
      "X-Ensure-Connect-Error": "true",
    },
  },
  middlewares: [formatProtoErrorMiddleware()],
});

// Create error interceptor
const errorInterceptor: Interceptor = (next) => async (req) => {
  try {
    return await next(req);
  } catch (err) {
    const parsed = parseConnectError(err);

    // Log error details
    console.error("[RPC Error]", {
      code: parsed.code,
      message: parsed.message,
      validationError: parsed.validationError,
    });

    // Show user-friendly error
    if (parsed.validationError?.fieldErrors?.length) {
      const firstError = parsed.validationError.fieldErrors[0];
      toast.error(`${firstError.field}: ${firstError.description}`);
    } else if (parsed.localizedMessage) {
      toast.error(parsed.localizedMessage);
    } else {
      toast.error(parsed.message);
    }

    throw err;
  }
};

// Create Connect transport
const transport = createConnectTransport({
  baseUrl: "http://localhost:8787",
  useBinaryFormat,
  fetch: fetchClient,
  interceptors: [errorInterceptor],
});

// Create RPC client
const authClient = createClient(AuthService, transport);

// Usage
try {
  const response = await authClient.login({
    email: "user@example.com",
    password: "password123",
  });
  console.log("Login successful:", response);
} catch (err) {
  // Error already handled by interceptor
  console.error("Login failed");
}
```

## TypeScript Support

All functions are fully typed:

```typescript
import type {
  Middleware,
  HttpErrorInfo,
  HttpErrorHandler,
  RestClient,
  FetchHandler,
} from "@theplant/fetch-middleware";

// Fully typed middleware
const myMiddleware: Middleware = async (req, next, ctx) => {
  return await next(req);
};

// Fully typed error handler
const errorHandler: HttpErrorHandler = ({ status, body, signal }) => {
  // All parameters are fully typed
};

// Fully typed client
const client: RestClient = createFetchClient({
  middlewares: [myMiddleware],
});
```

## License

ISC
