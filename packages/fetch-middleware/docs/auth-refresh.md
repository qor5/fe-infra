# Auth Refresh Middleware

The **Auth Refresh Middleware** provides high-level helpers for handling
authentication/session refresh and automatic retry, built on top of the
low-level [`requestQueueMiddleware`](./request-queue.md).

It is the **recommended** way to integrate auth refresh logic for both
REST and Connect-RPC clients.

At its core, the auth-refresh helpers:

- Decide **when** a request should trigger a refresh (401 / expired session).
- Decide **which** requests are managed (via `_meta.isProtected` or `ignoreRequest`).
- Delegate **queueing + retry** mechanics to `requestQueueMiddleware`.

## API Overview

```ts
import {
  createSessionRefreshMiddleware,
  createConnectSessionRefreshMiddleware,
  type SessionRefreshMiddlewareOptions,
} from "@theplant/fetch-middleware";
```

### `SessionRefreshMiddlewareOptions`

```ts
export interface SessionRefreshMiddlewareOptions {
  /**
   * Function to get the AuthHandler instance.
   * The handler must provide:
   * - refreshSession(): Promise<void>
   * - getState(): any (should contain session.expiresAt when available)
   */
  getAuthHandler: () => RefreshableAuthHandler;

  /**
   * Callback when session refresh fails or is invalid.
   * Use this to clear global auth state or redirect to login.
   */
  onSessionInvalid: () => void;

  /**
   * Optional function to determine if a request should be ignored by
   * the refresh logic. Return true to skip refresh handling.
   *
   * Example:
   *   // Only handle requests with _meta.isProtected = true
   *   ignoreRequest: (req) => !req._meta?.isProtected
   */
  ignoreRequest?: (request: any) => boolean;

  /**
   * Enable debug logging
   */
  debug?: boolean;
}
```

Internally, the `RefreshableAuthHandler` interface is:

```ts
export interface RefreshableAuthHandler {
  refreshSession: () => Promise<any>;
  getState: () => any;
}
```

## REST: `createSessionRefreshMiddleware`

This helper is designed for REST clients created via `createFetchClient`.

### Behavior

For each request:

- **Ignored** when `ignoreRequest(request) === true` (if provided).
- **Triggers queue** when:
  - Response status is **401**, or
  - Local session is **already expired** (`session.expiresAt < now - 1s`).

When a trigger occurs:

1. `requestQueueMiddleware` queues relevant requests and pauses them.
2. The `handler` calls `auth.refreshSession()`.
3. On success: all queued requests are retried.
4. On failure: `onSessionInvalid()` is called and queued requests are rejected.

### Example (REST + `_meta.isProtected`)

This mirrors the pattern used in `qor5-ec-demo`:

```ts
import {
  createFetchClient,
  createSessionRefreshMiddleware,
} from "@theplant/fetch-middleware";

import { useAuthStore } from "@/store/authStore";

// Your auth handler, e.g. ciamHandlers
import type { AuthHandlers } from "@theplant/ciam-next-web-sdk";

let ciamHandlers: AuthHandlers;

const onSessionInvalid = () => {
  useAuthStore.getState().clearAuth();
};

const sessionRefreshMiddleware = createSessionRefreshMiddleware({
  getAuthHandler: () => ciamHandlers,
  onSessionInvalid,
  // Only manage requests explicitly marked as protected
  ignoreRequest: (request) => !request._meta?.isProtected,
});

export const fetchClient = createFetchClient({
  fetchInit: {
    credentials: "include",
  },
  middlewares: [
    // ... your other middlewares
    sessionRefreshMiddleware,
  ],
});
```

For REST calls you can then do:

```ts
await fetchClient.get("/api/profile", {
  _meta: { isProtected: true }, // will be managed by auth-refresh
});

await fetchClient.get("/api/public", {
  _meta: { isProtected: false }, // will be ignored by auth-refresh
});
```

## Connect-RPC: `createConnectSessionRefreshMiddleware`

This helper is tailored for Connect-RPC flows, especially when used with
`tagSessionMiddleware` to mark protected endpoints.

### Behavior

For each request:

- **Only considers** requests with `request._meta.isProtected === true`.
- **Triggers queue** when:
  - Response status is **401**, or
  - Session is **expired** (`session.expiresAt < now - 1s`).
- **Always ignores** the RefreshSession endpoint itself
  (`ignore: ({ url }) => url.includes('/RefreshSession')`) to avoid deadlocks.

The rest of the behavior (queueing, refresh, retry) is the same as the REST helper.

### Example (Connect-RPC)

```ts
import {
  createFetchClient,
  tagSessionMiddleware,
  createConnectSessionRefreshMiddleware,
} from "@theplant/fetch-middleware";

import { createConnectTransport } from "@connectrpc/connect-web";
import { createClient } from "@connectrpc/connect";
import type { AuthHandlers } from "@theplant/ciam-next-web-sdk";

let ciamHandlers: AuthHandlers;

const onSessionInvalid = () => {
  // e.g. clear global auth store
};

const connectSessionRefreshMiddleware = createConnectSessionRefreshMiddleware({
  getAuthHandler: () => ciamHandlers,
  onSessionInvalid,
  debug: true,
});

const fetchClient = createFetchClient({
  middlewares: [
    // 1. Queue & refresh logic
    connectSessionRefreshMiddleware,
    // 2. Tag protected Connect endpoints
    tagSessionMiddleware(["/api.UserService/", "/api.AdminService/"], {
      isProtected: true,
    }),
  ],
});

const transport = createConnectTransport({
  baseUrl: "http://localhost:8787",
  fetch: fetchClient,
});

const client = createClient(YourService, transport);
```

## How It Works Internally

Both helpers are **thin wrappers** around `requestQueueMiddleware`:

- They build a `RequestQueueOptions` object:
  - `queueTrigger` encodes auth-specific conditions (401/expiry + `_meta`).
  - `handler` calls your `auth.refreshSession()` and maps success/failure.
  - `ignore` (for Connect) or `ignoreRequest` (for REST) defines which
    requests are managed.
- They call `requestQueueMiddleware(options)` and return the resulting
  `Middleware`.

You can think of them as:

```ts
const queueOptions: RequestQueueOptions = {
  queueTrigger: (info) => {
    /* auth logic here */
  },
  handler: (next) => {
    /* calls refreshSession + onSessionInvalid */
  },
  ignore: (request) => {
    /* optional filtering */
  },
  debug,
};

return requestQueueMiddleware(queueOptions);
```

If you have very custom requirements, you can still build your own
`RequestQueueOptions` and call `requestQueueMiddleware` directly. But for
most authentication flows, **`createSessionRefreshMiddleware`** and
**`createConnectSessionRefreshMiddleware`** should be enough and are
much easier to reason about.
