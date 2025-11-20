# Headers Middleware

`headersMiddleware` allows you to add or modify request headers dynamically.

## Usage

```typescript
import { headersMiddleware } from "@theplant/fetch-middleware";

const middleware = headersMiddleware((headers, req) => {
  // Set static header
  headers.set("X-App-Version", "1.0.0");

  // Set dynamic header based on request
  if (req.url.includes("/api/private")) {
    const token = localStorage.getItem("token");
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }
});
```

The callback receives:

1.  `headers`: A `Headers` object you can modify.
2.  `req`: The current request object.
