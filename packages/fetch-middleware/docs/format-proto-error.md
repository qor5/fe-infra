# Format Proto Error Middleware

`formatProtoErrorMiddleware` is designed for Connect-RPC and Protobuf APIs. It handles both Protobuf (ProTTP) and JSON (Connect) error responses.

## Usage

```typescript
import { formatProtoErrorMiddleware } from "@theplant/fetch-middleware";

const middleware = formatProtoErrorMiddleware();

// Use with createFetchClient
const client = createFetchClient({
  middlewares: [formatProtoErrorMiddleware()],
});
```

## Behavior

It inspects the response and throws typed errors based on the error content:

- **Protobuf Errors**: Parses `ValidationError` details from the binary response.
- **JSON Errors**: Compatible with standard Connect-ES error parsing.

### Typed Errors

The middleware may throw the following errors:

- `UnauthorizedError` (401)
- `AuthenticationError` (403)
- `NotFoundError` (404)
- `ValidationError` (422) - Contains `errors` property with field-level details.
- `ServiceError` (500+)
- `AppError` (Generic fallback)
