# Extract Body Middleware

`extractBodyMiddleware` extracts the `_body` property from the Response object (populated by `jsonResponseMiddleware`) and returns it as the final result. This breaks the standard `fetch` contract (returning data instead of a Response) but is very convenient for REST clients.

## Usage

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

## Important Note

This middleware should usually be placed **before** `jsonResponseMiddleware` in the middleware array (because the response flows backwards through the middleware chain).

1.  Request goes out.
2.  Response comes back.
3.  `jsonResponseMiddleware` parses JSON -> sets `res._body`.
4.  `extractBodyMiddleware` sees `res._body` -> returns `res._body`.
