# @theplant/proto-to-ts

Interactive Protobuf to TypeScript code generation tool with Connect-RPC support.

## Features

- 🎯 **Interactive Selection** - User-friendly CLI interface to select proto files or directories
- 📚 **History** - Automatically saves recently used paths for quick regeneration
- 🔄 **Automation** - Automatically generates TypeScript types, Connect-RPC clients, and service wrappers
- 🎨 **Template Configuration** - Automatically extracts dependencies from `buf.yaml` to generate `buf.gen.yaml`
- 🔍 **JSON Name Support** - Automatically applies protobuf `json_name` mappings
- 📦 **Service Wrappers** - Optional generation of Connect-RPC service client wrappers

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

## Generated Content

### TypeScript Types and Clients

The tool uses the following plugins to generate code:

- `@bufbuild/protoc-gen-es` - Generates TypeScript message types.
- `@connectrpc/protoc-gen-connect-es` - Generates Connect-RPC service clients.

### Service Wrappers (Optional)

If `servicesDir` is configured, the tool generates wrapper clients for each service:

```typescript
// Example: product.client.ts
import { createClient, type Client } from "@connectrpc/connect";
import { ProductService } from "../generated/pim/product/v1/service_connect";
import { transport } from "../connect-client";

export const productClient: Client<typeof ProductService> = createClient(
  ProductService,
  transport,
);
```

And an index file:

```typescript
// services/index.ts
export { productClient } from "./product.client";
export { userClient } from "./user.client";
```

### Connect Client Setup (First Run)

On the first run, the tool can automatically generate the necessary Connect client setup files if they don't exist:

- `connect-client.ts`: Configures the transport with `fetch-middleware`.
- `handlers/connect-error-handler.ts`: Standard error handling utility.

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
