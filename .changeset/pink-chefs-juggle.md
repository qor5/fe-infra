---
"@theplant/proto-to-ts": minor
---

Add proto-to-ts CLI tool with modular structure support:

- Interactive CLI for generating TypeScript files from protobuf definitions
- Support for modular multi-project organization (e.g., `rpc-service/pim/`, `rpc-service/auth/`)
- Automatic service client wrapper generation with Connect-RPC
- Shared transport configuration across modules
- Fix package exports to use compiled dist files instead of source files
- Add prepublishOnly script to ensure clean builds before publishing
