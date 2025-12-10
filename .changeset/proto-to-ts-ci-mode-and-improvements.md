---
"@theplant/proto-to-ts": minor
---

### New Features

- **Non-interactive CI mode (`-y` flag)**: Run `proto-to-ts -y` to skip all prompts and use config file settings directly. Required config fields for `-y` mode:
  - `protoPath`: Path to proto directory (relative or absolute)
  - `defaultModuleName` (or `moduleName`): Module name for generated code
  - `rpcServiceDir`: Root directory for RPC services

- **Service whitelist (`includeServicePatterns`)**: New whitelist feature using regex patterns to filter which services to generate
  - `["*"]` = include all services (default)
  - `["CustomerService$"]` = only services ending with "CustomerService"
  - `[]` = include no services
  - Interactive mode offers three choices: all services, customer-facing only, or custom regex pattern

- **Namespaced type exports**: Types are now exported as namespaces to avoid naming conflicts between proto files

  ```typescript
  // Before (could cause conflicts)
  export * from "../generated/loyalty/campaign/v1/campaign_pb";
  export * from "../generated/loyalty/order/v1/order_reward_pb";

  // After (no conflicts)
  export * as Campaign from "../generated/loyalty/campaign/v1/campaign_pb";
  export * as OrderReward from "../generated/loyalty/order/v1/order_reward_pb";
  ```

  Usage: `import { Campaign, OrderReward } from '@/api/types'` then `OrderReward.Reward`

- **Auto-generate config file**: After first interactive run, `proto-to-ts.config.js` is automatically created with user's choices

### Improvements

- **Service filtering logic**: Whitelist (`includeServicePatterns`) is applied first, then blacklist (`excludeServicePatterns`) is applied to the included set
- **Regex pattern support**: All patterns use JavaScript RegExp syntax (`$` for ends with, `^` for starts with, etc.)
- **Improved prompts**: Interactive mode asks "Which services do you want to include?" with clear options
- **Skip empty files**: If no services in a proto file match the include patterns, the file is skipped entirely
- **Backward compatibility**: Supports both `defaultModuleName` (new) and `moduleName` (legacy) in config files

### Testing

- Added unit tests for `shouldIncludeService`, `shouldExcludeService`, `shouldGenerateService`
- Added tests for whitelist + blacklist combination scenarios
- Added vitest configuration and test scripts
