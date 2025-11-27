# @theplant/proto-to-ts

## 0.1.1

### Patch Changes

- [#37](https://github.com/theplant/qor5-fe-infra/pull/37) [`08b9e84`](https://github.com/theplant/qor5-fe-infra/commit/08b9e84552438edf04e67645641977d761e89a28) Thanks [@danni-cool](https://github.com/danni-cool)! - ### @theplant/proto-to-ts

  Significant feature enhancements: added method extraction, import resolution, interface generation, and other functional improvements. This update goes beyond code style formatting and introduces new capabilities to the package.

  ### @theplant/fetch-middleware

  Documentation cleanup: removed deprecated auth-refresh middleware documentation and references.

  **Breaking changes:**
  - Removed `rawMessage` and `validationError` from the `parseConnectError` return type.
  - Renamed types: `RestClientOptions` → `FetchClientOptions`, `RestClient` → `FetchClient`.

## 0.1.0

### Minor Changes

- [#34](https://github.com/theplant/qor5-fe-infra/pull/34) [`175b042`](https://github.com/theplant/qor5-fe-infra/commit/175b042a8885a90c0fbd1491c41fcd35aee5a40a) Thanks [@danni-cool](https://github.com/danni-cool)! - Add proto-to-ts CLI tool with modular structure support:
  - Interactive CLI for generating TypeScript files from protobuf definitions
  - Support for modular multi-project organization (e.g., `rpc-service/pim/`, `rpc-service/auth/`)
  - Automatic service client wrapper generation with Connect-RPC
  - Shared transport configuration across modules
  - Fix package exports to use compiled dist files instead of source files
  - Add prepublishOnly script to ensure clean builds before publishing
