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

> If this is your first integration, please create a personal GitHub PAT (Personal Access Token) to avoid permission errors, as packages on GitHub require a PAT for pulling.
>
> 1. [Configure a personal PAT with read access to GitHub packages](https://github.com/theplant/qor5-fe-infra/wiki/Fixing-401-Unauthorized-Errors-When-Installing-Private-GitHub-Packages#-solution-1-authenticate-via-npm-login)

If you have set this up, follow the steps below and execute the following command in your project:

```bash
# 1. Install
echo "@theplant:registry=https://npm.pkg.github.com" >> .npmrc
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

## Built-in Middlewares

The library comes with several built-in middlewares. Click on each for detailed documentation:

- **[Request Queue Middleware](https://github.com/theplant/qor5-fe-infra/blob/main/packages/fetch-middleware/docs/request-queue.md)**: Low-level queue engine for request queuing. Useful for advanced/custom flows.
- **[JSON Response Middleware](https://github.com/theplant/qor5-fe-infra/blob/main/packages/fetch-middleware/docs/json-response.md)**: Parses JSON responses and attaches to `_body` property.
- **[Extract Body Middleware](https://github.com/theplant/qor5-fe-infra/blob/main/packages/fetch-middleware/docs/extract-body.md)**: Extracts `_body` from Response and returns it as the final result.
- **[HTTP Error Middleware](https://github.com/theplant/qor5-fe-infra/blob/main/packages/fetch-middleware/docs/http-error.md)**: Handles HTTP errors with a simple callback.
- **[Format Proto Error Middleware](https://github.com/theplant/qor5-fe-infra/blob/main/packages/fetch-middleware/docs/format-proto-error.md)**: Handles Protobuf and Connect error responses.
- **[Headers Middleware](https://github.com/theplant/qor5-fe-infra/blob/main/packages/fetch-middleware/docs/headers.md)**: Add or modify request headers.
- **[Tag Session Middleware](https://github.com/theplant/qor5-fe-infra/blob/main/packages/fetch-middleware/docs/tag-session.md)**: Automatically tags requests with metadata based on URL whitelist.

## Quick Start

### REST Client

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

// GET request
// get<T>(path: string, options?: RestRequestOptions)
const users = await client.get<User[]>("/users", {
  // RestRequestOptions
  query: { page: 1, role: "admin" }, // Query parameters
  headers: { "X-Custom": "value" }, // Custom headers
  _meta: { isProtected: true }, // Metadata (for middlewares only, not sent to server)
});

// POST request
// post<T>(path: string, body?: JsonLike | Uint8Array | FormData | null, options?: RestRequestOptions)
const newUser = await client.post<User>("/users", {
  name: "John",
  email: "john@example.com",
});

// PUT request
// put<T>(path: string, body?: JsonLike | Uint8Array | FormData | null, options?: RestRequestOptions)
await client.put("/users/123", { name: "John Updated" });

// PATCH request
// patch<T>(path: string, body?: JsonLike | Uint8Array | FormData | null, options?: RestRequestOptions)
await client.patch("/users/123", { status: "active" });

// DELETE request
// delete<T>(path: string, options?: RestRequestOptions)
await client.delete("/users/123");
```

### Connect-RPC Client

```typescript
import {
  createFetchClient,
  formatProtoErrorMiddleware,
  parseConnectError,
  tagSessionMiddleware,
} from "@theplant/fetch-middleware";
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";

// Create fetch client for Connect-RPC
const fetchClient = createFetchClient({
  middlewares: [
    // Since Connect client cannot pass _meta directly, use tagSessionMiddleware to auto-tag by URL
    tagSessionMiddleware(["/api.UserService/", "/api.AdminService/"], {
      isProtected: true,
    }),
    formatProtoErrorMiddleware(),
  ],
});

// Create Connect transport
const transport = createConnectTransport({
  baseUrl: "http://localhost:8787",
  fetch: fetchClient,
});

// Create RPC client
const client = createClient(YourService, transport);

// Calls will automatically have isProtected tag
await client.getUser({ id: "123" });
```

> **Note**: Connect-RPC clients cannot pass `_meta` parameters directly due to framework limitations. To add metadata tags to requests (e.g., for use with `requestQueueMiddleware`), use `tagSessionMiddleware` to automatically tag requests based on URL whitelist. See [Tag Session Middleware](https://github.com/theplant/qor5-fe-infra/blob/main/packages/fetch-middleware/docs/tag-session.md) for details.

## Error Handling

### REST API Errors

For standard REST/fetch requests, use `httpErrorMiddleware` to handle HTTP errors. It automatically parses response body based on content-type (JSON/Text/Protobuf) and calls your error handler:

```typescript
import {
  createFetchClient,
  httpErrorMiddleware,
} from "@theplant/fetch-middleware";

const client = createFetchClient({
  baseUrl: "https://api.example.com",
  middlewares: [
    httpErrorMiddleware({
      onError: ({ status, body, url }) => {
        const message = body?.message || body?.error || `Error ${status}`;

        switch (status) {
          case 401:
            window.location.href = "/login";
            break;
          case 422:
            // Validation error
            console.log(body?.errors);
            break;
          case 500:
            console.error("Server error:", message);
            break;
        }
      },
      throwError: true, // Default: throw error after handling
    }),
  ],
});
```

The error thrown by `httpErrorMiddleware` contains:

- `error.status` - HTTP status code
- `error.body` - Parsed response body
- `error.response` - Native Response object
- `error.url` - Request URL

#### Catching Errors in Individual API Calls

In addition to global error handling in middleware, you can also catch errors at individual API call sites using try-catch:

```typescript
// Global middleware handles common errors (401 redirect, toast notifications, etc.)
const client = createFetchClient({
  baseUrl: "https://api.example.com",
  middlewares: [
    httpErrorMiddleware({
      onError: ({ status }) => {
        if (status === 401) window.location.href = "/login";
      },
    }),
  ],
});

// Catch specific errors at call site for custom handling
async function updateUser(id: string, data: UserData) {
  try {
    return await client.put(`/users/${id}`, data);
  } catch (err: any) {
    if (err.status === 422) {
      // Handle validation error specifically for this form
      return { errors: err.body?.errors };
    }
    if (err.status === 409) {
      // Handle conflict error
      return { conflict: true };
    }
    // Re-throw other errors to be handled by global handler
    throw err;
  }
}
```

> **Tip**: Use middleware `onError` for global error handling (auth redirects, toast notifications), and try-catch at call sites for business-specific error handling.

---

### Connect-RPC Errors

Connect-RPC supports two error response formats:

- **JSON (Connect)**: Standard Connect protocol, errors are automatically parsed by `connect-es`
- **Proto (ProTTP)**: Binary protobuf format, requires `formatProtoErrorMiddleware` for typed error handling

#### JSON Errors (Connect)

For JSON format errors, `connect-es` handles parsing automatically. Use `parseConnectError` to extract structured error information:

```typescript
import { parseConnectError } from "@theplant/fetch-middleware";

try {
  await client.login(credentials);
} catch (err) {
  const parsed = parseConnectError(err);
  console.log(parsed.code);
  console.log(parsed.message);
}
```

#### Proto Errors (ProTTP) with Typed Error Classes

The library provides typed error classes for common HTTP errors. These errors are thrown by `formatProtoErrorMiddleware` when handling Proto (ProTTP) responses:

| Error Class           | HTTP Status | Description                                       |
| --------------------- | ----------- | ------------------------------------------------- |
| `UnauthorizedError`   | 401         | Authentication required                           |
| `AuthenticationError` | 403         | Permission denied                                 |
| `NotFoundError`       | 404         | Resource not found                                |
| `ValidationError`     | 422         | Validation failed (contains `errors.fieldErrors`) |
| `ServiceError`        | 500+        | Server error                                      |
| `AppError`            | Other       | Generic application error                         |

> **Note**: These typed errors are only thrown when using `formatProtoErrorMiddleware`. Make sure to include it in your middleware chain.

```typescript
import {
  createFetchClient,
  formatProtoErrorMiddleware,
  UnauthorizedError,
  ValidationError,
} from "@theplant/fetch-middleware";

// Must include formatProtoErrorMiddleware to get typed errors
const client = createFetchClient({
  middlewares: [formatProtoErrorMiddleware()],
});

try {
  await fetchData();
} catch (err) {
  if (err instanceof UnauthorizedError) {
    // Handle 401
  } else if (err instanceof ValidationError) {
    // Handle 422
    console.log(err.errors.fieldErrors);
  }
}
```

## Advanced Usage

### Creating Custom Middleware

```typescript
import type { Middleware } from "@theplant/fetch-middleware";

const loggingMiddleware = (): Middleware => {
  return async (req, next, ctx) => {
    const start = Date.now();
    console.log(`→ ${req.method} ${req.url}`);
    try {
      const res = await next(req);
      console.log(`← ${res.status} ${req.url} (${Date.now() - start}ms)`);
      return res;
    } catch (error) {
      console.error(`✗ ${req.url}`, error);
      throw error;
    }
  };
};
```

### Middleware Order Matters

Middlewares are executed in order. Response flows in reverse order.

```typescript
middlewares: [
  loggingMiddleware(), // 1. Log request
  authMiddleware(getToken), // 2. Add auth header
  extractBodyMiddleware(), // 3. Extract body (REST only)
  jsonResponseMiddleware(), // 4. Parse JSON
  httpErrorMiddleware({}), // 5. Handle errors
];
```

## Design Principles

### Keep Response Native

All middlewares should preserve the native `Response` object.

### Dual-Mode Support

The `createFetchClient` function returns a hybrid that works as both a Fetch Handler (for libraries) and a REST Client.

## License

ISC
