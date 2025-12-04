---
"@theplant/proto-to-ts": patch
---

### Improvements

- **Simplified Service Client Generation**: Reduced generated client code by ~95% by leveraging Connect-RPC's built-in type inference.
  - Uses `Client<typeof Service>` type alias instead of manually declaring method signatures
  - Removes redundant import statements for Request schemas and Response types
  - Removes `as` type assertions

### Before vs After

**Before (261 lines):**

```typescript
import {
  createClient,
  type Client,
  type CallOptions,
} from "@connectrpc/connect";
import type { MessageInitShape } from "@bufbuild/protobuf";
import { ProductService } from "...";
import {
  GetProductRequestSchema,
  type GetProductResponse,
  // ... 30+ imports for each method's schema and response type
} from "...";

export interface ProductClient extends Client<typeof ProductService> {
  getProduct(
    request: MessageInitShape<typeof GetProductRequestSchema>,
    options?: CallOptions,
  ): Promise<GetProductResponse>;
  // ... 30+ method signatures manually declared
}

const client = createClient(ProductService, transport) as ProductClient;
export const productClient: ProductClient = client;
```

**After (14 lines):**

```typescript
import { createClient, type Client } from "@connectrpc/connect";
import { ProductService } from "../generated/pim/product/v1/service_pb";
import { transport } from "../../connect-client";

export type ProductClient = Client<typeof ProductService>;
export const productClient: ProductClient = createClient(
  ProductService,
  transport,
);
```

### Benefits

- **Smaller bundle size**: Less generated code means smaller bundles
- **Faster generation**: Less string manipulation and import collection
- **Better maintainability**: Type inference is handled by Connect-RPC, not custom code
- **Consistent types**: No risk of manual interface definitions becoming out of sync with actual service
