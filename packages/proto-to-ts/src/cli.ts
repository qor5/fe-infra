#!/usr/bin/env node
/**
 * Interactive and Non-Interactive CLI for proto code generation
 */
import fs from "fs";
import path from "path";
import inquirer from "inquirer";
import type { ProtoGenConfig } from "./types.js";
import { isValidProtoPath } from "./utils/proto-scanner.js";
import {
  loadHistory,
  addToHistory,
  formatTimestamp,
  getModuleNameFromHistory,
} from "./utils/history.js";
import { generateFromProto } from "./generator.js";
import { getRequiredDependencies } from "./utils/setup-helpers.js";
import {
  detectPackageManager,
  checkPackagesInstalled,
  installPackages,
} from "./utils/package-manager.js";

/**
 * Non-interactive CLI function for CI/CD environments
 * Requires protoPath to be configured in config file
 */
export async function runNonInteractiveCLI(
  config: ProtoGenConfig,
): Promise<void> {
  console.log("🚀 Non-Interactive Proto Code Generation Tool (CI Mode)\n");

  const { protoPath, rpcServiceDir } = config;
  // Support both defaultModuleName (new) and moduleName (legacy) for backward compatibility
  const configModuleName = config.defaultModuleName || config.moduleName;

  // Validate required fields
  if (!protoPath) {
    throw new Error(
      "protoPath is required in config file for non-interactive mode",
    );
  }

  if (!configModuleName) {
    throw new Error(
      "defaultModuleName (or moduleName) is required in config file for non-interactive mode",
    );
  }

  if (!rpcServiceDir) {
    throw new Error(
      "rpcServiceDir is required in config file for non-interactive mode",
    );
  }

  const moduleName = configModuleName;

  // Convert relative path to absolute path based on current working directory
  const resolvedProtoPath = path.isAbsolute(protoPath)
    ? protoPath
    : path.resolve(process.cwd(), protoPath);

  // Validate the target path
  const validation = isValidProtoPath(resolvedProtoPath);

  if (!validation.valid || !validation.type || !validation.files) {
    throw new Error(
      `Invalid protoPath or no .proto files found: ${resolvedProtoPath}`,
    );
  }

  console.log(`📍 Proto path: ${resolvedProtoPath}`);
  console.log(`📊 Type: ${validation.type}`);
  console.log(`📝 Proto files found: ${validation.files.length}\n`);

  // Display found files
  validation.files.forEach((file, index) => {
    console.log(`   ${index + 1}. ${file}`);
  });

  console.log("");

  // Set output directories based on module structure
  const outputDir = path.join(rpcServiceDir, moduleName, "generated");
  const servicesDir = path.join(rpcServiceDir, moduleName, "services");

  // Get include/exclude patterns from config (default to '*' for all services)
  const includeServicePatterns = config.includeServicePatterns || ["*"];
  const excludeServicePatterns = config.excludeServicePatterns || [];

  console.log(`📦 Modular Structure:`);
  console.log(`   Module: ${moduleName}`);
  console.log(`   RPC Service Dir: ${rpcServiceDir}`);
  console.log(`   Generated files: ${outputDir}`);
  console.log(`   Service clients: ${servicesDir}`);
  console.log(`   Include patterns: ${includeServicePatterns.join(", ")}`);
  if (excludeServicePatterns.length > 0) {
    console.log(`   Exclude patterns: ${excludeServicePatterns.join(", ")}`);
  }
  console.log("");

  // Update config with computed values
  config.moduleName = moduleName;
  config.outputDir = outputDir;
  config.servicesDir = servicesDir;
  config.includeServicePatterns = includeServicePatterns;
  config.excludeServicePatterns = excludeServicePatterns;

  // Check and install dependencies if needed
  const workingDir = process.cwd();
  const deps = getRequiredDependencies();
  const { missing } = checkPackagesInstalled(workingDir, deps.runtime);

  if (missing.length > 0) {
    console.log(`\n📦 Installing missing dependencies...`);
    missing.forEach((pkg) => {
      console.log(`     - ${pkg.name}@${pkg.version}`);
    });
    await installPackages(workingDir, missing, false);
  }

  // Execute the API generation
  await generateFromProto({
    targetPath: resolvedProtoPath,
    validation,
    workingDir,
    ...config,
  });
}

/**
 * Main interactive CLI function
 */
