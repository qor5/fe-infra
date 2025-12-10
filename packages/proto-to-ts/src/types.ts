/**
 * Type definitions for proto-gen-tool
 */

export interface HistoryRecord {
  path: string;
  timestamp: number;
  type: "file" | "directory";
  // Module name associated with this proto path
  moduleName?: string;
}

export interface History {
  records: HistoryRecord[];
  // Last used rpcServiceDir (shared across all proto paths)
  lastRpcServiceDir?: string;
}

export interface ProtoGenConfig {
  // Default module name for -y mode (e.g., "pim", "ciam", "loyalty")
  // In interactive mode, history's moduleName for the selected proto path takes precedence
  defaultModuleName?: string;
  // Root directory for RPC services (e.g., "src/lib/api/rpc-service")
  rpcServiceDir?: string;
  // Path to proto file or directory (relative or absolute, required for -y mode)
  protoPath?: string;
  // Output directory for generated code (auto-computed from rpcServiceDir + moduleName)
  outputDir?: string;
  // Directory for service wrappers (auto-computed from rpcServiceDir + moduleName)
  servicesDir?: string;
  // Runtime module name (set by CLI, not in config file)
  moduleName?: string;
  // History file path
  historyFile?: string;
  // Maximum history records to keep
  maxHistory?: number;
  // Custom buf.gen.yaml template (optional)
  bufGenTemplate?: string;
  // Additional buf modules to include in inputs
  additionalModules?: string[];
  // Regex patterns to include services in client generation (whitelist)
  // ["*"] = all services (default)
  // ["CustomerService$"] = only include services ending with "CustomerService"
  // These patterns are matched against the service name defined in proto: `service XxxCustomerService { ... }`
  includeServicePatterns?: string[];
  // Optional: Regex patterns to exclude services from client generation (blacklist)
  // Applied after includeServicePatterns (excludes from the included set)
  // Example: ["AdminService", "InternalService"]
  // These patterns are matched against the service name defined in proto: `service XxxAdminService { ... }`
  excludeServicePatterns?: string[];
}

export interface ValidationResult {
  valid: boolean;
  type?: "file" | "directory";
  files?: string[];
}

export interface BufModuleInfo {
  root: string;
  modulePath?: string;
}

export interface MethodInfo {
  name: string;
  inputType: string;
  inputSchema: string;
  outputType: string;
  outputSchema: string;
}

export interface ServiceInfo {
  serviceName: string;
  importPath: string;
  methods: MethodInfo[];
  imports: Record<string, string>;
}

export interface BufGenConfig {
  version: string;
  managed: {
    enabled: boolean;
    disable?: Array<{ module: string }>;
    override?: Array<{ file_option: string; value: string }>;
  };
  inputs: Array<{ directory?: string; module?: string }>;
  plugins: Array<{
    local?: string;
    remote?: string;
    out: string;
    opt?: string[];
  }>;
}
