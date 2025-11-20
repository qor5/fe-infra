#!/usr/bin/env node

/**
 * CLI entry point for proto-to-ts
 */
import { runInteractiveCLI } from "../dist/cli.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default configuration
const defaultConfig = {
  outputDir: "src/lib/api/generated",
  servicesDir: "src/lib/api/services",
  historyFile: ".proto-to-ts-history.json",
  maxHistory: 10,
};

// Check for --init flag
const args = process.argv.slice(2);
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
  // Output directory for generated code
  outputDir: 'src/lib/api/generated',

  // Directory for service wrappers (optional)
  // Set to undefined or remove to disable service wrapper generation
  servicesDir: 'src/lib/api/services',

  // History file path (relative to project root)
  historyFile: '.proto-to-ts-history.json',

  // Maximum number of history records to keep
  maxHistory: 10,
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
const configPath = path.join(process.cwd(), "proto-to-ts.config.js");
try {
  const module = await import(configPath);
  userConfig = module.default || module;
  console.log("✅ Loaded config from proto-to-ts.config.js\n");
} catch (error) {
  // No config file, use defaults
  console.log(
    'ℹ️  Using default configuration (run "proto-to-ts --init" to create a config file)\n',
  );
}

const config = { ...defaultConfig, ...userConfig };

runInteractiveCLI(config).catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
