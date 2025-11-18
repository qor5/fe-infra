# @theplant/proto-to-ts

交互式的 Protobuf 到 TypeScript 代码生成工具，支持 Connect-RPC。

## 特性

- 🎯 **交互式选择** - 通过友好的 CLI 界面选择 proto 文件或目录
- 📚 **历史记录** - 自动保存最近使用的路径，快速重新生成
- 🔄 **自动化流程** - 自动生成 TypeScript 类型、Connect-RPC 客户端和服务包装器
- 🎨 **模板化配置** - 自动从 buf.yaml 提取依赖生成 buf.gen.yaml
- 🔍 **json_name 支持** - 自动应用 protobuf 的 json_name 映射
- 📦 **服务包装器** - 可选的 Connect-RPC 服务客户端包装器生成

## 工作原理

### buf.gen.yaml 依赖来源

`buf.gen.yaml` 中的 `inputs` 部分来源于：

1. **proto 目录路径** - 从你选择的目录自动检测
2. **buf.yaml 的 deps** - 从 proto 目录的 `buf.yaml` 文件中提取

例如，如果你的 `buf.yaml` 包含：

```yaml
deps:
  - buf.build/googleapis/googleapis:e93e34f48be043dab55be31b4b47f458
  - buf.build/grpc-ecosystem/grpc-gateway:4c5ba75caaf84e928b7137ae5c18c26a
```

工具会自动生成包含这些依赖的 `buf.gen.yaml`：

```yaml
inputs:
  - directory: /path/to/proto/pim
  - module: buf.build/googleapis/googleapis
  - module: buf.build/grpc-ecosystem/grpc-gateway
```

### 插件配置

`plugins` 部分是固定的，但 `out` 路径可以通过配置文件自定义：

```yaml
plugins:
  - local: protoc-gen-es
    out: src/lib/api/generated # 可通过 outputDir 配置
    opt:
      - target=ts
      - import_extension=none
  - local: protoc-gen-connect-es
    out: src/lib/api/generated # 可通过 outputDir 配置
    opt:
      - target=ts
      - import_extension=none
```

## 安装

```bash
pnpm add -D @theplant/proto-to-ts
```

## 依赖说明

### 包含的依赖（devDependencies）

工具包含生成代码所需的依赖：

- `@bufbuild/buf` - Buf CLI 工具
- `@bufbuild/protoc-gen-es` - TypeScript 类型生成器
- `@connectrpc/protoc-gen-connect-es` - Connect-RPC 客户端生成器
- `inquirer` - 交互式 CLI

### 运行时依赖（自动检测和安装）

以下运行时依赖在首次运行时会被自动检测，如果缺失会询问是否安装：

- `@connectrpc/connect` - Connect-RPC 运行时
- `@connectrpc/connect-web` - Web 传输层
- `@bufbuild/protobuf` - Protobuf 运行时
- `@theplant/fetch-middleware` - Fetch 中间件（用于错误处理）

### 包管理器自动检测

工具会自动检测项目使用的包管理器：

- 检测 `pnpm-lock.yaml` → 使用 pnpm
- 检测 `yarn.lock` → 使用 yarn
- 检测 `package-lock.json` → 使用 npm
- 默认 → npm

## 使用方法

### 1. 安装

```bash
pnpm add -D @theplant/proto-to-ts
```

### 2. 创建配置文件

在项目根目录创建 `proto-to-ts.config.js`：

```javascript
export default {
  // 生成代码的输出目录
  outputDir: "src/lib/api/generated",

  // 服务包装器目录（可选）
  servicesDir: "src/lib/api/services",

  // 历史记录文件
  historyFile: ".proto-to-ts-history.json",

  // 历史记录数量
  maxHistory: 10,
};
```

### 3. 添加脚本

在 `package.json` 中添加：

```json
{
  "scripts": {
    "generate:api": "proto-to-ts"
  }
}
```

### 4. 首次运行（自动设置）

```bash
pnpm generate:api
```

首次运行时，工具会询问：

- ✅ **是否生成 Connect 客户端文件？** - 自动创建 `connect-client.ts` 和错误处理器
- ✅ **是否安装缺失的依赖？** - 自动检测包管理器（pnpm/yarn/npm）并安装

## 使用流程

### 首次使用

1. 运行命令后，工具会显示历史记录或提示输入 proto 路径
2. 选择或输入 proto 文件/目录的**绝对路径**
3. **首次设置询问**（仅当 connect-client.ts 不存在时）：
   - 是否生成 Connect 客户端文件？
   - 是否安装缺失的依赖？（自动检测使用 pnpm/yarn/npm）
4. 工具会自动：
   - 安装运行时依赖（如果选择）
   - 生成 `connect-client.ts`、`connect-error-handler.ts`（如果选择）
   - 扫描并列出所有 `.proto` 文件
   - 查找 `buf.yaml` 并提取依赖
   - 生成临时的 `buf.gen.yaml`
   - 运行 `buf generate` 生成代码
   - 应用 `json_name` 字段映射
   - 生成服务客户端包装器（如果启用）

### 后续使用

如果 connect-client.ts 已存在，直接进入代码生成流程，不再询问设置选项。

## 配置选项详解

```javascript
export default {
  // 必填：生成代码的输出目录
  outputDir: "src/lib/api/generated",

  // 可选：服务包装器目录
  // 如果设置，会为每个 proto service 生成一个客户端包装器
  servicesDir: "src/lib/api/services",

  // 可选：历史记录文件路径
  historyFile: ".proto-to-ts-history.json",

  // 可选：最多保存多少条历史记录
  maxHistory: 10,

  // 未来可能支持的选项：
  // bufGenTemplate: 'path/to/custom/buf.gen.yaml',
  // additionalModules: ['buf.build/some/module'],
};
```

