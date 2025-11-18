/**
 * Example configuration for proto-to-ts with modular structure support
 *
 * This example shows how to configure proto-to-ts for multi-project
 * organization where different proto files from different projects
 * are organized into separate modules.
 *
 * Directory structure that will be generated:
 *
 * src/lib/api/
 *   rpc-service/
 *     pim/                    <- moduleName
 *       generated/            <- outputDir (relative to module)
 *       handlers/
 *       services/             <- servicesDir (relative to module)
 *     ciam/                   <- another module
 *       generated/
 *       handlers/
 *       services/
 *     connect-client.ts       <- shared transport (auto-generated once)
 *     index.ts                <- aggregates all modules (auto-generated)
 */

export default {
  // Module name - will be used as subdirectory under rpcServiceDir
  // For example: "pim", "ciam", "auth", etc.
  // NOTE: This can be left undefined - CLI will ask you to choose/enter it
  moduleName: undefined, // CLI will prompt for this

  // Root directory for all RPC services
  // All modules will be created under this directory
  // NOTE: This can be left undefined - CLI will ask you to choose/enter it
  rpcServiceDir: "src/lib/api/rpc-service", // Or leave undefined to let CLI prompt

  // Output directory for generated protobuf files
  // If moduleName is set, this will be adjusted automatically
  // Otherwise, you can specify a flat structure path
  outputDir: "src/lib/api/generated",

  // Services directory for client wrappers
  // If moduleName is set, this will be adjusted automatically
  servicesDir: "src/lib/api/services",

  // History file path
  historyFile: ".proto-to-ts-history.json",

  // Maximum history records to keep
  maxHistory: 10,
};

/**
 * Usage:
 *
 * 1. Run the interactive CLI:
 *    $ proto-to-ts
 *
 * 2. Follow the prompts:
 *    - Select proto file/directory (or enter new path)
 *    - Confirm output directory
 *    - Confirm services directory
 *    - Choose "Use modular structure?" → Yes
 *    - Enter module name (e.g., "pim", "ciam", "auth")
 *    - Enter RPC service root directory (default: "src/lib/api/rpc-service")
 *    - Confirm to proceed
 *
 * 3. Generated structure:
 *    - rpc-service/{moduleName}/generated/
 *    - rpc-service/{moduleName}/services/
 *    - rpc-service/connect-client.ts (created once, shared by all modules)
 *    - rpc-service/index.ts (auto-updated to export from all modules)
 *
 * 4. Add more modules:
 *    Simply run `proto-to-ts` again and enter a different module name
 *    The top-level index.ts will be automatically updated
 *
 * 5. Import in your app:
 *    import { productClient, authClient } from '@/lib/api/rpc-service'
 *
 * Benefits:
 * - No need to manually edit config file for each module
 * - CLI remembers your settings (rpcServiceDir)
 * - Easy to switch between modules
 * - Automatic index.ts updates
 */
