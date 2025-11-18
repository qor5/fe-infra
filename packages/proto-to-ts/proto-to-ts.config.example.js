/**
 * Example configuration file for proto-to-ts
 * Copy this file to proto-to-ts.config.js in your project root and customize as needed
 */
export default {
  // Output directory for generated code
  outputDir: "src/lib/api/generated",

  // Directory for service wrappers (optional)
  // Set to undefined or remove to disable service wrapper generation
  servicesDir: "src/lib/api/services",

  // History file path (relative to project root)
  historyFile: ".proto-to-ts-history.json",

  // Maximum number of history records to keep
  maxHistory: 10,

  // Custom buf.gen.yaml template (optional)
  // If not provided, a default template will be used
  // bufGenTemplate: 'path/to/custom/buf.gen.yaml',

  // Additional buf modules to include (optional)
  // additionalModules: ['buf.build/some/module'],
};
