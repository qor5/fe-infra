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
echo "@qor5:registry=https://npm.pkg.github.com" >> .npmrc

# Install the package
pnpm add @qor5/fetch-middleware
```

### From npm (if published)

```bash
pnpm add @qor5/fetch-middleware
```

## Core Concepts

### Middleware

A middleware is a function that intercepts requests and responses:

```typescript
import type { Middleware } from "@qor5/fetch-middleware";

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
} from "@qor5/fetch-middleware";

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
} from "@qor5/fetch-middleware";
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";

// Create fetch client for Connect-RPC
const fetchClient = createFetchClient({
  fetchInit: {
    credentials: "include",
    headers: {
      Accept: "application/json",
      "X-Ensure-Connect-Error": "true", // Get Connect standard error format
    },
  },
  middlewares: [
    formatProtoErrorMiddleware(), // Handle Proto/Protobuf errors
  ],
});

// Create Connect transport with the fetch client
const transport = createConnectTransport({
  baseUrl: "http://localhost:8787",
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
import { jsonResponseMiddleware } from "@qor5/fetch-middleware";

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
} from "@qor5/fetch-middleware";

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
import { formatProtoErrorMiddleware } from "@qor5/fetch-middleware";

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
import { httpErrorMiddleware } from "@qor5/fetch-middleware";
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
import { headersMiddleware } from "@qor5/fetch-middleware";

const middleware = headersMiddleware((headers) => {
  headers.set("Authorization", "Bearer token");
  headers.set("X-Custom-Header", "value");
});
```

## Error Handling

### parseConnectError

Parse ConnectError into structured error information. Works with both Proto (ProTTP) and JSON (Connect) errors:

```typescript
import { parseConnectError } from "@qor5/fetch-middleware";

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
} from "@qor5/fetch-middleware";

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
} from "@qor5/fetch-middleware";

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
import type { Middleware } from "@qor5/fetch-middleware";

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
} from "@qor5/fetch-middleware";
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
} from "@qor5/fetch-middleware";
import { createClient, type Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { AuthService } from "./proto/auth_pb";

// Create fetch client with Proto error handling
const fetchClient = createFetchClient({
  fetchInit: {
    credentials: "include",
    headers: {
      Accept: "application/json",
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
} from "@qor5/fetch-middleware";

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
