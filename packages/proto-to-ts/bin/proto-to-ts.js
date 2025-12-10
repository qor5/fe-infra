#!/usr/bin/env node

/**
 * CLI entry point for proto-to-ts
 */
import { runInteractiveCLI, runNonInteractiveCLI } from "../dist/cli.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default configuration
const defaultConfig = {
  rpcServiceDir: "src/lib/api/rpc-service",
  historyFile: ".proto-to-ts-history.json",
  maxHistory: 10,
  // Default: include all services
  includeServicePatterns: ["*"],
  excludeServicePatterns: [],
};

// Check for --init flag
const args = process.argv.slice(2);
const isYesMode = args.includes("-y") || args.includes("--yes");

if (args.includes("--init") || args.includes("-i")) {
  const configPath = path.join(process.cwd(), "proto-to-ts.config.js");

  if (fs.existsSync(configPath)) {
    console.log("⚠️  proto-to-ts.config.js already exists");
    process.exit(0);
  }

  const configContent = `/**
 * Configuration for proto-to-ts code generation tool
 */
export default {
  // Default module name for -y mode (e.g., "pim", "ciam", "loyalty")
  // In interactive mode, history's moduleName for the selected proto path takes precedence
  defaultModuleName: 'pim',

  // Root directory for all RPC services
  // outputDir and servicesDir are auto-computed: {rpcServiceDir}/{defaultModuleName}/generated|services
  rpcServiceDir: 'src/lib/api/rpc-service',

  // Path to proto file or directory (relative or absolute, required for -y mode)
  // Example: '../../proto' or '/absolute/path/to/proto'
  protoPath: undefined,

  // Include services matching these regex patterns (whitelist)
  // Examples:
  //   ["*"] - include all services (default)
  //   ["CustomerService$"] - services ending with "CustomerService" (e.g., LoyaltyCustomerService)
  //   ["^Public"] - services starting with "Public"
  //   ["Customer", "Public"] - services containing "Customer" OR "Public"
  includeServicePatterns: ["*"],

  // Exclude services matching these regex patterns (blacklist)
  // Applied after includeServicePatterns
  // Examples: ["Admin", "Internal", "^Test"]
  excludeServicePatterns: [],
}
`;

  fs.writeFileSync(configPath, configContent);
  console.log("✅ Created proto-to-ts.config.js");
  console.log(
    "💡 You can now customize the configuration and run: pnpm generate:api",
  );
  process.exit(0);
}

// Try to load config from current directory
let userConfig = {};
let hasConfigFile = false;
const configPath = path.join(process.cwd(), "proto-to-ts.config.js");
try {
  const module = await import(configPath);
  userConfig = module.default || module;
  hasConfigFile = true;
  console.log("✅ Loaded config from proto-to-ts.config.js\n");
} catch (error) {
  // No config file, use defaults
  if (isYesMode) {
    console.error("❌ Error: -y mode requires proto-to-ts.config.js");
    console.error('💡 Run "proto-to-ts" first to create a config file');
    process.exit(1);
  }
  console.log("ℹ️  No config file found (will be created after first run)\n");
}

const config = { ...defaultConfig, ...userConfig };

// Use non-interactive mode with -y flag
if (isYesMode) {
  if (!config.protoPath) {
    console.error("❌ Error: protoPath is required in config file for -y mode");
    console.error("💡 Add protoPath to your proto-to-ts.config.js:");
    console.error('   protoPath: "../../proto"');
    process.exit(1);
  }

  if (!config.defaultModuleName) {
    console.error(
      "❌ Error: defaultModuleName is required in config file for -y mode",
    );
    console.error("💡 Add defaultModuleName to your proto-to-ts.config.js:");
    console.error('   defaultModuleName: "pim"');
    process.exit(1);
  }

  runNonInteractiveCLI(config).catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
} else {
  runInteractiveCLI(config).catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
}
