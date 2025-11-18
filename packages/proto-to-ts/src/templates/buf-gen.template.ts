/**
 * buf.gen.yaml template generator
 */
import type { BufGenConfig } from "../types.js";

/**
 * Generate buf.gen.yaml content from config
 */
export function generateBufGenYaml(
  outputDir: string,
  inputDir: string,
  bufDeps: string[] = [],
  goPackagePrefix?: string,
): string {
  const disableModules = bufDeps
    .map((dep) => `    - module: ${dep}`)
    .join("\n");

  const config = `version: v2

managed:
  enabled: true
${disableModules ? `  disable:\n${disableModules}\n` : ""}${
    goPackagePrefix
      ? `  override:
    - file_option: go_package_prefix
      value: ${goPackagePrefix}
`
      : ""
  }
inputs:
  - directory: ${inputDir}
${bufDeps.length > 0 ? bufDeps.map((dep) => `  - module: ${dep}`).join("\n") : ""}

plugins:
  # Generate types and Connect-RPC service definitions using protoc-gen-es v2
  - local: protoc-gen-es
    out: ${outputDir}
    opt:
      - target=ts
      - import_extension=none
`;

  return config;
}

/**
 * Parse buf.gen.yaml and extract config
 */
export function parseBufGenYaml(content: string): Partial<BufGenConfig> {
  const config: Partial<BufGenConfig> = {};

  try {
    // Extract version
    const versionMatch = content.match(/version:\s*(\S+)/);
    if (versionMatch) {
      config.version = versionMatch[1];
    }

    // Extract managed section
    if (content.includes("managed:")) {
      config.managed = {
        enabled: content.includes("enabled: true"),
      };

      // Extract disable modules
      const disableMatch = content.match(
        /disable:\s*([\s\S]*?)(?=override:|inputs:|plugins:|$)/m,
      );
      if (disableMatch) {
        const modules = disableMatch[1].matchAll(/module:\s*(\S+)/g);
        config.managed.disable = Array.from(modules).map((m) => ({
          module: m[1],
        }));
      }
    }

    // Extract inputs
    const inputsMatch = content.match(/inputs:\s*([\s\S]*?)(?=plugins:|$)/m);
    if (inputsMatch) {
      const inputs = [];
      const dirMatches = inputsMatch[1].matchAll(/directory:\s*(\S+)/g);
      const moduleMatches = inputsMatch[1].matchAll(/module:\s*(\S+)/g);

      for (const match of dirMatches) {
        inputs.push({ directory: match[1] });
      }
      for (const match of moduleMatches) {
        inputs.push({ module: match[1] });
      }

      config.inputs = inputs;
    }

    // Extract plugins
    const pluginsMatch = content.match(/plugins:\s*([\s\S]*?)$/m);
    if (pluginsMatch) {
      config.plugins = [];
      // This is a simplified parser - for production, consider using a proper YAML parser
    }
  } catch (error) {
    console.warn("⚠️  Warning: Could not parse buf.gen.yaml");
  }

  return config;
}
