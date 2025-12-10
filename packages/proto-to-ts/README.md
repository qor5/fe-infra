# @theplant/proto-to-ts

Interactive Protobuf to TypeScript code generation tool with Connect-RPC support.

## Features

- 🎯 **Interactive Selection** - User-friendly CLI interface to select proto files or directories
- 🚀 **CI Mode** - Non-interactive mode (`-y` flag) for automated pipelines
- 📚 **History** - Automatically saves recently used paths for quick regeneration
- 🔄 **Automation** - Automatically generates TypeScript types, Connect-RPC clients, and service wrappers
- 🎨 **Template Configuration** - Automatically extracts dependencies from `buf.yaml` to generate `buf.gen.yaml`
- 🎯 **Service Filtering** - Whitelist (`includeServicePatterns`) and blacklist (`excludeServicePatterns`) with regex support
- 📦 **Service Wrappers** - Optional generation of Connect-RPC service client wrappers
- 🏷️ **Namespaced Types** - Auto-aggregated types with namespace exports to avoid conflicts

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
/**
 * Pattern syntax: JavaScript RegExp
 *   - "*" matches all services
 *   - "CustomerService$" matches services ending with "CustomerService"
 *   - "^Public" matches services starting with "Public"
 *   - "Admin" matches services containing "Admin"
 */
export default {
  // Default module name for -y mode (e.g., "pim", "ciam", "loyalty")
  defaultModuleName: "pim",

  // Root directory for all RPC services
  rpcServiceDir: "src/lib/api/rpc-service",

  // Path to proto file or directory (required for -y mode)
  protoPath: "../../proto",

  // Include services matching these regex patterns (whitelist)
  // ["*"] = all services (default)
  // ["CustomerService$"] = only services ending with "CustomerService"
  includeServicePatterns: ["*"],

  // Exclude services matching these regex patterns (blacklist)
  // Applied after includeServicePatterns
  excludeServicePatterns: [],

  // History file path (default: .proto-to-ts-history.json)
  historyFile: ".proto-to-ts-history.json",

  // Maximum number of history items to save (default: 10)
  maxHistory: 10,
};
```

### CI Mode (Non-interactive)

For automated pipelines, use the `-y` flag to skip all prompts:

```bash
npx proto-to-ts -y
```

This requires a `proto-to-ts.config.js` file with at least:

- `protoPath`: Path to proto directory
- `defaultModuleName`: Module name for generated code
- `rpcServiceDir`: Root directory for RPC services

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

All protobuf types are exported as namespaces to avoid naming conflicts:

```typescript
import { pimService } from "@/lib/api";

// Types are namespaced by proto file to avoid conflicts
// e.g., pimService.types.Product.Product, pimService.types.Category.Category
const filter: pimService.types.Product.ProductFilter = {
  priceInclTax: { gte: 100, lte: 500 },
};

// Use with service methods
const response = await pimService.productClient.listProducts({ filter });

// Access response types
const products: pimService.types.Product.Product[] = response.edges.map(
  (e) => e.node,
);
```

Types are exported as namespaces to prevent naming conflicts when different proto files define types with the same name:

```typescript
// types/index.ts (auto-generated)
export * as Product from "../generated/pim/product/v1/product_pb";
export * as Category from "../generated/pim/category/v1/category_pb";
```

### TypeScript Types and Clients

The tool uses the following plugins to generate code:

- `@bufbuild/protoc-gen-es` - Generates TypeScript message types.
- `@connectrpc/protoc-gen-connect-es` - Generates Connect-RPC service clients.

### Service Wrappers

The tool generates wrapper clients for each service by default:

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
