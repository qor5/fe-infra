# @theplant/proto-to-ts

## 0.1.0

### Minor Changes

- [#34](https://github.com/theplant/qor5-fe-infra/pull/34) [`175b042`](https://github.com/theplant/qor5-fe-infra/commit/175b042a8885a90c0fbd1491c41fcd35aee5a40a) Thanks [@danni-cool](https://github.com/danni-cool)! - Add proto-to-ts CLI tool with modular structure support:
  - Interactive CLI for generating TypeScript files from protobuf definitions
  - Support for modular multi-project organization (e.g., `rpc-service/pim/`, `rpc-service/auth/`)
  - Automatic service client wrapper generation with Connect-RPC
  - Shared transport configuration across modules
  - Fix package exports to use compiled dist files instead of source files
  - Add prepublishOnly script to ensure clean builds before publishing
