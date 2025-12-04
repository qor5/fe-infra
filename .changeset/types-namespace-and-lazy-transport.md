---
"@theplant/proto-to-ts": minor
---

### New Features

- **Types Namespace**: Added automatic type aggregation with IDE auto-completion support.
  - Generates `types/index.ts` that aggregates all `*_pb.ts` exports
  - Access types via `pimService.types.ProductFilter`, `pimService.types.Product`, etc.
  - Full IDE auto-completion support for all protobuf types

- **Lazy Transport Initialization**: Changed `connect-client.ts` to use lazy initialization pattern.
  - `initializeTransport()` - Configure transport with custom fetch and interceptors
  - `transport` - Proxy-based export for backward compatibility
  - `resetTransport()` - Reset transport for testing
  - Allows external configuration of middlewares, error handlers, and session management

### Usage

```typescript
// 1. Initialize transport (in app entry)
import { initializeTransport } from './rpc-service/connect-client'

initializeTransport({
  baseUrl: import.meta.env.VITE_API_BASE_URL || '',
  fetch: createFetchClient({
    middlewares: [errorMiddleware, sessionMiddleware],
  }),
})

// 2. Use service clients
import { pimService } from '@/lib/api'

const response = await pimService.productClient.listProducts({ ... })

// 3. Use types with IDE auto-completion
const filter: pimService.types.ProductFilter = {
  priceInclTax: { gte: 100 },
}
```

### Breaking Changes

- `connect-client.ts` no longer auto-initializes transport - must call `initializeTransport()` before using service clients
- Removed `xxxClientType` exports from service clients (e.g., `productClientType`)
  - Use `pimService.types.*` instead of `pimService.productClientType.*`
  - All types are now unified under the `types` namespace

### Migration Guide

**1. Initialize transport before using service clients:**

```typescript
// src/lib/api/index.ts
import { initializeTransport } from './rpc-service/connect-client'

initializeTransport({
  fetch: createFetchClient({ ... }),
})

export * from './rpc-service'
```

**2. Update type imports:**

```typescript
// Before
import { pimService } from '@/lib/api'
const filter: pimService.productClientType.ProductFilter = { ... }

// After
import { pimService } from '@/lib/api'
const filter: pimService.types.ProductFilter = { ... }
```
