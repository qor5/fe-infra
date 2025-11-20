# HTTP Error Middleware

`httpErrorMiddleware` handles HTTP errors (status >= 400) using a simple callback. It automatically parses the error response body based on content type.

## Usage

```typescript
import { httpErrorMiddleware } from "@theplant/fetch-middleware";
import { toast } from "./toast";

const middleware = httpErrorMiddleware({
  // URLs to skip error handling
  silentUrls: ["/api/refresh"],

  // Error handler receives status, body (auto-parsed), and response
  onError: async ({ status, body }) => {
    const message = body?.message || body?.error || `Error ${status}`;

    switch (status) {
      case 401:
        window.location.href = "/login";
        break;
      case 500:
        toast.error("Server error");
        break;
      default:
        toast.error(message);
    }
  },

  // Whether to throw error after handling (default: true)
  throwError: true,
});
```

## Error Information

The `onError` callback receives an object with:

```typescript
interface HttpErrorInfo {
  status: number; // HTTP status code
  statusText: string; // HTTP status text
  url: string; // Request URL
  body?: any; // Auto-parsed body (JSON object or string)
  response: Response; // Native Response object
  signal: AbortSignal; // Abort signal
}
```

## Parsing Logic

- `application/json` -> Parsed as JSON object.
- `text/*` -> Parsed as string.
- Other types -> `undefined`.
