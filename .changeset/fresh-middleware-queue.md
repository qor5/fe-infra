---
"@theplant/fetch-middleware": minor
---

## Features

- **Auth Refresh Helpers**: Added `createSessionRefreshMiddleware` and `createConnectSessionRefreshMiddleware` for easy integration of authentication refresh logic.

## Documentation

- Added `README.zh-CN.md` (Chinese documentation).
- Added comprehensive documentation for all middlewares in `docs/` directory.
- Added `REQUEST_QUEUE_FIX.md` detailing the fix for request ordering race conditions.

## Breaking Changes

- `parseConnectError`: The `validationError` and `rawMessage` fields are currently disabled/commented out in the return object.
