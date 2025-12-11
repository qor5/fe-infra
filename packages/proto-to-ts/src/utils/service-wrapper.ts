/**
 * Service wrapper generation utilities
 */
import fs from "fs";
import path from "path";
import type { ServiceInfo, MethodInfo } from "../types";

/**
 * Recursively find all *_pb.ts files in a directory
 * These files contain protobuf-generated types (messages, enums, schemas)
 *
 * @param dir - Directory to scan
 * @param baseDir - Base directory for relative path calculation
 * @returns Array of relative paths to _pb.ts files
 */
export function findAllTypeFiles(dir: string, baseDir?: string): string[] {
  const base = baseDir || dir;
  const results: string[] = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // Skip third-party directories
      if (
        item === "google" ||
        item === "buf" ||
        item === "connect" ||
        item === "protoc-gen-openapiv2" ||
        item === "validate" ||
        item === "relay"
      ) {
        continue;
      }
      results.push(...findAllTypeFiles(fullPath, base));
    } else if (item.endsWith("_pb.ts")) {
      // Get relative path from base directory
      const relativePath = path
        .relative(base, fullPath)
        .replace(/\\/g, "/")
        .replace(/\.ts$/, "");
      results.push(relativePath);
    }
  }

  return results.sort();
}

/**
 * Convert snake_case string to PascalCase
 * e.g., "order_reward" -> "OrderReward"
 *       "gallery_image" -> "GalleryImage"
 */
