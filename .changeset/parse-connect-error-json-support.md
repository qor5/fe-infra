---
"@theplant/fetch-middleware": patch
---

`parseConnectError` now supports Connect JSON body input (from `httpErrorMiddleware` `onError` callback), in addition to `ConnectError` objects.

Uses connect-es official `errorFromJson` and `codeFromString` to properly parse Connect JSON format with base64-encoded details.

`tagSessionMiddleware` now supports `['*']` in endpoints array to match all URLs. This is useful when you want to tag all requests (e.g., mark all as protected) without specifying individual endpoint patterns.