export async function runInteractiveCLI(config: ProtoGenConfig): Promise<void> {
  console.log("🚀 Interactive Proto Code Generation Tool");
  console.log(
    "💡 Tip: For best results, use the proto root directory (e.g., /path/to/proto/pim)\n",
  );

  const historyFile =
    config.historyFile || path.join(process.cwd(), ".proto-to-ts-history.json");
  const history = loadHistory(historyFile);

  // Build choices for the prompt
  const choices: any[] = [];

  if (history.records.length > 0) {
    choices.push(new inquirer.Separator("📚 Recent History (latest first):"));

    history.records.forEach((record) => {
      const icon = record.type === "file" ? "📄" : "📁";
      const timeAgo = formatTimestamp(record.timestamp);
      const moduleInfo = record.moduleName ? ` [${record.moduleName}]` : "";
      choices.push({
        name: `${icon} ${record.path}${moduleInfo} (${timeAgo})`,
        value: record.path,
        short: record.path,
      });
    });

    choices.push(new inquirer.Separator());
  }

  choices.push({
    name: "✏️  Enter new path (💡 Recommend: use proto root directory)",
    value: "__NEW_PATH__",
  });

  // Ask user to select or enter new path
  const { selectedPath } = await inquirer.prompt([
    {
      type: "list",
      name: "selectedPath",
      message: "Select a proto file/directory or enter a new path:",
      choices,
      pageSize: 15,
    },
  ]);

  let targetPath = selectedPath;

  // If user chose to enter new path
  if (selectedPath === "__NEW_PATH__") {
    const { newPath } = await inquirer.prompt([
      {
        type: "input",
        name: "newPath",
        message: "Enter absolute path to proto file or directory:",
        validate: (input: string) => {
          if (!input) return "Path cannot be empty";
          if (!path.isAbsolute(input)) return "Please enter an absolute path";
          if (!fs.existsSync(input)) return "Path does not exist";

          const validation = isValidProtoPath(input);
          if (!validation.valid) {
            return "Path must be a .proto file or a directory containing .proto files";
          }

          return true;
        },
      },
    ]);

    targetPath = newPath;
  }

  // Validate the target path
  const validation = isValidProtoPath(targetPath);

  if (!validation.valid || !validation.type || !validation.files) {
    console.error("❌ Error: Invalid path or no .proto files found");
    process.exit(1);
  }

  console.log(`\n📍 Target: ${targetPath}`);
  console.log(`📊 Type: ${validation.type}`);
  console.log(`📝 Proto files found: ${validation.files.length}\n`);

  // Display found files
  validation.files.forEach((file, index) => {
    console.log(`   ${index + 1}. ${file}`);
  });

  console.log("");

  let moduleName: string | undefined;
  let rpcServiceDir: string | undefined;
  let outputDir: string;
  let servicesDir: string;

  // Get default module name from history (associated with this proto path)
  const historyModuleName = getModuleNameFromHistory(history, targetPath);
  // Get last used rpcServiceDir from history
  const historyRpcServiceDir = history.lastRpcServiceDir;

  // Ask for module name
  const { inputModuleName } = await inquirer.prompt([
    {
      type: "input",
      name: "inputModuleName",
      message: "Enter module name (e.g., pim, ciam, auth):",
      default:
        historyModuleName ||
        config.defaultModuleName ||
        config.moduleName ||
        "pim",
      validate: (input: string) => {
        if (!input) return "Module name cannot be empty";
        if (!/^[a-z0-9-_]+$/i.test(input))
          return "Module name should only contain letters, numbers, hyphens, and underscores";
        return true;
      },
    },
  ]);

  moduleName = inputModuleName;

  // Ask for RPC service directory
  const { inputRpcServiceDir } = await inquirer.prompt([
    {
      type: "input",
      name: "inputRpcServiceDir",
      message:
        "Enter RPC service root directory (relative to current directory):",
      default:
        historyRpcServiceDir ||
        config.rpcServiceDir ||
        "src/lib/api/rpc-service",
      validate: (input: string) => {
        if (!input) return "RPC service directory cannot be empty";
        if (path.isAbsolute(input)) return "Please enter a relative path";
        return true;
      },
    },
  ]);

  rpcServiceDir = inputRpcServiceDir;

  // Automatically set outputDir and servicesDir under the module
  outputDir = path.join(rpcServiceDir!, moduleName!, "generated");
  servicesDir = path.join(rpcServiceDir!, moduleName!, "services");

  // Ask about include patterns (whitelist)
  let includeServicePatterns: string[] = ["*"];
  const defaultCustomerPattern = "CustomerService$";
  const currentIncludePatterns = config.includeServicePatterns || ["*"];

  // Determine default choice based on current config
  let defaultChoice = "all";
  if (
    currentIncludePatterns.length > 0 &&
    !currentIncludePatterns.includes("*")
  ) {
    if (currentIncludePatterns.includes(defaultCustomerPattern)) {
      defaultChoice = "customer";
    } else {
      defaultChoice = "custom";
    }
  }

  const { includeChoice } = await inquirer.prompt([
    {
      type: "list",
      name: "includeChoice",
      message: "Which services do you want to include? (uses regex patterns)",
      choices: [
        { name: "All services (*)", value: "all" },
        {
          name: `Only customer-facing services (regex: ${defaultCustomerPattern})`,
          value: "customer",
        },
        { name: "Custom regex pattern", value: "custom" },
      ],
      default: defaultChoice,
    },
  ]);

  if (includeChoice === "all") {
    includeServicePatterns = ["*"];
  } else if (includeChoice === "customer") {
    includeServicePatterns = [defaultCustomerPattern];
  } else if (includeChoice === "custom") {
    const { inputIncludePatterns } = await inquirer.prompt([
      {
        type: "input",
        name: "inputIncludePatterns",
        message:
          "Enter regex patterns to include (comma-separated):\n" +
          "   Examples: CustomerService$ (ends with), ^Public (starts with), Admin (contains)\n" +
          "   Use * to include all services\n" +
          "   Pattern:",
        default: currentIncludePatterns.includes("*")
          ? defaultCustomerPattern
          : currentIncludePatterns.join(", "),
      },
    ]);

    includeServicePatterns = inputIncludePatterns
      .split(",")
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 0);
  }

  // Ask if user wants to exclude any services (blacklist, applied after whitelist)
  let excludeServicePatterns: string[] = [];
  const { wantExclude } = await inquirer.prompt([
    {
      type: "confirm",
      name: "wantExclude",
      message: "Do you want to exclude any services? (blacklist, uses regex)",
      default: false,
    },
  ]);

  if (wantExclude) {
    const currentExcludePatterns = config.excludeServicePatterns || [];
    const { inputExcludePatterns } = await inquirer.prompt([
      {
        type: "input",
        name: "inputExcludePatterns",
        message:
          "Enter regex patterns to exclude (comma-separated):\n" +
          "   Examples: Admin (contains), ^Test (starts with), Mock$ (ends with)\n" +
          "   Pattern:",
        default: currentExcludePatterns.join(", "),
      },
    ]);

    // Parse exclude patterns
    excludeServicePatterns = inputExcludePatterns
      .split(",")
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 0);
  }

  console.log(`\n📦 Modular Structure:`);
  console.log(`   Module: ${moduleName}`);
  console.log(`   RPC Service Dir: ${rpcServiceDir}`);
  console.log(`   Generated files: ${outputDir}`);
  console.log(`   Service clients: ${servicesDir}`);
  console.log(`   Include patterns: ${includeServicePatterns.join(", ")}`);
  if (excludeServicePatterns.length > 0) {
    console.log(`   Exclude patterns: ${excludeServicePatterns.join(", ")}`);
  }
  console.log("");

  // Confirm before proceeding
  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: "Proceed with API generation?",
      default: true,
    },
  ]);

  if (!confirm) {
    console.log("⏹️  Cancelled by user");
    process.exit(0);
  }

  // Update config with user's choices
  config.outputDir = outputDir;
  config.servicesDir = servicesDir;
  config.moduleName = moduleName;
  config.rpcServiceDir = rpcServiceDir;
  config.includeServicePatterns = includeServicePatterns;
  config.excludeServicePatterns = excludeServicePatterns;

  // Add to history with module name and rpcServiceDir
  addToHistory(
    historyFile,
    targetPath,
    validation.type,
    moduleName!,
    rpcServiceDir!,
    config.maxHistory,
  );

  // Check if this is first time setup
  const workingDir = process.cwd();

  let shouldInstallDeps = false;

  // Always check for missing dependencies
  const deps = getRequiredDependencies();
  const { installed, missing } = checkPackagesInstalled(
    workingDir,
    deps.runtime,
  );

  // Debug: log dependency check results
  if (process.env.DEBUG) {
    console.log("\n🔍 Debug: Dependency check results");
    console.log("   Required:", deps.runtime.map((d) => d.name).join(", "));
    console.log("   Installed:", installed.join(", "));
    console.log("   Missing:", missing.map((d) => d.name).join(", "));
  }

  // Check and install dependencies if needed (regardless of connect-client.ts existence)
  if (missing.length > 0) {
    const packageManager = detectPackageManager(workingDir);
    console.log(`\n📦 Runtime Dependencies Check\n`);
    console.log(`   Missing dependencies:`);
    missing.forEach((pkg) => {
      console.log(`     - ${pkg.name}@${pkg.version}`);
    });

    const { installDeps } = await inquirer.prompt([
      {
        type: "confirm",
        name: "installDeps",
        message: `Install missing dependencies using ${packageManager}?`,
        default: true,
      },
    ]);

    shouldInstallDeps = installDeps;
  }

  // Install dependencies if needed
  if (shouldInstallDeps && missing.length > 0) {
    console.log("\n📦 Installing dependencies...\n");
    await installPackages(workingDir, missing, false);
  }

  // Execute the API generation
  await generateFromProto({
    targetPath,
    validation,
    workingDir,
    ...config,
  });

  // Auto-generate or update config file after successful generation
  await saveConfigFile(workingDir, {
    defaultModuleName: moduleName!,
    rpcServiceDir: rpcServiceDir!,
    protoPath: targetPath,
    includeServicePatterns,
    excludeServicePatterns,
  });
}

