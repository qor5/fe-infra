# @theplant/proto-to-ts

交互式的 Protobuf 到 TypeScript 代码生成工具，支持 Connect-RPC。

## 特性

- 🎯 **交互式选择** - 通过友好的 CLI 界面选择 proto 文件或目录
- 📚 **历史记录** - 自动保存最近使用的路径，快速重新生成
- 🔄 **自动化流程** - 自动生成 TypeScript 类型、Connect-RPC 客户端和服务包装器
- 🎨 **模板化配置** - 自动从 `buf.yaml` 提取依赖生成 `buf.gen.yaml`
- 🔍 **JSON Name 支持** - 自动应用 protobuf 的 `json_name` 映射
- 📦 **服务包装器** - 可选的 Connect-RPC 服务客户端包装器生成
- 🏷️ **类型命名空间** - 自动聚合类型，支持 IDE 自动补全

## 安装

### 从 GitHub Packages 安装

> 如果是第一次集成，请先创建个人的 github PAT (personal access token) 避免拉取权限报错，github 上的 package 是强制用户得用 PAT 拉取包。
>
> 1. [配置有权限读取 github package 的个人 PAT](https://github.com/theplant/qor5-fe-infra/wiki/Fixing-401-Unauthorized-Errors-When-Installing-Private-GitHub-Packages#-solution-1-authenticate-via-npm-login)

如果你已经搞定，请看下面的步骤, 在你的业务项目里执行以下命令：

```bash
# 1. 安装
echo "@theplant:registry=https://npm.pkg.github.com" >> .npmrc
pnpm add -D @theplant/proto-to-ts
```

## 使用

### 基本用法

在项目根目录运行交互式 CLI：

```bash
npx proto-to-ts
```

或者在 `package.json` 中添加脚本：

```json
{
  "scripts": {
    "generate:api": "proto-to-ts"
  }
}
```

### 配置（可选）

工具内置了合理的默认配置。如果你需要自定义输出目录或其他选项，可以在项目根目录创建 `proto-to-ts.config.js`。

你可以通过命令快速生成配置文件：

```bash
npx proto-to-ts --init
```

或者手动创建：

```javascript
export default {
  // 生成代码的输出目录（默认：src/lib/api/generated）
  outputDir: "src/lib/api/generated",

  // 可选：服务包装器目录
  // 如果设置，会为每个 proto service 生成一个客户端包装器
  // 设置为 undefined 或删除以禁用服务包装器生成
  // （默认：src/lib/api/services）
  servicesDir: "src/lib/api/services",

  // 历史记录文件路径（相对于项目根目录）（默认：.proto-to-ts-history.json）
  historyFile: ".proto-to-ts-history.json",

  // 保存的历史记录最大数量（默认：10）
  maxHistory: 10,

  // 排除服务，不生成客户端
  // 默认值: ["AdminService"] - 排除所有服务名包含 "AdminService" 的服务
  // 匹配 proto 中定义的服务名，如: service UserAdminService { ... }
  // 设置为 [] (空数组) 可禁用默认排除，生成所有服务
  // excludeServicePatterns: ['AdminService'], // 默认值，可省略
};
```

### 工作流程

1. 运行 `proto-to-ts` 命令。
2. 从历史记录中选择或输入新的 proto 文件/目录的**绝对路径**。
3. 工具会自动：
   - 查找 `buf.yaml` 并提取依赖。
   - 生成临时的 `buf.gen.yaml` 配置。
   - 运行 `buf generate` 生成 TypeScript 代码。
   - 应用 `json_name` 映射。
   - 生成服务客户端包装器（如果配置了）。
   - 生成类型聚合文件，支持 IDE 自动补全。

## 生成的内容

### 目录结构

```
src/lib/api/rpc-service/
  pim/                      # 模块名
    generated/              # Protobuf 生成的文件
    services/               # 服务客户端包装器
      index.ts
      product.client.ts
    types/                  # 聚合的类型，支持 IDE 自动补全
      index.ts
  connect-client.ts         # 共享的 transport 配置
  index.ts                  # 模块导出
```

### Transport 初始化

生成的 `connect-client.ts` 使用延迟初始化模式。在使用任何服务客户端之前，必须调用 `initializeTransport()`：

```typescript
// src/lib/api/index.ts
import { createFetchClient } from "@theplant/fetch-middleware";
import { initializeTransport } from "./rpc-service/connect-client";

// 使用自定义的 fetch 配置初始化 transport
initializeTransport({
  baseUrl: import.meta.env.VITE_API_BASE_URL || "",
  fetch: createFetchClient({
    fetchInit: {
      credentials: "include",
      headers: {
        Accept: "application/json",
        "X-Ensure-Connect-Error": "true",
      },
    },
    middlewares: [
      // 添加你的中间件
      // 例如：errorMiddleware, sessionMiddleware 等
    ],
  }),
});

// 导出所有 RPC 服务客户端
export * from "./rpc-service";
```

### 使用服务客户端

```typescript
import { pimService } from '@/lib/api'

// 调用服务方法
const response = await pimService.productClient.listProducts({
  filter: { ... },
  pagination: { first: 20 },
})
```

### 使用类型（支持 IDE 自动补全）

所有 protobuf 类型都聚合在 `types` 命名空间中，支持完整的 IDE 自动补全：

```typescript
import { pimService } from "@/lib/api";

// ✅ IDE 自动补全生效：pimService.types.ProductFilter, pimService.types.Product 等
const filter: pimService.types.ProductFilter = {
  priceInclTax: { gte: 100, lte: 500 },
};

// 与服务方法一起使用
const response = await pimService.productClient.listProducts({ filter });

// 访问响应类型
const products: pimService.types.Product[] = response.edges.map((e) => e.node);
```

### TypeScript 类型和客户端

工具使用以下插件生成代码：

- `@bufbuild/protoc-gen-es` - 生成 TypeScript 消息类型。
- `@connectrpc/protoc-gen-connect-es` - 生成 Connect-RPC 服务客户端。

### 服务包装器

如果配置了 `servicesDir`，工具会为每个服务生成包装器客户端：

```typescript
// 示例：product.client.ts
import { createClient, type Client } from "@connectrpc/connect";
import { ProductService } from "../generated/pim/product/v1/service_pb";
import { transport } from "../../connect-client";

export const productClient: Client<typeof ProductService> = createClient(
  ProductService,
  transport,
);
```

以及包含类型命名空间的索引文件：

```typescript
// services/index.ts
export { productClient, type ProductClient } from "./product.client";

// 导出类型命名空间，支持 IDE 自动补全
export * as types from "../types";
```

## API

你也可以通过编程方式使用此工具：

```typescript
import { runInteractiveCLI, generateFromProto } from '@theplant/proto-to-ts';

// 运行交互式 CLI
await runInteractiveCLI({
  outputDir: 'src/lib/api/generated',
  servicesDir: 'src/lib/api/services',
});

// 直接生成（非交互式）
await generateFromProto({
  targetPath: '/path/to/proto',
  validation: { valid: true, type: 'directory', files: [...] },
  workingDir: process.cwd(),
  outputDir: 'src/lib/api/generated',
});
```

## 许可证

MIT
