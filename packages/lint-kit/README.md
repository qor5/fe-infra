# @qor5/fe-lint-kit

一个开箱即用的 ESLint 和 Prettier 配置包，专为 React + TypeScript 项目设计。

## 特性

- ✅ **ESLint 9+ Flat Config** - 使用最新的 ESLint 扁平化配置格式
- ✅ **TypeScript 支持** - 内置 TypeScript 规则和类型检查
- ✅ **React 最佳实践** - 包含 React Hooks 和 React Refresh 规则
- ✅ **Prettier 集成** - ESLint 和 Prettier 无缝协作，无冲突
- ✅ **自动导入排序** - 按约定顺序自动排序 import 语句
- ✅ **Tailwind CSS 支持** - 自动排序 Tailwind CSS 类名
- ✅ **零配置** - 开箱即用的最佳实践配置

## 安装

```bash
pnpm add -D @qor5/fe-lint-kit eslint prettier
```

> **注意**: `eslint` 和 `prettier` 是 peer dependencies，需要在你的项目中安装。

## 使用方法

### ESLint 配置

在项目根目录创建 `eslint.config.js`:

```js
import { eslintReactConfig } from '@qor5/fe-lint-kit'

export default [
  ...eslintReactConfig,
  // 你可以在这里添加项目特定的规则
  {
    ignores: ['src/components/ui'], // 忽略特定文件夹
  },
]
```

#### 高级用法（带 TypeScript 项目服务）

```js
import { eslintReactConfig } from '@qor5/fe-lint-kit'

const __dirname = import.meta.dirname

export default [
  ...eslintReactConfig,
  {
    ignores: ['src/components/ui'],
  },
  {
    // 仅对 TS/TSX 文件应用类型检查
    files: ['src/**/*.{ts,tsx}', 'vite.config.ts'],
    languageOptions: {
      parserOptions: {
        // 使用 projectService 避免将所有文件（如 eslint.config.js）包含在 tsconfig 中
        projectService: true,
        tsconfigRootDir: __dirname,
        // 允许未包含在 tsconfig 中的配置文件使用默认项目
        allowDefaultProject: true,
      },
    },
  },
]
```

### Prettier 配置

在项目根目录创建 `.prettierrc.js`:

```js
import { prettierReactConfig } from '@qor5/fe-lint-kit'

export default {
  ...prettierReactConfig,
  // 你可以在这里覆盖特定的配置
  // printWidth: 100,
}
```

### 添加 NPM Scripts

在 `package.json` 中添加以下脚本:

```json
{
  "scripts": {
    "lint": "eslint .",
    "format:check": "prettier --check .",
    "format": "prettier --write ."
  }
}
```

## 包含的规则

### ESLint 规则

- **JavaScript 基础**: ESLint 推荐规则
- **TypeScript**: TypeScript ESLint 推荐规则
  - 强制使用 `type` 导入 (`@typescript-eslint/consistent-type-imports`)
  - 未使用变量检测，支持 `_` 前缀忽略 (`@typescript-eslint/no-unused-vars`)
- **React**:
  - React Hooks 规则 (`eslint-plugin-react-hooks`)
  - React Refresh 规则 (`eslint-plugin-react-refresh`)
- **代码质量**:
  - 禁止 `console` 语句 (`no-console: error`)
  - 禁止重复导入 (`no-duplicate-imports`)
  - Prettier 格式化作为 ESLint 规则 (`prettier/prettier`)

### Prettier 规则

- **代码风格**:
  - 单引号 (`singleQuote: true`)
  - 无分号 (`semi: false`)
  - 2 空格缩进 (`tabWidth: 2`)
  - 80 字符行宽 (`printWidth: 80`)
  - ES5 尾随逗号 (`trailingComma: 'es5'`)

- **自动排序**:
  - Import 语句按约定顺序排序
  - Tailwind CSS 类名自动排序

## 默认忽略文件

ESLint 配置默认忽略以下文件/文件夹:

- `dist/`
- `node_modules/`
- `vite-env.d.ts`

## 完整示例

参考 `adminX/packages/admin-core` 中的配置:

**eslint.config.js:**

```js
import { eslintReactConfig } from '@qor5/fe-lint-kit'
import pluginQuery from '@tanstack/eslint-plugin-query'

const __dirname = import.meta.dirname

export default [
  ...eslintReactConfig,
  { ignores: ['src/components/ui'] },
  ...pluginQuery.configs['flat/recommended'],
  {
    files: ['src/**/*.{ts,tsx}', 'vite.config.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
        allowDefaultProject: true,
      },
    },
  },
]
```

**.prettierrc.js:**

```js
import { prettierReactConfig } from '@qor5/fe-lint-kit'

export default {
  ...prettierReactConfig,
}
```

**package.json:**

```json
{
  "devDependencies": {
    "@qor5/fe-lint-kit": "^1.0.3",
    "eslint": "^9.35.0",
    "prettier": "^3.6.2"
  },
  "scripts": {
    "lint": "eslint .",
    "format:check": "prettier --check .",
    "format": "prettier --write ."
  }
}
```

## IDE 集成

### VS Code

#### 推荐扩展

在项目根目录创建 `.vscode/extensions.json`:

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next",
    "formulahendry.auto-rename-tag",
    "christian-kohler.path-intellisense"
  ]
}
```

这样团队成员打开项目时会收到安装推荐扩展的提示。

#### 编辑器设置

在项目根目录创建 `.vscode/settings.json`:

```json
{
  // Use ESLint to fix problems on save
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  // Use Prettier as default formatter
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  // Format on save with Prettier (set to false if ESLint already handles formatting)
  "editor.formatOnSave": false,
  // Ensure TS Server uses workspace TypeScript
  "typescript.tsdk": "node_modules/typescript/lib",
  // Enable ESLint for TS/JS
  "eslint.validate": [
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact",
    "json"
  ]
}
```

> **注意**: `formatOnSave` 设置为 `false` 是因为 ESLint 已经通过 `prettier/prettier` 规则处理格式化。如果设置为 `true` 可能会导致重复格式化。

## 常见问题

### 为什么使用 Flat Config？

ESLint 9+ 推荐使用新的扁平化配置格式 (Flat Config)，它提供了更好的类型支持和更清晰的配置结构。旧的 `.eslintrc` 格式已被弃用。

### 如何覆盖特定规则？

在你的 `eslint.config.js` 中添加自定义规则:

```js
import { eslintReactConfig } from '@qor5/fe-lint-kit'

export default [
  ...eslintReactConfig,
  {
    rules: {
      'no-console': 'warn', // 将 error 降级为 warn
      '@typescript-eslint/no-explicit-any': 'off', // 关闭特定规则
    },
  },
]
```

### 为什么 Prettier 插件打包在这个包中？

为了简化依赖管理，我们将 Prettier 插件（如 `prettier-plugin-tailwindcss`）打包在这个共享包中。这意味着：

- ✅ 所有项目使用相同版本的插件
- ✅ 减少每个项目的依赖数量
- ✅ 确保配置一致性

## License

ISC
