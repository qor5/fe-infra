# JSON Response Middleware

`jsonResponseMiddleware` automatically parses JSON responses and attaches the result to a `_body` property on the Response object.

## Usage

```typescript
import { jsonResponseMiddleware } from "@theplant/fetch-middleware";

const middleware = jsonResponseMiddleware();

// Response will have _body property with parsed JSON
const res = await fetch("/api/data");
console.log(res._body); // Parsed JSON data
```

## Behavior

- It attempts to parse the response body as JSON.
- If parsing succeeds, the result is attached to `res._body`.
- It preserves the original `Response` object.
- Ideally used before `extractBodyMiddleware` if you want to return the parsed data directly.