export function snakeToPascalCase(str: string): string {
  return str
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

/**
 * Convert file path to PascalCase type name (base name only, from filename)
 *
 * Rules:
 * 1. Extract the filename from the path (last segment)
 * 2. Remove the "_pb" suffix
 * 3. Convert snake_case to PascalCase
 *
 * Examples:
 *   "loyalty/order/v1/order_reward_pb" -> "OrderReward"
 *   "loyalty/campaign/v1/campaign_pb" -> "Campaign"
 *   "pim/models/v1/gallery_image_pb" -> "GalleryImage"
 */
export function filePathToTypeName(filePath: string): string {
  // Extract filename without _pb suffix
  const fileName = filePath.split("/").pop() || filePath;
  const baseName = fileName.replace(/_pb$/, "");

  return snakeToPascalCase(baseName);
}

// Alias for backward compatibility
const filePathToNamespace = filePathToTypeName;

/**
 * Extract module name from file path (the directory before version directory)
 *
 * Path structure: {project}/{module}/{version}/{filename}
 * This function extracts the {module} part by finding the version directory (v1, v2, etc.)
 * and returning the directory name immediately before it.
 *
 * Rules:
 * 1. Find the version directory pattern (v1, v2, v3, etc.)
 * 2. Return the directory name before the version directory
 * 3. If no version directory found, use the first directory as fallback
 * 4. If path has no directories, return empty string
 *
 * Examples:
 *   "pim/models/v1/category_pb" -> "models"
 *   "pim/product/v1/category_pb" -> "product"
 *   "loyalty/campaign/v1/campaign_pb" -> "campaign"
 *   "loyalty/common/v2/error_pb" -> "common"
 *   "models/v1/user_pb" -> "models"
 *   "user_pb" -> ""
 */
export function extractModuleName(filePath: string): string {
  const parts = filePath.split("/");
  // Path format: project/module/version/file or module/version/file
  // Find the version directory (v1, v2, etc.) and take the part before it
  for (let i = parts.length - 2; i >= 0; i--) {
    if (/^v\d+$/.test(parts[i])) {
      // Found version directory, return the part before it
      if (i > 0) {
        return parts[i - 1];
      }
    }
  }
  // Fallback: if no version found, use the first directory
  return parts.length > 1 ? parts[0] : "";
}

/**
 * Generate a unique internal import alias for a file path
 *
 * The alias is used as a private import name to avoid conflicts when re-exporting
 * in nested namespaces. The format is: _{Module}{TypeName}
 *
 * Rules:
 * 1. Extract module name from path using extractModuleName()
 * 2. Extract type name from filename using filePathToTypeName()
 * 3. Combine as: "_{ModulePascalCase}{TypeName}"
 * 4. If no module found, use: "_{TypeName}"
 *
 * Examples:
 *   "pim/models/v1/category_pb" -> "_ModelsCategory"
 *   "pim/product/v1/category_pb" -> "_ProductCategory"
 *   "pim/common/v1/error_pb" -> "_CommonError"
 *   "loyalty/order/v1/order_reward_pb" -> "_OrderOrderReward"
 *   "models/v1/user_pb" -> "_ModelsUser"
 *   "user_pb" -> "_User"
 */
export function filePathToImportAlias(filePath: string): string {
  const baseName = filePathToNamespace(filePath);
  const moduleName = extractModuleName(filePath);

  if (!moduleName) {
    return `_${baseName}`;
  }

  const modulePrefix = snakeToPascalCase(moduleName);
  return `_${modulePrefix}${baseName}`;
}

/**
 * Group type files by their module name
 * Returns a map of moduleName -> array of { file, typeName }
 */
function groupTypeFilesByModule(
  typeFiles: string[],
): Map<string, Array<{ file: string; typeName: string }>> {
  const moduleGroups = new Map<
    string,
    Array<{ file: string; typeName: string }>
  >();

  for (const file of typeFiles) {
    const moduleName = extractModuleName(file);
    const typeName = filePathToNamespace(file);
    const moduleKey = moduleName || "_root";

    const existing = moduleGroups.get(moduleKey) || [];
    existing.push({ file, typeName });
    moduleGroups.set(moduleKey, existing);
  }

  return moduleGroups;
}

/**
 * Generate types/index.ts content using nested namespaces grouped by module
 * This enables IDE auto-completion and provides intuitive access patterns
 *
 * @param typeFiles - Array of relative paths to _pb.ts files (without .ts extension)
 * @returns Generated TypeScript code for types/index.ts
 *
 * Usage:
 *   import { Models, Product, Common } from '@/api/rpc-service/pim/types'
 *   type C1 = Models.Category.Category
 *   type C2 = Product.Category.Category
 *   type E = Common.Error.Error
 */
export function generateTypesIndexFile(typeFiles: string[]): string {
  if (typeFiles.length === 0) {
    return `// Types Index - Auto-generated type aggregation
// DO NOT EDIT: This file is automatically generated

// No type files found
export {}
`;
  }

  // Group files by module
  const moduleGroups = groupTypeFilesByModule(typeFiles);

  // Generate import statements with unique aliases
  const imports: string[] = [];
  const usedAliases = new Set<string>();

  for (const file of typeFiles) {
    let alias = filePathToImportAlias(file);

    // Ensure alias uniqueness
    let finalAlias = alias;
    let counter = 2;
    while (usedAliases.has(finalAlias)) {
      finalAlias = `${alias}${counter}`;
      counter++;
    }
    usedAliases.add(finalAlias);

    imports.push(`import * as ${finalAlias} from '../generated/${file}'`);
  }

  // Generate namespace declarations
  const namespaces: string[] = [];
  const usedAliasesForExport = new Set<string>();

  // Sort modules for consistent output
  const sortedModules = Array.from(moduleGroups.keys()).sort();

  for (const moduleKey of sortedModules) {
    const files = moduleGroups.get(moduleKey) || [];
    const moduleNamespace =
      moduleKey === "_root" ? "Root" : snakeToPascalCase(moduleKey);

    const exportStatements: string[] = [];
    for (const { file, typeName } of files) {
      // Find the alias used for this file
      const alias = filePathToImportAlias(file);
      let finalAlias = alias;

      // Replicate the same uniqueness logic to find the correct alias
      const tempUsed = new Set<string>();
      for (const f of typeFiles) {
        const a = filePathToImportAlias(f);
        let fa = a;
        let c = 2;
        while (tempUsed.has(fa)) {
          fa = `${a}${c}`;
          c++;
        }
        tempUsed.add(fa);
        if (f === file) {
          finalAlias = fa;
          break;
        }
      }

      // Handle duplicate type names within the same module
      let exportName = typeName;
      let exportCounter = 2;
      while (usedAliasesForExport.has(`${moduleKey}:${exportName}`)) {
        exportName = `${typeName}${exportCounter}`;
        exportCounter++;
      }
      usedAliasesForExport.add(`${moduleKey}:${exportName}`);

      exportStatements.push(`  export import ${exportName} = ${finalAlias}`);
    }

    namespaces.push(
      `export namespace ${moduleNamespace} {\n${exportStatements.join("\n")}\n}`,
    );
  }

  return `// Types Index - Auto-generated type aggregation
// DO NOT EDIT: This file is automatically generated
//
// This file aggregates all protobuf-generated types using nested namespaces grouped by module.
// Each module (e.g., models, product, common) becomes a namespace containing its types.
//
// Usage:
//   import { Models, Product, Common } from '@/api/rpc-service/pim/types'
//   type C1 = Models.Category.Category
//   type C2 = Product.Category.Category
//   type E = Common.Error.Error

${imports.join("\n")}

${namespaces.join("\n\n")}
`;
}

/**
 * Extract all services from a service file
 * A single _pb.ts file may contain multiple services (e.g., CampaignService and CampaignAdminService)
 */
export function extractAllServiceInfo(
  filePath: string,
  generatedDir: string,
): ServiceInfo[] {
  const services: ServiceInfo[] = [];

  try {
    const content = fs.readFileSync(filePath, "utf-8");

    // Extract imports mapping (shared across all services in the file)
    const imports: Record<string, string> = {};
    const importRegex =
      /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["']([^"']+)["']/g;
    let importMatch;
    while ((importMatch = importRegex.exec(content)) !== null) {
      const symbols = importMatch[1].split(",").map((s) => s.trim());
      const source = importMatch[2];
      symbols.forEach((s) => {
        if (s) imports[s] = source;
      });
    }

    // Get relative path from generated directory
    const relativePath = path
      .relative(generatedDir, filePath)
      .replace(/\\/g, "/")
      .replace(/\.ts$/, "");

    // Match ALL service definitions: export const ServiceName: GenService<{ ... }> = ...
    const serviceRegex = /export const (\w+):\s*GenService<{([\s\S]*?)}>\s*=/g;
    let serviceMatch;

    while ((serviceMatch = serviceRegex.exec(content)) !== null) {
      const serviceName = serviceMatch[1];
      const methodsBody = serviceMatch[2];
      const methods: MethodInfo[] = [];

      // Extract methods using regex
      // Matches: methodName: { ... input: typeof InputSchema; output: typeof OutputSchema; ... }
      const methodRegex =
        /(\w+):\s*\{\s*[\s\S]*?methodKind:\s*["']unary["'];\s*input:\s*typeof\s+(\w+)Schema;\s*output:\s*typeof\s+(\w+)Schema;/g;

      let methodMatch;
      while ((methodMatch = methodRegex.exec(methodsBody)) !== null) {
        methods.push({
          name: methodMatch[1],
          inputType: methodMatch[2], // e.g. GetBalanceRequest (without Schema)
          inputSchema: methodMatch[2] + "Schema", // e.g. GetBalanceRequestSchema
          outputType: methodMatch[3], // e.g. GetBalanceResponse (without Schema)
          outputSchema: methodMatch[3] + "Schema", // e.g. GetBalanceResponseSchema
        });
      }

      services.push({
        serviceName,
        importPath: relativePath,
        methods,
        imports,
      });
    }
  } catch (error) {
    console.warn(`⚠️  Warning: Could not parse ${filePath}`, error);
  }

  return services;
}

/**
 * Extract service name and methods from service file (legacy, returns first service only)
 * @deprecated Use extractAllServiceInfo instead
 */
export function extractServiceInfo(
  filePath: string,
  generatedDir: string,
): ServiceInfo | null {
  const services = extractAllServiceInfo(filePath, generatedDir);
  return services.length > 0 ? services[0] : null;
}

/**
 * Generate service wrapper code
 *
 * Simplified version that leverages Connect-RPC's built-in type inference.
 * The `Client<typeof Service>` type automatically infers all method signatures
 * from the service definition, eliminating the need for manual interface declarations.
 */
export function generateServiceWrapper(
  name: string,
  serviceInfo: ServiceInfo,
  moduleName?: string,
): string {
  const { serviceName, importPath } = serviceInfo;
  const camelName = name.charAt(0).toLowerCase() + name.slice(1);

  // Determine the relative path to connect-client and generated files
  const connectClientPath = moduleName
    ? "../../connect-client"
    : "../connect-client";
  const generatedPath = moduleName ? "../generated" : "../generated";

  return `// ${name} Service Client - Auto-generated
// DO NOT EDIT: This file is automatically generated

import { createClient, type Client } from '@connectrpc/connect'
import { ${serviceName} } from '${generatedPath}/${importPath}'
import { transport } from '${connectClientPath}'

/**
 * ${name} Service Client
 * Created using Connect-RPC's createClient with configured transport.
 * Type inference is automatically derived from ${serviceName} definition.
 */
export type ${name}Client = Client<typeof ${serviceName}>

export const ${camelName}Client: ${name}Client = createClient(${serviceName}, transport)
`;
}

/**
 * Generate services index file
 * Exports all service clients and the types namespace for IDE auto-completion
 */
export function generateServicesIndexFile(
  services: Array<{ name: string; camelName: string }>,
): string {
  return `// Services Index - Auto-generated exports
// DO NOT EDIT: This file is automatically generated

${services
  .map(
    (s) =>
      `export { ${s.camelName}Client, type ${s.name}Client } from './${s.camelName}.client'`,
  )
  .join("\n")}

// Export types namespace for IDE auto-completion
// Usage: pimService.types.ProductFilter, pimService.types.Product, etc.
export * as types from '../types'
`;
}

// generateServicesTypesFile is removed as it is no longer needed

/**
 * Check if a service name matches any of the given patterns
 *
 * This function matches against the proto service name (e.g., "UserAdminService", "CampaignService")
 * Pattern examples:
 *   - "Admin" matches: UserAdminService, AdminService, ProductAdminService
 *   - "Admin$" matches: only services ending with "Admin" (not "AdminService")
 *   - "^Admin" matches: only services starting with "Admin"
 *   - "CustomerService$" matches: services ending with "CustomerService"
 *
 * @param serviceName - The service name from proto definition (e.g., "UserAdminService")
 * @param patterns - Array of regex patterns to match against service names
 * @returns true if the service name matches any pattern
 */
function matchesPattern(serviceName: string, patterns?: string[]): boolean {
  if (!patterns || patterns.length === 0) {
    return false;
  }

  return patterns.some((pattern) => {
    try {
      // Use regex to match service name
      const regex = new RegExp(pattern);
      return regex.test(serviceName);
    } catch {
      // If pattern is not a valid regex, treat it as a simple substring match
      return serviceName.includes(pattern);
    }
  });
}

/**
 * Check if a service name should be included based on whitelist patterns
 *
 * @param serviceName - The service name from proto definition
 * @param includePatterns - Array of regex patterns for whitelist
 *   - ['*'] or undefined = include all services
 *   - [] = include no services
 *   - ['CustomerService$'] = include services matching pattern
 * @returns true if the service should be included
 */
export function shouldIncludeService(
  serviceName: string,
  includePatterns?: string[],
): boolean {
  // If undefined, include all services
  if (includePatterns === undefined) {
    return true;
  }

  // If empty array, include no services
  if (includePatterns.length === 0) {
    return false;
  }

  // If '*' is in patterns, include all services
  if (includePatterns.includes("*")) {
    return true;
  }

  return matchesPattern(serviceName, includePatterns);
}

/**
 * Check if a service name should be excluded based on blacklist patterns
 *
 * @param serviceName - The service name from proto definition (e.g., "UserAdminService")
 * @param excludePatterns - Array of regex patterns to match against service names
 * @returns true if the service should be excluded
 */
export function shouldExcludeService(
  serviceName: string,
  excludePatterns?: string[],
): boolean {
  if (!excludePatterns || excludePatterns.length === 0) {
    return false;
  }

  return matchesPattern(serviceName, excludePatterns);
}

/**
 * Check if a service should be generated based on include and exclude patterns
 *
 * Logic:
 * 1. First check includePatterns (whitelist) - if empty, include all
 * 2. Then check excludePatterns (blacklist) - exclude from the included set
 *
 * @param serviceName - The service name from proto definition
 * @param includePatterns - Whitelist patterns (if empty, include all)
 * @param excludePatterns - Blacklist patterns (applied after whitelist)
 * @returns true if the service should be generated
 */
export function shouldGenerateService(
  serviceName: string,
  includePatterns?: string[],
  excludePatterns?: string[],
): boolean {
  // First check whitelist
  if (!shouldIncludeService(serviceName, includePatterns)) {
    return false;
  }

  // Then check blacklist
  if (shouldExcludeService(serviceName, excludePatterns)) {
    return false;
  }

  return true;
}

/**
 * Generate service wrappers from scanned files
 *
 * @param serviceFiles - Array of service file paths
 * @param generatedDir - Directory containing generated protobuf files
 * @param servicesDir - Output directory for service wrappers
 * @param moduleName - Module name for the generated code
 * @param includeServicePatterns - Whitelist patterns (if empty, include all)
 * @param excludeServicePatterns - Blacklist patterns (applied after whitelist)
 */
export async function generateServiceWrappers(
  serviceFiles: string[],
  generatedDir: string,
  servicesDir: string,
  moduleName?: string,
  includeServicePatterns?: string[],
  excludeServicePatterns?: string[],
): Promise<void> {
  // Ensure services directory exists
  if (!fs.existsSync(servicesDir)) {
    fs.mkdirSync(servicesDir, { recursive: true });
  }

  const generatedServices: Array<{ name: string; camelName: string }> = [];

  // Generate wrapper for each service file
  for (const filePath of serviceFiles) {
    // Skip third-party services (e.g., google, buf, connect)
    const normalizedPath = path.normalize(filePath);
    const pathSegments = normalizedPath.split(path.sep);
    if (
      pathSegments.includes("google") ||
      pathSegments.includes("buf") ||
      pathSegments.includes("connect")
    ) {
      continue;
    }

    // Extract ALL services from this file (a single _pb.ts may contain multiple services)
    const allServices = extractAllServiceInfo(filePath, generatedDir);
    if (allServices.length === 0) continue;

    // Check if any service in this file matches the include patterns
    const matchingServices = allServices.filter((serviceInfo) =>
      shouldGenerateService(
        serviceInfo.serviceName,
        includeServicePatterns,
        excludeServicePatterns,
      ),
    );

    // If no services match, skip this file entirely
    if (matchingServices.length === 0) {
      const skippedNames = allServices.map((s) => s.serviceName).join(", ");
      console.log(
        `   ⏭️  Skipped file (no matching services): ${skippedNames}`,
      );
      continue;
    }

    for (const serviceInfo of matchingServices) {
      // Extract clean name (remove "Service" suffix if present)
      const cleanName = serviceInfo.serviceName.replace(/Service$/, "");
      const camelName = cleanName.charAt(0).toLowerCase() + cleanName.slice(1);

      const code = generateServiceWrapper(cleanName, serviceInfo, moduleName);

      const outputPath = path.join(servicesDir, `${camelName}.client.ts`);
      fs.writeFileSync(outputPath, code);
      console.log(`   ✅ Generated ${cleanName} client`);

      generatedServices.push({ name: cleanName, camelName });
    }
  }

  // Generate services index file (Clients and Types)
  if (generatedServices.length > 0) {
    const servicesIndexContent = generateServicesIndexFile(generatedServices);
    const servicesIndexPath = path.join(servicesDir, "index.ts");
    fs.writeFileSync(servicesIndexPath, servicesIndexContent);
    console.log(`   ✅ Generated services index (with types)`);
  } else {
    console.log(`   ⚠️  No services generated (no matching patterns)`);
  }

  console.log(`   📦 Total services generated: ${generatedServices.length}`);
}
