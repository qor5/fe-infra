# @theplant/proto-to-ts

交互式的 Protobuf 到 TypeScript 代码生成工具，支持 Connect-RPC。

## 特性

- 🎯 **交互式选择** - 通过友好的 CLI 界面选择 proto 文件或目录
- 📚 **历史记录** - 自动保存最近使用的路径，快速重新生成
- 🔄 **自动化流程** - 自动生成 TypeScript 类型、Connect-RPC 客户端和服务包装器
- 🎨 **模板化配置** - 自动从 buf.yaml 提取依赖生成 buf.gen.yaml
- 🔍 **json_name 支持** - 自动应用 protobuf 的 json_name 映射
- 📦 **服务包装器** - 可选的 Connect-RPC 服务客户端包装器生成

## 安装

```bash
pnpm add -D @theplant/proto-to-ts
```

## 依赖

此工具需要以下依赖作为 peer dependencies（通常已在项目中安装）：

```json
{
  "@bufbuild/buf": "^1.59.0",
  "@bufbuild/protoc-gen-es": "^2.9.0",
  "@connectrpc/protoc-gen-connect-es": "^1.7.0"
}
```

注意：**不会**带走运行时依赖（如 `@connectrpc/connect`、`@bufbuild/protobuf` 等），这些需要在你的项目中单独安装。

## 使用

### 基本用法

```bash
# 在项目根目录运行
npx proto-to-ts
```

或在 package.json 中添加脚本：

```json
{
  "scripts": {
    "generate:api": "proto-to-ts"
  }
}
```

### 配置

在项目根目录创建 `proto-to-ts.config.js`：

```javascript
export default {
  // 生成代码的输出目录
  outputDir: "src/lib/api/generated",

  // 服务包装器目录（可选）
  // 设置为 undefined 或删除以禁用服务包装器生成
  servicesDir: "src/lib/api/services",

  // 历史记录文件路径（相对于项目根目录）
  historyFile: ".proto-to-ts-history.json",

  // 保存的历史记录最大数量
  maxHistory: 10,
};
```

### 工作流程

1. 运行 `proto-to-ts` 命令
2. 从历史记录中选择或输入新的 proto 文件/目录路径
3. 工具会自动：
   - 查找 `buf.yaml` 并提取依赖
   - 生成临时的 `buf.gen.yaml` 配置
   - 运行 `buf generate` 生成 TypeScript 代码
   - 应用 `json_name` 映射
   - 生成服务客户端包装器（如果配置了）

## 生成的内容

### TypeScript 类型和客户端

工具使用以下插件生成代码：

- `@bufbuild/protoc-gen-es` - 生成 TypeScript 消息类型
- `@connectrpc/protoc-gen-connect-es` - 生成 Connect-RPC 服务客户端

### 服务包装器（可选）

如果配置了 `servicesDir`，工具会为每个服务生成包装器客户端：

```typescript
// 示例：product.client.ts
import { createClient, type Client } from "@connectrpc/connect";
import { ProductService } from "../generated/pim/product/v1/service_connect";
import { transport } from "../connect-client";

export const productClient: Client<typeof ProductService> = createClient(
  ProductService,
  transport,
);
```

以及索引文件：

```typescript
// services/index.ts
export { productClient } from "./product.client";
export { userClient } from "./user.client";
```

## buf.gen.yaml 模板

工具会自动生成 `buf.gen.yaml`，包含：

1. **inputs** - 从 proto 目录路径和 buf.yaml 的依赖自动提取
2. **plugins** - 固定使用 `protoc-gen-es` 和 `protoc-gen-connect-es`
3. **managed mode** - 自动禁用外部模块的管理

示例生成的 `buf.gen.yaml`：

```yaml
version: v2

managed:
  enabled: true
  disable:
    - module: buf.build/googleapis/googleapis
    - module: buf.build/grpc-ecosystem/grpc-gateway

inputs:
  - directory: /path/to/proto/pim
  - module: buf.build/googleapis/googleapis
  - module: buf.build/grpc-ecosystem/grpc-gateway

plugins:
  - local: protoc-gen-es
    out: src/lib/api/generated
    opt:
      - target=ts
      - import_extension=none
  - local: protoc-gen-connect-es
    out: src/lib/api/generated
    opt:
      - target=ts
      - import_extension=none
```

## API

可以编程方式使用：

```typescript
import { runInteractiveCLI, generateFromProto } from '@theplant/proto-to-ts'

// 运行交互式 CLI
await runInteractiveCLI({
  outputDir: 'src/lib/api/generated',
  servicesDir: 'src/lib/api/services',
})

// 直接生成（非交互式）
await generateFromProto({
  targetPath: '/path/to/proto',
  validation: { valid: true, type: 'directory', files: [...] },
  workingDir: process.cwd(),
  outputDir: 'src/lib/api/generated',
})
```

## 目录结构

```
your-project/
├── proto-to-ts.config.js       # 配置文件
├── .proto-to-ts-history.json   # 历史记录（自动生成）
├── src/
│   └── lib/
│       └── api/
│           ├── generated/       # 生成的 TS 代码
│           │   ├── *_pb.ts      # 消息类型
│           │   └── *_connect.ts # Connect 客户端
│           ├── services/        # 服务包装器（可选）
│           │   ├── index.ts
│           │   └── *.client.ts
│           └── connect-client.ts # 你的 transport 配置
```

## 与原脚本的区别

这个包从 `qor5-ec-demo/frontend/scripts/generate-api-interactive.ts` 抽离而来，主要改进：

1. ✅ 独立的 npm 包，可在多个项目中复用
2. ✅ 自动从 proto 目录的 buf.yaml 提取依赖
3. ✅ 通过配置文件自定义输出路径
4. ✅ 支持历史记录保存
5. ✅ 只包含代码生成依赖，不带走运行时依赖

## License

MIT
