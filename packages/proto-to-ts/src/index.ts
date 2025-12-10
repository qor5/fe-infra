/**
 * @theplant/proto-to-ts
 *
 * Interactive protobuf to TypeScript code generation tool with Connect-RPC support
 */

export { runInteractiveCLI, runNonInteractiveCLI } from "./cli.js";
export { generateFromProto } from "./generator.js";
export {
  generateBufGenYaml,
  parseBufGenYaml,
} from "./templates/buf-gen.template.js";
export {
  loadHistory,
  saveHistory,
  addToHistory,
  formatTimestamp,
  getModuleNameFromHistory,
} from "./utils/history.js";
export {
  isValidProtoPath,
  findProtoFiles,
  findServiceFiles,
  findBufModuleRoot,
  extractBufDependencies,
} from "./utils/proto-scanner.js";
export {
  extractServiceInfo,
  generateServiceWrapper,
  generateServicesIndexFile,
  generateServiceWrappers,
} from "./utils/service-wrapper.js";
export {
  extractJsonNameMappings,
  applyJsonNameMappings,
} from "./utils/json-name.js";
export {
  checkConnectClientExists,
  generateConnectClientFiles,
  getRequiredDependencies,
} from "./utils/setup-helpers.js";
export {
  detectPackageManager,
  checkPackagesInstalled,
  installPackages,
  getInstallCommand,
  getPackagesWithVersions,
} from "./utils/package-manager.js";
export type { PackageManager } from "./utils/package-manager.js";

export type {
  ProtoGenConfig,
  HistoryRecord,
  History,
  ValidationResult,
  BufModuleInfo,
  ServiceInfo,
  BufGenConfig,
} from "./types.js";
