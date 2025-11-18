## 发布与发布指南（Changesets + GitHub Packages）

### 适用范围

- 此设置将此工作区中的 Node.js 包（npm）发布到 GitHub Packages，命名空间为 `@qor5`。
- Go 代码不通过此管道发布。对于 Go 模块，请使用 Git 标签（或设置单独的工作流，如 GoReleaser）。

### 前置要求

- 仓库设置 → Actions → General：
  - 工作流权限：读写权限
  - 允许 GitHub Actions 创建和批准拉取请求
- 包命名：包必须使用命名空间（例如 `@qor5/fe-lint-kit`）。
- 注册表已配置：
  - `.npmrc` 将 `@qor5` 路由到 `https://npm.pkg.github.com` 并使用 `NODE_AUTH_TOKEN`（在 CI 中自动作为 `GITHUB_TOKEN` 提供）。
  - 每个包都有 `publishConfig.registry: https://npm.pkg.github.com/`。

### 正常流程（自动 PR + 发布）

1. 创建 changeset（选择更改的包和语义化版本提升）：
   - 从仓库根目录：
     ```bash
     pnpm -C fe-infra changeset
     ```
   - 或在 `fe-infra/` 目录内：
     ```bash
     pnpm changeset
     ```
     在您的功能分支上提交生成的 `.changeset/*.md` 文件，并打开 PR 到 `main`。

2. 将功能 PR 合并到 `main`：
   - 工作流 `.github/workflows/release.yml` 将打开一个 "Version Packages" PR，其中包含更新的版本和变更日志。

3. 合并 "Version Packages" PR：
   - CI 将对包进行版本控制，并将更改的包发布到 GitHub Packages。

### 手动运行

- 如需要，您可以在 GitHub Actions 中手动触发工作流（workflow_dispatch）。

### 本地测试（可选）

- 要在不发布的情况下本地测试变更日志/版本：
  ```bash
  pnpm -C fe-infra changeset version
  pnpm -C fe-infra -w install --no-frozen-lockfile
  ```

### 故障排除

- 未创建 PR：确保 changeset 文件存在并已合并到 `main`。
- "Resource not accessible by integration"：确保工作流权限（参见前置要求）。
- 404/403 发布错误：包必须使用 `@qor5` 命名空间，注册表必须是 `npm.pkg.github.com`。

### Go 项目

- Go 模块通常通过 VCS 标签分发（不需要 npm/GitHub Packages 流程）。如果您需要二进制发布或构建产物，请考虑在 Go 项目目录中添加专用的 Go 发布工作流（例如 GoReleaser）。
