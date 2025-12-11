---
"@theplant/proto-to-ts": minor
---

### Fix: Namespace Naming Conflicts

Fixed the issue where types with the same filename in different modules would cause naming conflicts (e.g., `Category` and `Category2`).

**Before (Problem):**

```typescript
// Different modules with same filename caused conflicts
export * as Category from "../generated/pim/models/v1/category_pb";
export * as Category2 from "../generated/pim/product/v1/category_pb"; // Ugly!
```

**After (Solution):**

Types are now grouped by module directory using nested namespaces:

```typescript
import * as _ModelsCategory from "../generated/pim/models/v1/category_pb";
import * as _ProductCategory from "../generated/pim/product/v1/category_pb";

export namespace Models {
  export import Category = _ModelsCategory;
}
export namespace Product {
  export import Category = _ProductCategory;
}
```

**Usage:**

```typescript
import { Models, Product } from "@/api/rpc-service/pim/types";

// Access types via Module.Filename.Type pattern
type C1 = Models.Category.Category;
type C2 = Product.Category.Category; // No more conflicts!
```
