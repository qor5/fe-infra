/**
 * Package manager detection and operations
 */
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export type PackageManager = "pnpm" | "yarn" | "npm";

/**
 * Detect which package manager is being used in the project
 */
export function detectPackageManager(projectDir: string): PackageManager {
  // Check for lock files
  if (fs.existsSync(path.join(projectDir, "pnpm-lock.yaml"))) {
    return "pnpm";
  }

  if (fs.existsSync(path.join(projectDir, "yarn.lock"))) {
    return "yarn";
  }

  if (fs.existsSync(path.join(projectDir, "package-lock.json"))) {
    return "npm";
  }

  // Default to npm
  return "npm";
}

/**
 * Get install command for the package manager
 */
export function getInstallCommand(
  packageManager: PackageManager,
  packages: string[],
  isDev = true,
): string {
  const pkgs = packages.join(" ");

  switch (packageManager) {
    case "pnpm":
      // pnpm add automatically saves to package.json
      // -D for devDependencies, --save-prod for dependencies
      return `pnpm add ${isDev ? "-D" : "--save-prod"} ${pkgs}`;
    case "yarn":
      // yarn add automatically saves to package.json
      return `yarn add ${isDev ? "--dev" : ""} ${pkgs}`;
    case "npm":
      // npm install with --save or --save-dev
      return `npm install ${isDev ? "--save-dev" : "--save"} ${pkgs}`;
  }
}

/**
 * Install packages using the detected package manager
 */
export async function installPackages(
  projectDir: string,
  packages: Array<{ name: string; version: string }>,
  isDev = true,
): Promise<void> {
  const packageManager = detectPackageManager(projectDir);
  const packagesWithVersions = getPackagesWithVersions(packages);
  const command = getInstallCommand(
    packageManager,
    packagesWithVersions,
    isDev,
  );

  console.log(`   📦 Installing packages using ${packageManager}...`);
  console.log(`   $ ${command}`);

  try {
    const { stdout, stderr } = await execAsync(command, { cwd: projectDir });
    if (stdout) console.log(stdout);
    if (stderr && !stderr.includes("deprecated")) console.error(stderr);
    console.log(`   ✅ Packages installed successfully`);
  } catch (error: any) {
    console.error(`   ❌ Failed to install packages:`, error.message);
    throw error;
  }
}

/**
 * Check if packages are already installed
 */
export function checkPackagesInstalled(
  projectDir: string,
  packages: Array<{ name: string; version: string }>,
): {
  installed: string[];
  missing: Array<{ name: string; version: string }>;
} {
  const packageJsonPath = path.join(projectDir, "package.json");

  if (!fs.existsSync(packageJsonPath)) {
    return { installed: [], missing: packages };
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    const installed: string[] = [];
    const missing: Array<{ name: string; version: string }> = [];

    packages.forEach((pkg) => {
      if (allDeps[pkg.name]) {
        installed.push(pkg.name);
      } else {
        missing.push(pkg);
      }
    });

    return { installed, missing };
  } catch (error) {
    console.warn("⚠️  Warning: Could not read package.json");
    return { installed: [], missing: packages };
  }
}

/**
 * Get packages with versions for installation
 */
export function getPackagesWithVersions(
  packages: Array<{ name: string; version: string }>,
): string[] {
  return packages.map((pkg) => `${pkg.name}@${pkg.version}`);
}
