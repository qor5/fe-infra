# @theplant/proto-to-ts

Interactive Protobuf to TypeScript code generation tool with Connect-RPC support.

## Features

- 🎯 **Interactive Selection** - User-friendly CLI interface to select proto files or directories
- 📚 **History** - Automatically saves recently used paths for quick regeneration
- 🔄 **Automation** - Automatically generates TypeScript types, Connect-RPC clients, and service wrappers
- 🎨 **Template Configuration** - Automatically extracts dependencies from `buf.yaml` to generate `buf.gen.yaml`
- 🔍 **JSON Name Support** - Automatically applies protobuf `json_name` mappings
- 📦 **Service Wrappers** - Optional generation of Connect-RPC service client wrappers
- 🏷️ **Types Namespace** - Auto-aggregated types with IDE auto-completion support

## Installation

### From GitHub Packages

> If this is your first integration, please create a personal GitHub PAT (Personal Access Token) to avoid permission errors, as packages on GitHub require a PAT for pulling.
>
> 1. [Configure a personal PAT with read access to GitHub packages](https://github.com/theplant/qor5-fe-infra/wiki/Fixing-401-Unauthorized-Errors-When-Installing-Private-GitHub-Packages#-solution-1-authenticate-via-npm-login)

If you have set this up, follow the steps below and execute the following command in your project:

```bash
# 1. Install
echo "@theplant:registry=https://npm.pkg.github.com" >> .npmrc
pnpm add -D @theplant/proto-to-ts
```

## Usage

### Basic Usage

Run the interactive CLI in your project root:

```bash
npx proto-to-ts
```

Or add a script to your `package.json`:

```json
{
  "scripts": {
    "generate:api": "proto-to-ts"
  }
}
```

### Configuration (Optional)

The tool comes with sensible defaults. If you need to customize the output directory or other options, you can create a `proto-to-ts.config.js` file in your project root.

You can quickly generate a config file using:

```bash
npx proto-to-ts --init
```

Or create it manually:

```javascript
export default {
  // Output directory for generated code (default: src/lib/api/generated)
  outputDir: "src/lib/api/generated",

  // Optional: Service wrapper directory
  // If set, generates a client wrapper for each proto service
  // Set to undefined or remove to disable service wrapper generation
  // (default: src/lib/api/services)
  servicesDir: "src/lib/api/services",

  // History file path (relative to project root) (default: .proto-to-ts-history.json)
  historyFile: ".proto-to-ts-history.json",

  // Maximum number of history items to save (default: 10)
  maxHistory: 10,

  // Exclude services from client generation based on service name patterns
  // Default: ["AdminService"] - excludes all services containing "AdminService"
  // Matches against proto service names like: service UserAdminService { ... }
  // Set to [] (empty array) to disable default exclusion and include all services
  // excludeServicePatterns: ["AdminService"], // default, can be omitted
};
```

### Workflow

1. Run the `proto-to-ts` command.
2. Select a path from history or enter a new absolute path to your proto file/directory.
3. The tool will automatically:
   - Find `buf.yaml` and extract dependencies.
   - Generate a temporary `buf.gen.yaml` configuration.
   - Run `buf generate` to generate TypeScript code.
   - Apply `json_name` mappings.
   - Generate service client wrappers (if configured).
   - Generate types aggregation file for IDE auto-completion.

## Generated Content

### Directory Structure

```
src/lib/api/rpc-service/
  pim/                      # Module name
    generated/              # Protobuf generated files
    services/               # Service client wrappers
      index.ts
      product.client.ts
    types/                  # Aggregated types for IDE auto-completion
      index.ts
  connect-client.ts         # Shared transport configuration
  index.ts                  # Module exports
```

### Transport Initialization

The generated `connect-client.ts` uses lazy initialization. You must call `initializeTransport()` before using any service clients:

```typescript
// src/lib/api/index.ts
import { createFetchClient } from "@theplant/fetch-middleware";
import { initializeTransport } from "./rpc-service/connect-client";

// Initialize transport with your custom fetch configuration
initializeTransport({
  baseUrl: import.meta.env.VITE_API_BASE_URL || "",
  fetch: createFetchClient({
    fetchInit: {
      credentials: "include",
      headers: {
        Accept: "application/json",
        "X-Ensure-Connect-Error": "true",
      },
    },
    middlewares: [
      // Add your middlewares here
      // e.g., errorMiddleware, sessionMiddleware, etc.
    ],
  }),
});

// Export all RPC service clients
export * from "./rpc-service";
```

### Using Service Clients

```typescript
import { pimService } from '@/lib/api'

// Call service methods
const response = await pimService.productClient.listProducts({
  filter: { ... },
  pagination: { first: 20 },
})
```

### Using Types with IDE Auto-completion

All protobuf types are aggregated in the `types` namespace, enabling full IDE auto-completion:

```typescript
import { pimService } from "@/lib/api";

// ✅ IDE auto-completion works: pimService.types.ProductFilter, pimService.types.Product, etc.
const filter: pimService.types.ProductFilter = {
  priceInclTax: { gte: 100, lte: 500 },
};

// Use with service methods
const response = await pimService.productClient.listProducts({ filter });

// Access response types
const products: pimService.types.Product[] = response.edges.map((e) => e.node);
```

### TypeScript Types and Clients

The tool uses the following plugins to generate code:

- `@bufbuild/protoc-gen-es` - Generates TypeScript message types.
- `@connectrpc/protoc-gen-connect-es` - Generates Connect-RPC service clients.

### Service Wrappers

If `servicesDir` is configured, the tool generates wrapper clients for each service:

```typescript
// Example: product.client.ts
import { createClient, type Client } from "@connectrpc/connect";
import { ProductService } from "../generated/pim/product/v1/service_pb";
import { transport } from "../../connect-client";

export const productClient: Client<typeof ProductService> = createClient(
  ProductService,
  transport,
);
```

And an index file with types namespace:

```typescript
// services/index.ts
export { productClient, type ProductClient } from "./product.client";

// Export types namespace for IDE auto-completion
export * as types from "../types";
```

## API

You can also use the tool programmatically:

```typescript
import { runInteractiveCLI, generateFromProto } from '@theplant/proto-to-ts';

// Run the interactive CLI
await runInteractiveCLI({
  outputDir: 'src/lib/api/generated',
  servicesDir: 'src/lib/api/services',
});

// Generate directly (non-interactive)
await generateFromProto({
  targetPath: '/path/to/proto',
  validation: { valid: true, type: 'directory', files: [...] },
  workingDir: process.cwd(),
  outputDir: 'src/lib/api/generated',
});
```

## License

MIT
