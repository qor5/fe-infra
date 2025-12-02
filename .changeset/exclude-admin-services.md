---
"@theplant/proto-to-ts": patch
---

### New Features

- **Exclude Admin Services**: Added `excludeServicePatterns` configuration to exclude services from client generation based on service name patterns.
  - Default: `["AdminService"]` - automatically excludes all services containing "AdminService" in their name (e.g., `UserAdminService`, `CampaignAdminService`)
  - Set to `[]` to include all services
  - Useful for excluding internal admin APIs from public frontend SDKs

### Configuration

```javascript
export default {
  // ... other config

  // Exclude services from client generation
  // Matches proto service names like: service UserAdminService { ... }
  // Set to [] to include all services
  excludeServicePatterns: ["AdminService"],
};
```
