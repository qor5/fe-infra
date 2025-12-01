# Tag Session Middleware

`tagSessionMiddleware` automatically tags requests with metadata based on URL whitelist. This is particularly useful for Connect-RPC clients, which cannot pass `_meta` parameters directly due to framework limitations.

## Use Case

When using Connect-RPC clients, you cannot pass `_meta` parameters directly in method calls. Use `tagSessionMiddleware` to automatically tag requests based on URL patterns, enabling conditional processing in other middlewares (e.g., [Request Queue Middleware](./request-queue.md)).

## API

```typescript
function tagSessionMiddleware(
  endpoints: string[],
  tags: Record<string, any>,
): Middleware;
```

**Parameters:**

- `endpoints`: Array of URL patterns to match (uses `includes` matching). Use `['*']` to match all URLs.
- `tags`: Metadata object to add to `request._meta`

## Usage Example

### Basic Usage with Connect-RPC

```typescript
import {
  createFetchClient,
  tagSessionMiddleware,
} from "@theplant/fetch-middleware";
import { createConnectTransport } from "@connectrpc/connect-web";
import { createClient } from "@connectrpc/connect";

// Create fetch client with tag middleware
const fetchClient = createFetchClient({
  middlewares: [
    // Tag all RPC endpoints as protected
    tagSessionMiddleware(["/api.UserService/", "/api.AdminService/"], {
      isProtected: true,
    }),

    // Other middlewares can access req._meta.isProtected
    // ...
  ],
});

// Use with Connect transport
const transport = createConnectTransport({
  baseUrl: "http://localhost:8787",
  fetch: fetchClient,
});

const client = createClient(UserService, transport);

// All calls to UserService will be automatically tagged with { isProtected: true }
await client.getUser({ id: "123" });
```

### Match All URLs with `['*']`

Use `['*']` to tag all requests regardless of URL:

```typescript
import {
  createFetchClient,
  tagSessionMiddleware,
} from "@theplant/fetch-middleware";

const fetchClient = createFetchClient({
  middlewares: [
    // Tag ALL requests as protected
    tagSessionMiddleware(["*"], {
      isProtected: true,
    }),
  ],
});

// Every request will be tagged with { isProtected: true }
await fetchClient("/api/users");
await fetchClient("/api/orders");
await fetchClient("/any/other/path");
```

> **Note:** When `'*'` is present in the endpoints array, it takes precedence and matches all URLs, regardless of other patterns in the array.

## How It Works

1. The middleware first checks if `'*'` is in the endpoints array
   - If `'*'` is present, all requests are matched regardless of URL
   - Otherwise, it checks if the request URL includes any of the endpoint patterns
2. If matched, it merges the `tags` object into `req._meta`
3. `_meta` is only passed through the middleware chain and is automatically stripped before the actual network request
4. Other middlewares in the chain can access `req._meta` to make conditional decisions

## Notes

- Use `['*']` to match all URLs - useful when you want to tag all requests (e.g., mark all as protected)
- When `'*'` is present in the endpoints array, it takes precedence and matches all URLs, even if other patterns are also present
- URL matching uses the `includes` method, so ensure endpoint patterns are specific enough to avoid false matches
- The `_meta` property is automatically stripped before sending the request and does not affect the actual HTTP request
- Multiple `tagSessionMiddleware` instances can be stacked, with later tags merging into existing `_meta`
- This is particularly useful with [Request Queue Middleware](./request-queue.md) for conditional authentication handling
