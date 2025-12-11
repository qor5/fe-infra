# @theplant/proto-to-ts

## 0.4.0

### Minor Changes

- [#51](https://github.com/theplant/qor5-fe-infra/pull/51) [`58b2869`](https://github.com/theplant/qor5-fe-infra/commit/58b28696a5e128434a5074f10592851bfcfde12a) Thanks [@danni-cool](https://github.com/danni-cool)! - ### Fix: Namespace Naming Conflicts

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

## 0.3.0

### Minor Changes

- [#49](https://github.com/theplant/qor5-fe-infra/pull/49) [`d38de14`](https://github.com/theplant/qor5-fe-infra/commit/d38de149b4364a5222244d700c930fb60a0c8a0c) Thanks [@danni-cool](https://github.com/danni-cool)! - ### New Features
  - **Non-interactive CI mode (`-y` flag)**: Run `proto-to-ts -y` to skip all prompts and use config file settings directly. Required config fields for `-y` mode:
    - `protoPath`: Path to proto directory (relative or absolute)
    - `defaultModuleName` (or `moduleName`): Module name for generated code
    - `rpcServiceDir`: Root directory for RPC services
  - **Service whitelist (`includeServicePatterns`)**: New whitelist feature using regex patterns to filter which services to generate
    - `["*"]` = include all services (default)
    - `["CustomerService$"]` = only services ending with "CustomerService"
    - `[]` = include no services
    - Interactive mode offers three choices: all services, customer-facing only, or custom regex pattern
  - **Namespaced type exports**: Types are now exported as namespaces to avoid naming conflicts between proto files

    ```typescript
    // Before (could cause conflicts)
    export * from "../generated/loyalty/campaign/v1/campaign_pb";
    export * from "../generated/loyalty/order/v1/order_reward_pb";

    // After (no conflicts)
    export * as Campaign from "../generated/loyalty/campaign/v1/campaign_pb";
    export * as OrderReward from "../generated/loyalty/order/v1/order_reward_pb";
    ```

    Usage: `import { Campaign, OrderReward } from '@/api/types'` then `OrderReward.Reward`

  - **Auto-generate config file**: After first interactive run, `proto-to-ts.config.js` is automatically created with user's choices

  ### Improvements
  - **Service filtering logic**: Whitelist (`includeServicePatterns`) is applied first, then blacklist (`excludeServicePatterns`) is applied to the included set
  - **Regex pattern support**: All patterns use JavaScript RegExp syntax (`$` for ends with, `^` for starts with, etc.)
  - **Improved prompts**: Interactive mode asks "Which services do you want to include?" with clear options
  - **Skip empty files**: If no services in a proto file match the include patterns, the file is skipped entirely
  - **Backward compatibility**: Supports both `defaultModuleName` (new) and `moduleName` (legacy) in config files

  ### Testing
  - Added unit tests for `shouldIncludeService`, `shouldExcludeService`, `shouldGenerateService`
  - Added tests for whitelist + blacklist combination scenarios
  - Added vitest configuration and test scripts

## 0.2.2

### Patch Changes

- [#47](https://github.com/theplant/qor5-fe-infra/pull/47) [`c48b37a`](https://github.com/theplant/qor5-fe-infra/commit/c48b37af42b0df448a979b019a162b70c4c8dc83) Thanks [@danni-cool](https://github.com/danni-cool)! - ### Bug Fix
  - **Disabled json_name field replacement**: Fixed type definition mismatch with runtime objects.

  ### Problem

  When a proto field uses `json_name` option:

  ```protobuf
  string locale_code = 5 [json_name = "locale"];
  ```

  The previous behavior would replace the TypeScript field name with `json_name`:

  ```typescript
  // Generated type (WRONG)
  locale: string;

  // Runtime object (from @bufbuild/protobuf)
  {
    localeCode: "Japan";
  } // Uses camelCase of original field name
  ```

  This caused a mismatch between TypeScript types and runtime objects.

  ### Solution

  Disabled the `applyJsonNameMappings` function. Now generated types match runtime behavior:

  ```typescript
  // Generated type (CORRECT)
  localeCode: string;

  // Runtime object
  {
    localeCode: "Japan";
  }
  ```

  ### Why This Works

  `@bufbuild/protobuf` runtime uses camelCase of the original field name (`locale_code` → `localeCode`), NOT the `json_name`. The `json_name` is only used for JSON wire format serialization/deserialization, which the library handles automatically.

  ### Impact
  - TypeScript types now match runtime objects
  - No changes needed in consuming code
  - JSON API communication still works correctly (library handles conversion)

## 0.2.1

### Patch Changes

- [#45](https://github.com/theplant/qor5-fe-infra/pull/45) [`90dccd0`](https://github.com/theplant/qor5-fe-infra/commit/90dccd0227fc99106017f897cdf31f3a2c9ada9e) Thanks [@danni-cool](https://github.com/danni-cool)! - ### Improvements
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

## 0.2.0

### Minor Changes

- [#43](https://github.com/theplant/qor5-fe-infra/pull/43) [`a375556`](https://github.com/theplant/qor5-fe-infra/commit/a3755561fae30c0ca42dafbe5396a9bf0823c95d) Thanks [@danni-cool](https://github.com/danni-cool)! - ### New Features
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

## 0.1.2

### Patch Changes

- [#41](https://github.com/theplant/qor5-fe-infra/pull/41) [`a4f71fe`](https://github.com/theplant/qor5-fe-infra/commit/a4f71fe1d60f4e028a51433e12408e16f25ec0ea) Thanks [@danni-cool](https://github.com/danni-cool)! - ### New Features
  - **Exclude Admin Services**: Added `excludeServicePatterns` configuration to exclude services from client generation based on service name patterns.
    - Default: `["AdminService"]` - automatically excludes all services containing "AdminService" in their name (e.g., `UserAdminService`, `CampaignAdminService`)
    - Set to `[]` to include all services
    - Useful for excluding internal admin APIs from public frontend SDKs

  ### Configuration

  ```javascript
  export default {
    // ... other config

    // Exclude services from client generation
    // Matches proto service names like: service UserAdminService { ... }
    // Set to [] to include all services
    excludeServicePatterns: ["AdminService"],
  };
  ```

## 0.1.1

### Patch Changes

- [#37](https://github.com/theplant/qor5-fe-infra/pull/37) [`08b9e84`](https://github.com/theplant/qor5-fe-infra/commit/08b9e84552438edf04e67645641977d761e89a28) Thanks [@danni-cool](https://github.com/danni-cool)! - ### @theplant/proto-to-ts

  Significant feature enhancements: added method extraction, import resolution, interface generation, and other functional improvements. This update goes beyond code style formatting and introduces new capabilities to the package.

  ### @theplant/fetch-middleware

  Documentation cleanup: removed deprecated auth-refresh middleware documentation and references.

  **Breaking changes:**
  - Removed `rawMessage` and `validationError` from the `parseConnectError` return type.
  - Renamed types: `RestClientOptions` → `FetchClientOptions`, `RestClient` → `FetchClient`.

## 0.1.0

### Minor Changes

- [#34](https://github.com/theplant/qor5-fe-infra/pull/34) [`175b042`](https://github.com/theplant/qor5-fe-infra/commit/175b042a8885a90c0fbd1491c41fcd35aee5a40a) Thanks [@danni-cool](https://github.com/danni-cool)! - Add proto-to-ts CLI tool with modular structure support:
  - Interactive CLI for generating TypeScript files from protobuf definitions
  - Support for modular multi-project organization (e.g., `rpc-service/pim/`, `rpc-service/auth/`)
  - Automatic service client wrapper generation with Connect-RPC
  - Shared transport configuration across modules
  - Fix package exports to use compiled dist files instead of source files
  - Add prepublishOnly script to ensure clean builds before publishing
