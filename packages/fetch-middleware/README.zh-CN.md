# Fetch Middleware

一个灵活且可组合的 `fetch` API 中间件系统，支持 REST 和 Connect-RPC。

## 特性

- 🎯 **中间件链**：组合多个中间件进行请求/响应处理
- 🔄 **原生 Response**：保持原始 Response 对象完整，仅添加属性
- ⚡ **类型安全**：完整的 TypeScript 支持，全泛型支持
- 🎨 **灵活**：易于自定义和扩展
- 🔌 **Connect-RPC 就绪**：内置对 Connect-RPC 和 Protobuf 错误的支持
- 🚀 **最小依赖**：轻量级实现

## 安装

### 从 GitHub Packages 安装

> 如果是第一次集成，请先创建个人的 github PAT(personal access token) 避免拉取权限报错，github 上的 package 是强制用户得用 PAT 拉取包。
>
> 1. [配置有权限读取 github package 的个人 PAT](https://github.com/theplant/qor5-fe-infra/wiki/Fixing-401-Unauthorized-Errors-When-Installing-Private-GitHub-Packages#-solution-1-authenticate-via-npm-login)
> 2. 找 @geckofu 确保你的 github 账号或者群组有访问该项目（[qor5-fe-infra](https://github.com/theplant/qor5-fe-infra)）和 [fetch-middleware](https://github.com/theplant/qor5-fe-infra/pkgs/npm/fetch-middleware)的权限

如果你已经搞定，请看下面的步骤, 在你的业务项目里执行以下命令

```bash
# 1. 安装
echo "@theplant:registry=https://npm.pkg.github.com" >> .npmrc
pnpm add @theplant/fetch-middleware
```

## 核心概念

### 中间件

中间件是一个拦截请求和响应的函数：

```typescript
import type { Middleware } from "@theplant/fetch-middleware";

const myMiddleware: Middleware = async (req, next, ctx) => {
  // 请求前
  console.log("Request:", req.url);

  // 调用下一个中间件
  const res = await next(req);

  // 响应后
  console.log("Response:", res.status);

  return res;
};
```

## 内置中间件

本库包含多个内置中间件。点击下方链接查看详细文档（英文）：

- **[Request Queue Middleware](./docs/request-queue.md)**：管理请求队列以处理认证刷新和自动重试。
- **[JSON Response Middleware](./docs/json-response.md)**：解析 JSON 响应并附加到 `_body` 属性。
- **[Extract Body Middleware](./docs/extract-body.md)**：从 Response 中提取 `_body` 并将其作为最终结果返回。
- **[HTTP Error Middleware](./docs/http-error.md)**：使用简单的回调处理 HTTP 错误。
- **[Format Proto Error Middleware](./docs/format-proto-error.md)**：处理 Protobuf 和 Connect 错误响应。
- **[Headers Middleware](./docs/headers.md)**：添加或修改请求头。

## 快速开始

### REST 客户端

```typescript
import {
  createFetchClient,
  jsonResponseMiddleware,
  extractBodyMiddleware,
  httpErrorMiddleware,
} from "@theplant/fetch-middleware";

// 创建 REST 客户端
const client = createFetchClient({
  baseUrl: "https://api.example.com",
  fetchInit: {
    credentials: "include",
  },
  middlewares: [
    extractBodyMiddleware(), // 提取 _body 作为最终结果
    jsonResponseMiddleware(), // 解析 JSON 并附加到 _body
    httpErrorMiddleware(), // 处理 HTTP 错误
  ],
});

// 使用客户端
const users = await client.get<User[]>("/users");
const user = await client.post<User>("/users", { name: "John" });
```

### Connect-RPC 客户端

```typescript
import {
  createFetchClient,
  formatProtoErrorMiddleware,
  parseConnectError,
} from "@theplant/fetch-middleware";
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";

// 为 Connect-RPC 创建 fetch 客户端
const fetchClient = createFetchClient({
  middlewares: [formatProtoErrorMiddleware()],
});

// 创建 Connect transport
const transport = createConnectTransport({
  baseUrl: "http://localhost:8787",
  fetch: fetchClient,
});

// 创建 RPC 客户端
const client = createClient(YourService, transport);
```

## 错误处理

### parseConnectError

将 ConnectError 解析为结构化错误信息。适用于 Proto (ProTTP) 和 JSON (Connect) 错误：

```typescript
import { parseConnectError } from "@theplant/fetch-middleware";

try {
  await client.login(credentials);
} catch (err) {
  const parsed = parseConnectError(err);
  console.log(parsed.code);
  console.log(parsed.message);
}
```

### 类型化错误类

该库为常见的 HTTP 错误提供类型化错误类：

```typescript
import { UnauthorizedError, ValidationError } from "@theplant/fetch-middleware";

try {
  await fetchData();
} catch (err) {
  if (err instanceof UnauthorizedError) {
    // 处理 401 错误
  } else if (err instanceof ValidationError) {
    // 处理 422 验证错误
    console.log(err.errors.fieldErrors);
  }
}
```

## 高级用法

### 创建自定义中间件

```typescript
import type { Middleware } from "@theplant/fetch-middleware";

const loggingMiddleware = (): Middleware => {
  return async (req, next, ctx) => {
    const start = Date.now();
    console.log(`→ ${req.method} ${req.url}`);
    try {
      const res = await next(req);
      console.log(`← ${res.status} ${req.url} (${Date.now() - start}ms)`);
      return res;
    } catch (error) {
      console.error(`✗ ${req.url}`, error);
      throw error;
    }
  };
};
```

### 中间件顺序很重要

中间件按顺序执行。响应以相反的顺序流动。

```typescript
middlewares: [
  loggingMiddleware(), // 1. 记录请求
  authMiddleware(getToken), // 2. 添加认证头
  extractBodyMiddleware(), // 3. 提取 body（仅 REST）
  jsonResponseMiddleware(), // 4. 解析 JSON
  httpErrorMiddleware({}), // 5. 处理错误
];
```

## 设计原则

### 保持 Response 原生

所有中间件都应保留原生 `Response` 对象。

### 双模式支持

`createFetchClient` 函数返回一个混合体，可同时作为 Fetch 处理器（用于库）和 REST 客户端。

## 许可证

ISC
