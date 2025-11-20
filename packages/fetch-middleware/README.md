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
> 2. Contact @geckofu to ensure your GitHub account or group has access to this project ([qor5-fe-infra](https://github.com/theplant/qor5-fe-infra)) and [fetch-middleware](https://github.com/theplant/qor5-fe-infra/pkgs/npm/fetch-middleware).

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

- **[Request Queue Middleware](./docs/request-queue.md)**: Manages request queues for handling authentication refresh and automatic retry.
- **[JSON Response Middleware](./docs/json-response.md)**: Parses JSON responses and attaches to `_body` property.
- **[Extract Body Middleware](./docs/extract-body.md)**: Extracts `_body` from Response and returns it as the final result.
- **[HTTP Error Middleware](./docs/http-error.md)**: Handles HTTP errors with a simple callback.
- **[Format Proto Error Middleware](./docs/format-proto-error.md)**: Handles Protobuf and Connect error responses.
- **[Headers Middleware](./docs/headers.md)**: Add or modify request headers.

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
const users = await client.get<User[]>("/users");
const user = await client.post<User>("/users", { name: "John" });
```

### Connect-RPC Client

```typescript
import {
  createFetchClient,
  formatProtoErrorMiddleware,
  parseConnectError,
} from "@theplant/fetch-middleware";
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";

// Create fetch client for Connect-RPC
const fetchClient = createFetchClient({
  middlewares: [formatProtoErrorMiddleware()],
});

// Create Connect transport
const transport = createConnectTransport({
  baseUrl: "http://localhost:8787",
  fetch: fetchClient,
});

// Create RPC client
const client = createClient(YourService, transport);
```

## Error Handling

### parseConnectError

Parse ConnectError into structured error information. Works with both Proto (ProTTP) and JSON (Connect) errors:

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

### Typed Error Classes

The library provides typed error classes for common HTTP errors:

```typescript
import { UnauthorizedError, ValidationError } from "@theplant/fetch-middleware";

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
