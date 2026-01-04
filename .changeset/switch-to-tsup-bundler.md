---
"@theplant/fetch-middleware": patch
---

Switch from tsc to tsup for ESM/CJS bundling

- Fixed ESM module resolution issue where relative imports were missing `.js` extension in compiled output
- Added tsup as bundler to produce bundled ESM and CJS files, eliminating relative import path issues
- Build now uses `tsup` for JS bundling and `tsc --emitDeclarationOnly` for type declarations