/**
 * Save or update proto-to-ts.config.js file
 */
async function saveConfigFile(
  workingDir: string,
  options: {
    defaultModuleName: string;
    rpcServiceDir: string;
    protoPath: string;
    includeServicePatterns: string[];
    excludeServicePatterns: string[];
  },
): Promise<void> {
  const configPath = path.join(workingDir, "proto-to-ts.config.js");

  // Convert absolute protoPath to relative path if it's under workingDir
  let relativeProtoPath = options.protoPath;
  if (path.isAbsolute(options.protoPath)) {
    const relative = path.relative(workingDir, options.protoPath);
    // Only use relative path if it doesn't go too far up
    if (!relative.startsWith("..") || relative.split("..").length <= 3) {
      relativeProtoPath = relative.startsWith(".") ? relative : `./${relative}`;
    }
  }

  const includePatternsStr =
    options.includeServicePatterns.length > 0
      ? `["${options.includeServicePatterns.join('", "')}"]`
      : "[]";

  const excludePatternsStr =
    options.excludeServicePatterns.length > 0
      ? `["${options.excludeServicePatterns.join('", "')}"]`
      : "[]";

  const configContent = `/**
 * Configuration for proto-to-ts code generation
 * Auto-generated by proto-to-ts interactive mode
 *
 * Pattern syntax: JavaScript RegExp
 *   - "CustomerService$" matches services ending with "CustomerService"
 *   - "^Public" matches services starting with "Public"
 *   - "Admin" matches services containing "Admin"
 */
export default {
  // Default module name for -y mode
  // In interactive mode, history's moduleName for the selected proto path takes precedence
  defaultModuleName: "${options.defaultModuleName}",

  // Root directory for all RPC services
  // outputDir and servicesDir are auto-computed: {rpcServiceDir}/{defaultModuleName}/generated|services
  rpcServiceDir: "${options.rpcServiceDir}",

  // Path to proto file or directory (required for -y mode)
  protoPath: "${relativeProtoPath}",

  // Include services matching these regex patterns (whitelist)
  // ["*"] = all services, ["CustomerService$"] = specific pattern
  includeServicePatterns: ${includePatternsStr},

  // Exclude services matching these regex patterns (blacklist)
  // Applied after includeServicePatterns
  excludeServicePatterns: ${excludePatternsStr},
}
`;

  const exists = fs.existsSync(configPath);
  fs.writeFileSync(configPath, configContent);

  if (exists) {
    console.log("\n✅ Updated proto-to-ts.config.js");
  } else {
    console.log("\n✅ Created proto-to-ts.config.js");
  }
  console.log('💡 You can now use "proto-to-ts -y" for non-interactive mode');
}
