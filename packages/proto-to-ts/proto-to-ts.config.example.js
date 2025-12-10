/**
 * Example configuration file for proto-to-ts
 * Copy this file to proto-to-ts.config.js in your project root and customize as needed
 *
 * Pattern syntax: JavaScript RegExp (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions)
 *   - "*" matches all services
 *   - "CustomerService$" matches services ending with "CustomerService"
 *   - "^Public" matches services starting with "Public"
 *   - "Admin" matches services containing "Admin"
 */
export default {
  // Default module name for -y mode (e.g., "pim", "ciam", "loyalty")
  // In interactive mode, history's moduleName for the selected proto path takes precedence
  defaultModuleName: "pim",

  // Root directory for all RPC services
  // outputDir and servicesDir are auto-computed: {rpcServiceDir}/{defaultModuleName}/generated|services
  rpcServiceDir: "src/lib/api/rpc-service",

  // Path to proto file or directory (relative or absolute, required for -y mode)
  // Example: '../../proto' or '/absolute/path/to/proto'
  protoPath: undefined,

  // Include services matching these regex patterns (whitelist)
  // ["*"] = all services (default)
  // ["CustomerService$"] = only services ending with "CustomerService"
  includeServicePatterns: ["*"],

  // Exclude services matching these regex patterns (blacklist)
  // Applied after includeServicePatterns
  // Example: ["Admin", "Internal", "^Test"]
  excludeServicePatterns: [],
};
