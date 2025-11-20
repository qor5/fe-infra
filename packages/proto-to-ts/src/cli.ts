#!/usr/bin/env node
/**
 * Interactive CLI for proto code generation
 */
import fs from "fs";
import path from "path";
import inquirer from "inquirer";
import type { ProtoGenConfig } from "./types.js";
import { isValidProtoPath } from "./utils/proto-scanner.js";
import { loadHistory, addToHistory, formatTimestamp } from "./utils/history.js";
import { generateFromProto } from "./generator.js";
import {
  checkConnectClientExists,
  generateConnectClientFiles,
  getRequiredDependencies,
} from "./utils/setup-helpers.js";
import {
  detectPackageManager,
  checkPackagesInstalled,
  installPackages,
} from "./utils/package-manager.js";

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
      choices.push({
        name: `${icon} ${record.path} (${timeAgo})`,
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

  // Ask about modular structure first
  const { useModular } = await inquirer.prompt([
    {
      type: "confirm",
      name: "useModular",
      message: "Use modular structure for multi-project organization?",
      default:
        config.moduleName !== undefined || config.rpcServiceDir !== undefined,
    },
  ]);

  let moduleName: string | undefined;
  let rpcServiceDir: string | undefined;
  let outputDir: string;
  let servicesDir: string;

  if (useModular) {
    // Ask for module name
    const { inputModuleName } = await inquirer.prompt([
      {
        type: "input",
        name: "inputModuleName",
        message: "Enter module name (e.g., pim, ciam, auth):",
        default: config.moduleName || "pim",
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
        default: config.rpcServiceDir || "src/lib/api/rpc-service",
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

    console.log(`\n📦 Modular Structure:`);
    console.log(`   Module: ${moduleName}`);
    console.log(`   RPC Service Dir: ${rpcServiceDir}`);
    console.log(`   Generated files: ${outputDir}`);
    console.log(`   Service clients: ${servicesDir}\n`);
  } else {
    // Use default flat structure from config
    outputDir = config.outputDir;
    servicesDir =
      config.servicesDir || path.join(config.outputDir, "../services");

    console.log(`\n📂 Output directory: ${outputDir}`);
    console.log(`📂 Services directory: ${servicesDir}\n`);
  }

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

  // Add to history
  addToHistory(historyFile, targetPath, validation.type, config.maxHistory);

  // Check if this is first time setup
  const workingDir = process.cwd();

  // For modular structure, skip the early setup check
  // Step 5 in generator will handle connect-client.ts creation
  let shouldSetupClient = false;
  let shouldInstallDeps = false;
  let connectClientExists = true; // Assume it exists for modular structure

  if (!useModular) {
    // Only check and setup for flat structure
    const apiDir = path.join(
      workingDir,
      config.outputDir.split("/").slice(0, -1).join("/"),
    );
    connectClientExists = checkConnectClientExists(apiDir);
  }

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

  if (!connectClientExists) {
    console.log("\n🔧 Setup Options\n");

    const { setupClient } = await inquirer.prompt([
      {
        type: "confirm",
        name: "setupClient",
        message:
          "Generate Connect client files (connect-client.ts, error handlers)?",
        default: true,
      },
    ]);

    shouldSetupClient = setupClient;
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

  // Execute setup if requested (only for flat structure)
  if (shouldSetupClient && !useModular) {
    console.log("\n📝 Setting up Connect client files...\n");

    const apiDir = path.join(
      workingDir,
      config.outputDir.split("/").slice(0, -1).join("/"),
    );

    // Generate client files
    generateConnectClientFiles(apiDir);

    console.log("\n✅ Connect client setup complete!");
    console.log("   📝 You can now import from:");
    console.log(
      `   - ${path.join(config.outputDir.split("/").slice(0, -1).join("/"), "connect-client")}`,
    );
    console.log(
      `   - ${path.join(config.outputDir.split("/").slice(0, -1).join("/"), "handlers/connect-error-handler")}`,
    );
    console.log("");
  }

  // Execute the API generation
  await generateFromProto({
    targetPath,
    validation,
    workingDir,
    ...config,
  });
}
