/**
 * Setup helper functions for generating Connect client files
 */
import fs from "fs";
import path from "path";
import {
  generateConnectClientTemplate,
  generateConnectErrorHandlerTemplate,
  generateUtilsTemplate,
} from "../templates/connect-client.template.js";

/**
 * Check if connect-client.ts already exists
 */
export function checkConnectClientExists(apiDir: string): boolean {
  const connectClientPath = path.join(apiDir, "connect-client.ts");
  return fs.existsSync(connectClientPath);
}

/**
 * Generate Connect client files
 */
export function generateConnectClientFiles(apiDir: string): void {
  // Ensure api directory exists
  if (!fs.existsSync(apiDir)) {
    fs.mkdirSync(apiDir, { recursive: true });
  }

  // Generate connect-client.ts
  const connectClientPath = path.join(apiDir, "connect-client.ts");
  const connectClientContent = generateConnectClientTemplate();
  fs.writeFileSync(connectClientPath, connectClientContent);
  console.log(`   ✅ Generated ${connectClientPath}`);

  // Generate handlers directory
  const handlersDir = path.join(apiDir, "handlers");
  if (!fs.existsSync(handlersDir)) {
    fs.mkdirSync(handlersDir, { recursive: true });
  }

  // Generate connect-error-handler.ts
  const errorHandlerPath = path.join(handlersDir, "connect-error-handler.ts");
  const errorHandlerContent = generateConnectErrorHandlerTemplate();
  fs.writeFileSync(errorHandlerPath, errorHandlerContent);
  console.log(`   ✅ Generated ${errorHandlerPath}`);

  // Generate utils.ts
  const utilsPath = path.join(handlersDir, "utils.ts");
  const utilsContent = generateUtilsTemplate();
  fs.writeFileSync(utilsPath, utilsContent);
  console.log(`   ✅ Generated ${utilsPath}`);
}

/**
 * Get required runtime dependencies with recommended versions
 */
export function getRequiredDependencies(): {
  runtime: Array<{ name: string; version: string }>;
  dev: Array<{ name: string; version: string }>;
} {
  return {
    runtime: [
      { name: "@bufbuild/protobuf", version: "^2.9.0" },
      { name: "@connectrpc/connect", version: "2.1.0" },
      { name: "@connectrpc/connect-web", version: "2.1.0" },
      { name: "@theplant/fetch-middleware", version: "^0.3.1" },
    ],
    dev: [],
  };
}