## 生成的代码结构

假设你有以下 proto 结构：

```
proto/pim/
  ├── product/v1/
  │   ├── product.proto
  │   └── service.proto
  └── common/v1/
      └── error.proto
```

运行工具后会生成：

```
src/lib/api/
  ├── connect-client.ts              # Connect 传输层配置（首次生成）
  ├── handlers/                      # 错误处理器（首次生成）
  │   ├── connect-error-handler.ts
  │   └── utils.ts
  ├── generated/                     # TypeScript 类型和客户端
  │   └── pim/
  │       ├── product/v1/
  │       │   ├── product_pb.ts         # 消息类型
  │       │   └── service_connect.ts    # Connect 服务
  │       └── common/v1/
  │           └── error_pb.ts
  └── services/                      # 服务包装器（如果启用）
      ├── index.ts                   # 统一导出
      └── product.client.ts          # 服务包装器
```

### Connect 客户端配置

生成的 `connect-client.ts`：

```typescript
import type { Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import {
  createFetchClient,
  formatProtoErrorMiddleware,
} from "@theplant/fetch-middleware";
import { handleConnectError } from "./handlers/connect-error-handler";

// Create fetch client with middleware
export const connectFetchClient = createFetchClient({
  fetchInit: {
    credentials: "include",
    headers: {
      Accept: "application/json",
      "X-Ensure-Connect-Error": "true",
    },
  },
  middlewares: [formatProtoErrorMiddleware()],
});

// Error interceptor
const errorInterceptor: Interceptor = (next) => async (req) => {
  try {
    return await next(req);
  } catch (err) {
    handleConnectError(err);
    throw err;
  }
};

// Create transport
export const transport = createConnectTransport({
  baseUrl: import.meta.env.VITE_API_BASE_URL || "",
  fetch: connectFetchClient,
  interceptors: [errorInterceptor],
});
```

### 错误处理器

生成的 `handlers/connect-error-handler.ts`：

```typescript
import type { ConnectError } from "@connectrpc/connect";
import { parseConnectError } from "@theplant/fetch-middleware";

export function handleConnectError(err: unknown) {
  const parsed = parseConnectError(err as ConnectError);

  // Log for debugging
  if (import.meta.env?.DEV) {
    console.error("[Connect-RPC Error]", parsed);
  }

  return {
    code: parsed.code,
    message: parsed.localizedMessage || parsed.message,
    validationErrors: parsed.validationError?.fieldViolations || [],
  };
}
```

### 服务包装器

生成的 `product.client.ts`：

```typescript
import { createClient, type Client } from "@connectrpc/connect";
import { ProductService } from "../generated/pim/product/v1/service_connect";
import { transport } from "../connect-client";

export const productClient: Client<typeof ProductService> = createClient(
  ProductService,
  transport,
);
```

### 使用示例

```typescript
import { productClient } from "@/lib/api/services";
import { handleConnectError } from "@/lib/api/handlers/connect-error-handler";

try {
  const response = await productClient.listProducts({
    pageSize: 10,
    pageToken: "",
  });
} catch (err) {
  const error = handleConnectError(err);
  console.error(error.message);
}
```

## 与原脚本的对比

从 `qor5-ec-demo/frontend/scripts/generate-api-interactive.ts` 迁移的改进：

| 特性          | 原脚本           | @theplant/proto-to-ts |
| ------------- | ---------------- | --------------------- |
| 代码复用      | 每个项目复制脚本 | npm 包，统一维护      |
| buf.yaml 依赖 | 手动配置         | 自动提取              |
| 输出路径      | 硬编码           | 配置文件自定义        |
| 历史记录      | ✅               | ✅                    |
| 运行时依赖    | 可能混入         | 完全分离              |

## 编程式使用

除了 CLI，也可以在代码中使用：

```typescript
import {
  generateFromProto,
  runInteractiveCLI,
  isValidProtoPath,
  extractBufDependencies,
} from "@theplant/proto-to-ts";

// 交互式 CLI
await runInteractiveCLI({
  outputDir: "src/lib/api/generated",
  servicesDir: "src/lib/api/services",
});

// 编程式生成
const targetPath = "/path/to/proto/pim";
const validation = isValidProtoPath(targetPath);

if (validation.valid) {
  await generateFromProto({
    targetPath,
    validation,
    workingDir: process.cwd(),
    outputDir: "src/lib/api/generated",
    servicesDir: "src/lib/api/services",
  });
}

// 提取 buf 依赖
const deps = extractBufDependencies("/path/to/buf.yaml");
console.log(deps); // ['buf.build/googleapis/googleapis', ...]
```

## 常见问题

### Q: 如何禁用服务包装器生成？

A: 在配置文件中删除或注释掉 `servicesDir` 字段：

```javascript
export default {
  outputDir: "src/lib/api/generated",
  // servicesDir: 'src/lib/api/services', // 注释掉或删除
};
```

### Q: 历史记录存在哪里？

A: 默认存在项目根目录的 `.proto-to-ts-history.json`，可通过 `historyFile` 配置。

### Q: 可以自定义 buf.gen.yaml 模板吗？

A: 当前版本自动生成，未来版本可能支持自定义模板。

### Q: 支持 monorepo 吗？

A: 支持。在每个子包中独立配置和使用即可。

## 贡献

欢迎提交 Issue 和 Pull Request！

## License

MIT
