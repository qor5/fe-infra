/**
 * Setup helper functions for generating Connect client files
 */
import fs from "fs";
import path from "path";
import { generateConnectClientTemplate } from "../templates/connect-client.template.js";

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
