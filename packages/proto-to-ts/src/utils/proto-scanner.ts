/**
 * Proto file scanning and validation utilities
 */
import fs from "fs";
import path from "path";
import type { ValidationResult, BufModuleInfo } from "../types.js";

/**
 * Check if path is a proto file or directory containing proto files
 */
export function isValidProtoPath(targetPath: string): ValidationResult {
  try {
    const stats = fs.statSync(targetPath);

    if (stats.isFile()) {
      if (targetPath.endsWith(".proto")) {
        return { valid: true, type: "file", files: [targetPath] };
      }
      return { valid: false };
    }

    if (stats.isDirectory()) {
      const protoFiles = findProtoFiles(targetPath);
      if (protoFiles.length > 0) {
        return { valid: true, type: "directory", files: protoFiles };
      }
      return { valid: false };
    }
  } catch (error) {
    return { valid: false };
  }

  return { valid: false };
}

/**
 * Recursively find all .proto files in a directory
 */
export function findProtoFiles(dir: string): string[] {
  let results: string[] = [];

  try {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      if (file.includes("..")) {
        console.error(`❌ Invalid file name: ${file}`);
        continue;
      }
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        // Recursively search subdirectories
        results = results.concat(findProtoFiles(filePath));
      } else if (file.endsWith(".proto")) {
        results.push(filePath);
      }
    }
  } catch (error) {
    console.error(`❌ Error reading directory ${dir}:`, error);
  }

  return results;
}

/**
 * Find generated service files (in v2, these are *_pb.ts files containing GenService)
 */
export function findServiceFiles(dir: string): string[] {
  let results: string[] = [];

  try {
    if (!fs.existsSync(dir)) {
      return results;
    }

    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        // Recursively search subdirectories
        results = results.concat(findServiceFiles(filePath));
      } else if (file.endsWith("_pb.ts")) {
        // In v2, check if this file contains service definitions (GenService)
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          if (
            content.includes("GenService<{") ||
            content.includes(": GenService<{")
          ) {
            results.push(filePath);
          }
        } catch (err) {
          // Skip files that can't be read
        }
      }
    }
  } catch (error) {
    console.error(`❌ Error reading directory ${dir}:`, error);
  }

  return results;
}

/**
 * Find all _pb.ts files
 */
export function findPbFiles(dir: string): string[] {
  let results: string[] = [];

  try {
    if (!fs.existsSync(dir)) {
      return results;
    }

    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        results = results.concat(findPbFiles(filePath));
      } else if (file.endsWith("_pb.ts")) {
        results.push(filePath);
      }
    }
  } catch (error) {
    console.error(`❌ Error reading directory ${dir}:`, error);
  }

  return results;
}

/**
 * Find buf module root by looking for buf.yaml
 */
export function findBufModuleRoot(startPath: string): BufModuleInfo | null {
  let currentPath = startPath;

  // Keep going up until we find buf.yaml or reach root
  while (currentPath !== path.dirname(currentPath)) {
    const bufYamlPath = path.join(currentPath, "buf.yaml");

    if (fs.existsSync(bufYamlPath)) {
      // Found buf.yaml, now check if it defines modules
      try {
        const content = fs.readFileSync(bufYamlPath, "utf-8");

        // Simple check for "modules:" or "path:" in buf.yaml
        // This handles both v1 (root: proto) and v2 (modules: - path: proto) formats
        const modulePathMatch = content.match(/(?:root|path):\s*(\S+)/);

        if (modulePathMatch) {
          const modulePathValue = modulePathMatch[1];
          if (modulePathValue.includes("..")) {
            console.warn(
              `⚠️  Warning: Invalid path in buf.yaml at ${bufYamlPath}`,
            );
            return { root: currentPath };
          }
          const modulePath = path.join(currentPath, modulePathValue);
          return { root: currentPath, modulePath };
        }

        return { root: currentPath };
      } catch (error) {
        console.warn(`⚠️  Warning: Could not read buf.yaml at ${bufYamlPath}`);
      }
    }

    currentPath = path.dirname(currentPath);
  }

  return null;
}

/**
 * Read buf.yaml and extract dependencies
 */
export function extractBufDependencies(bufYamlPath: string): string[] {
  const deps: string[] = [];

  try {
    if (!fs.existsSync(bufYamlPath)) {
      return deps;
    }

    const content = fs.readFileSync(bufYamlPath, "utf-8");

    // Match deps section and extract module names
    // Example: - buf.build/googleapis/googleapis:e93e34f48be043dab55be31b4b47f458
    const depMatches = content.matchAll(/^\s*-\s+(buf\.build\/[^\s:]+)/gm);

    for (const match of depMatches) {
      deps.push(match[1]);
    }
  } catch (error) {
    console.warn(`⚠️  Warning: Could not read buf.yaml at ${bufYamlPath}`);
  }

  return deps;
}
