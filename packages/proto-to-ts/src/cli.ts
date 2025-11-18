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

  // Ask for output directory
  const { outputDir } = await inquirer.prompt([
    {
      type: "input",
      name: "outputDir",
      message:
        "Enter output directory for generated files (relative to current directory):",
      default: config.outputDir,
      validate: (input: string) => {
        if (!input) return "Output directory cannot be empty";
        if (path.isAbsolute(input)) return "Please enter a relative path";
        return true;
      },
    },
  ]);

  // Ask for services directory if needed
  const { servicesDir } = await inquirer.prompt([
    {
      type: "input",
      name: "servicesDir",
      message:
        "Enter services directory for wrapper functions (relative to current directory):",
      default: config.servicesDir || path.join(outputDir, "../services"),
      validate: (input: string) => {
        if (!input) return "Services directory cannot be empty";
        if (path.isAbsolute(input)) return "Please enter a relative path";
        return true;
      },
    },
  ]);

  console.log(`\n📂 Output directory: ${outputDir}`);
  console.log(`📂 Services directory: ${servicesDir}\n`);

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

  // Add to history
  addToHistory(historyFile, targetPath, validation.type, config.maxHistory);

  // Check if this is first time setup
  const workingDir = process.cwd();
  const apiDir = path.join(
    workingDir,
    config.outputDir.split("/").slice(0, -1).join("/"),
  );
  const connectClientExists = checkConnectClientExists(apiDir);

  // Ask about setup if connect-client.ts doesn't exist
  let shouldSetupClient = false;
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

  // Execute setup if requested
  if (shouldSetupClient) {
    console.log("\n📝 Setting up Connect client files...\n");

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
