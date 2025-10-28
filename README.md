## Release & Publish Guide (Changesets + GitHub Packages)

### Scope

- This setup publishes Node.js packages (npm) in this workspace to GitHub Packages under the `@qor5` scope.
- Go code is not published via this pipeline. For Go modules, use Git tags (or set up a separate workflow like GoReleaser).

### Requirements

- Repo settings → Actions → General:
  - Workflow permissions: Read and write permissions
  - Allow GitHub Actions to create and approve pull requests
- Package naming: packages must be scoped (e.g. `@theplant/fe-lint-kit`).
- Registry is already configured:
  - `.npmrc` routes `@qor5` to `https://npm.pkg.github.com` and uses `NODE_AUTH_TOKEN` (provided automatically as `GITHUB_TOKEN` in CI).
  - Each package has `publishConfig.registry: https://npm.pkg.github.com/`.

### Normal flow (auto PR + publish)

1. Create a changeset (choose changed packages and semver bump):
   - From repo root:
     ```bash
     pnpm -C fe-infra changeset
     ```
   - Or inside `fe-infra/`:
     ```bash
     pnpm changeset
     ```
     Commit the generated `.changeset/*.md` file on your feature branch and open a PR to `main`.

2. Merge the feature PR to `main`:
   - The workflow `.github/workflows/release.yml` will open a "Version Packages" PR with bumped versions and changelogs.

3. Merge the "Version Packages" PR:
   - CI will version packages and publish changed packages to GitHub Packages.

### Manual run

- You can manually trigger the workflow in GitHub Actions (workflow_dispatch) if needed.

### Local testing (optional)

- To test changelog/version locally without publishing:
  ```bash
  pnpm -C fe-infra changeset version
  pnpm -C fe-infra -w install --no-frozen-lockfile
  ```

### Troubleshooting

- No PR created: ensure a changeset file exists and was merged into `main`.
- "Resource not accessible by integration": ensure workflow permissions (see Requirements).
- 404/403 publishing: package must be scoped under `@qor5`, registry must be `npm.pkg.github.com`.

### Go projects

- Go modules are typically distributed via VCS tags (no npm/GitHub Packages flow required). If you need binary releases or artifacts, consider adding a dedicated Go release workflow (e.g., GoReleaser) in your Go project directory.
