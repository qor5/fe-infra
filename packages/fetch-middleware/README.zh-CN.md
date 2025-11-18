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

```bash
# 配置 npm 使用 GitHub Packages（一次性设置）
echo "@qor5:registry=https://npm.pkg.github.com" >> .npmrc

# 安装包
pnpm add @qor5/fetch-middleware
```

### 从 npm 安装（如果已发布）

```bash
pnpm add @qor5/fetch-middleware
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

### 快速开始

#### REST 客户端

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

#### Connect-RPC 客户端

```typescript
import {
  createFetchClient,
  formatProtoErrorMiddleware,
  parseConnectError,
} from "@theplant/fetch-middleware";
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";

// 使用二进制格式（protobuf）而不是 JSON
const useBinaryFormat = false;

// 为 Connect-RPC 创建 fetch 客户端
const fetchClient = createFetchClient({
  fetchInit: {
    credentials: "include",
    headers: {
      Accept: useBinaryFormat ? "application/proto" : "application/json",
      // 确保服务器返回带有 Details 的 Connect 标准错误格式
      "X-Ensure-Connect-Error": "true",
    },
  },
  middlewares: [formatProtoErrorMiddleware()],
});

// 使用 fetch 客户端创建 Connect transport
const transport = createConnectTransport({
  baseUrl: "http://localhost:8787",
  useBinaryFormat,
  fetch: fetchClient, // 作为 fetch 处理器传递
});

// 创建 RPC 客户端
const client = createClient(YourService, transport);

// 处理错误
try {
  await client.login(credentials);
} catch (err) {
  const parsed = parseConnectError(err);
  console.log(parsed.code); // Connect 错误代码
  console.log(parsed.validationError); // ValidationError 详情
}
```

## 内置中间件

### jsonResponseMiddleware

解析 JSON 响应并附加到 `_body` 属性：

```typescript
import { jsonResponseMiddleware } from "@theplant/fetch-middleware";

const middleware = jsonResponseMiddleware();

// Response 将具有 _body 属性，包含解析的 JSON
const res = await fetch("/api/data");
console.log(res._body); // 解析的 JSON 数据
```

### extractBodyMiddleware

从 Response 中提取 `_body` 并将其作为最终结果返回。用于 REST 客户端：

```typescript
import {
  createFetchClient,
  jsonResponseMiddleware,
  extractBodyMiddleware,
} from "@theplant/fetch-middleware";

const client = createFetchClient({
  baseUrl: "https://api.example.com",
  middlewares: [
    extractBodyMiddleware(), // 提取 _body 作为最终结果
    jsonResponseMiddleware(), // 解析 JSON 并附加到 _body
  ],
});

// 直接返回解析的数据（而不是 Response 对象）
const data = await client.get("/users");
console.log(data); // { users: [...] }
```

### formatProtoErrorMiddleware

处理 Protobuf（ProTTP）和 JSON（Connect）错误响应。对于 Proto 错误，它解析 protobuf ValidationError 并抛出类型化错误。对于 JSON 错误，它让 connect-es 处理错误解析：

```typescript
import { formatProtoErrorMiddleware } from "@theplant/fetch-middleware";

const middleware = formatProtoErrorMiddleware();

// 自动抛出类型化错误：
// - UnauthorizedError (401)
// - AuthenticationError (403)
// - NotFoundError (404)
// - ValidationError (422)
// - ServiceError (500+)
// - AppError (其他错误)
```

### httpErrorMiddleware

使用简单的回调处理 HTTP 错误。中间件根据 content-type 自动解析错误响应体：

```typescript
import { httpErrorMiddleware } from "@theplant/fetch-middleware";
import { toast } from "./toast";

const middleware = httpErrorMiddleware({
  // 跳过错误处理的 URL
  silentUrls: ["/api/refresh"],

  // 错误处理器接收 status、body（自动解析）和 response
  // 注意：如果请求被中止，处理器会自动跳过
  onError: async ({ status, body }) => {
    // body 自动解析：
    // - JSON 响应 → 解析的对象
    // - 文本响应 → 字符串
    // - 其他类型 → undefined
    const message = body?.message || body?.error || "";

    switch (status) {
      case 401:
      case 419:
      case 440:
        // 认证错误
        window.location.href = "/login";
        toast.error("请登录");
        break;

      case 500:
      case 502:
      case 503:
        // 服务器错误
        toast.error(message || "服务器错误");
        break;

      default:
        // 其他错误
        if (status >= 400) {
          toast.error(message || `错误 ${status}`);
        }
    }
  },

  // 处理后是否抛出错误（默认：true）
  throwError: true,
});
```

### headersMiddleware

添加或修改请求头：

```typescript
import { headersMiddleware } from "@theplant/fetch-middleware";

const middleware = headersMiddleware((headers) => {
  headers.set("Authorization", "Bearer token");
  headers.set("X-Custom-Header", "value");
});
```

### requestQueueMiddleware

管理请求队列以处理认证刷新和自动重试。支持单个或多个队列配置，具有**独立队列**。每个配置维护自己的队列状态以避免冲突。

当响应匹配触发条件时（例如 401 未授权），此中间件：

1. 取消所有匹配**相同配置**的其他待处理请求
2. 将它们添加到**该配置的独立队列**，同时保持其 promise 处于待处理状态
3. 调用配置的 `next()` 回调（例如刷新会话）
4. 如果 `next()` resolve：重试**此配置队列**中的所有请求
5. 如果 `next()` reject：拒绝**此配置队列**中的所有请求并返回错误

**重要**：具有重叠 matchRule 的多个配置不会相互干扰。每个配置独立处理其自己的队列。

**基本用法（单个配置）：**

```typescript
import { requestQueueMiddleware } from "@theplant/fetch-middleware";

const middleware = requestQueueMiddleware({
  // 确定响应是否应触发队列管理
  queueTrigger: ({ response, request, ctx }) => {
    return response.status === 401;
  },
  // 处理触发的回调（例如刷新会话）
  // resolve = 重试所有排队的请求
  // reject = 拒绝所有排队的请求
  next: async () => {
    await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
  },
});
```

**多个配置（数组）：**

```typescript
const middleware = requestQueueMiddleware([
  // 处理 401 - 会话过期
  {
    queueTrigger: ({ response }) => response.status === 401,
    next: async () => {
      await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
    },
  },
  // 处理带特定代码的 403 - 权限过期
  {
    queueTrigger: async ({ response }) => {
      if (response.status === 403) {
        try {
          const body = await response.clone().json();
          return body.code === "PERMISSION_EXPIRED";
        } catch {
          return false;
        }
      }
      return false;
    },
    next: async () => {
      await fetch("/api/permissions/refresh", {
        method: "POST",
        credentials: "include",
      });
    },
  },
]);

// 安全：即使请求匹配两个配置
fetchClient.get("/api/admin", {
  meta: { needAuth: true, needPermission: true },
});
// - 如果返回 401，仅配置 1 触发，仅使用其队列
// - 如果返回 403，仅配置 2 触发，仅使用其队列
// - 每个配置独立处理，无干扰
```

**使用元数据过滤（matchRule）：**

```typescript
const middleware = requestQueueMiddleware({
  // 仅管理带有 needAuth: true 的请求
  matchRule: ({ meta }) => meta?.needAuth === true,
  queueTrigger: ({ response }) => response.status === 401,
  next: async () => {
    await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
  },
});

// 在 API 调用中使用
const fetchClient = createFetchClient({
  middlewares: [extractBodyMiddleware(), jsonResponseMiddleware(), middleware],
});

// 此请求将由队列管理（needAuth: true）
const user = await fetchClient.get("/api/user", {
  meta: { needAuth: true },
});

// 此请求不会由队列管理（无 needAuth）
const publicData = await fetchClient.get("/api/public");

// 此请求不会由队列管理（needAuth: false）
const config = await fetchClient.get("/api/config", {
  meta: { needAuth: false },
});
```

**使用 URL 模式的高级过滤：**

```typescript
const middleware = requestQueueMiddleware({
  // 仅管理到 /api/user/* 端点的经过身份验证的请求
  matchRule: ({ request, meta }) => {
    return request.url.includes("/api/user") && meta?.needAuth === true;
  },
  queueTrigger: ({ response }) => response.status === 401,
  next: async () => {
    await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
  },
});

// 多个条件
const middleware2 = requestQueueMiddleware({
  matchRule: ({ request, meta, ctx }) => {
    // 按 URL 模式匹配
    const isApiEndpoint = request.url.startsWith("/api/");
    // 按元数据匹配
    const requiresAuth = meta?.needAuth === true;
    // 按方法匹配
    const isModifying = ["POST", "PUT", "PATCH", "DELETE"].includes(
      request.method,
    );
    // 组合条件
    return isApiEndpoint && requiresAuth && !ctx.signal.aborted;
  },
  queueTrigger: ({ response }) => response.status === 401,
  next: async () => {
    await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
  },
});
```

**使用自定义触发逻辑的高级用法：**

```typescript
const middleware = requestQueueMiddleware({
  queueTrigger: async ({ response, request }) => {
    // 检查状态码
    if (response.status === 401) {
      return true;
    }
    // 检查响应体
    if (response.status === 403) {
      try {
        const body = await response.clone().json();
        return body.code === "SESSION_EXPIRED";
      } catch {
        return false;
      }
    }
    return false;
  },
  next: async () => {
    const refreshResponse = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
    if (!refreshResponse.ok) {
      throw new Error("刷新会话失败");
    }
  },
});
```

**执行流程示例（并发请求）：**

```
场景：4 个并发请求，2 个独立的队列配置

T0：同时发起请求 A、B、C、D
    |
    ├─ A: 发送中... (needAuth + needPermission)
    ├─ B: 发送中... (needAuth)
    ├─ C: 发送中... (needPermission)
    └─ D: 发送中... (无元数据)

T1：请求 A 首先返回 401
    |
    ├─ 检测到 401，触发 configState0（认证配置）
    ├─ configState0.isRefreshing = true
    ├─ 取消请求 B（仍在待处理中，匹配 configState0）
    ├─ 将 A、B 添加到 configState0.requestQueue
    └─ 调用 refreshSession() ← 对所有匹配的请求仅调用一次！

T2：触发请求 B 的取消回调
    |
    └─ 收到 AbortError
       └─ 检查 isAnyRefreshing → configState0.isRefreshing = true
          └─ 不拒绝，B 已在队列中等待重试

T3：refreshSession() 成功完成
    |
    └─ processQueue(configState0, true) ← 处理所有排队的请求
       |
       ├─ 重试请求 A（使用原始参数）
       ├─ 请求 A 返回 200 → resolve A 的 promise ✅
       ├─ 重试请求 B（使用原始参数）
       └─ 请求 B 返回 200 → resolve B 的 promise ✅

T4：请求 C 返回 403
    |
    ├─ 检测到 403，触发 configState1（权限配置）
    ├─ configState1.isRefreshing = true
    ├─ 将 C 添加到 configState1.requestQueue
    └─ 调用 refreshPermissions() ← 独立，仅调用一次！

T5：refreshPermissions() 成功完成
    |
    └─ processQueue(configState1, true)
       |
       ├─ 重试请求 C
       └─ 请求 C 返回 200 → resolve C 的 promise ✅

最终结果：
- refreshSession() 调用：1 次（A 和 B 共享）
- refreshPermissions() 调用：1 次（仅用于 C）
- 请求 A：✅ 触发 401 → 排队 → 等待 refreshSession → 重试
- 请求 B：✅ 取消 → 排队 → 等待 refreshSession → 重试
- 请求 C：✅ 触发 403 → 排队 → 等待 refreshPermissions → 重试
- 请求 D：✅ 直接完成（无队列管理）
```

**主要功能：**

- 基于响应、请求、上下文或元数据的通用触发条件
- 支持单个或多个队列配置
- **请求元数据过滤**：使用 `matchRule` 控制哪些请求由队列管理
- **自定义元数据**：在请求选项中传递 `meta` 以标记请求（例如 `needAuth`、`skipQueue`）
- **共享刷新**：匹配相同配置的多个请求共享一个刷新回调
- 自动取消待处理请求
- Promise 队列在刷新期间保持原始 promise 待处理
- 成功刷新后使用原始参数自动重试
- 类型安全，完整的 TypeScript 支持

## 错误处理

### parseConnectError

将 ConnectError 解析为结构化错误信息。适用于 Proto（ProTTP）和 JSON（Connect）错误：

```typescript
import { parseConnectError } from "@theplant/fetch-middleware";

try {
  await client.login(credentials);
} catch (err) {
  const parsed = parseConnectError(err);

  // 访问结构化错误信息
  console.log(parsed.code); // Connect 错误代码（例如 "invalid_argument"）
  console.log(parsed.message); // 错误消息
  console.log(parsed.rawMessage); // 原始错误消息
  console.log(parsed.localizedMessage); // 本地化消息（如果可用）
  console.log(parsed.errorInfo); // ErrorInfo 详情
  console.log(parsed.badRequest); // BadRequest 详情
  console.log(parsed.validationError); // ValidationError 及字段错误
  console.log(parsed.cause); // 原始错误原因
}
```

### 类型化错误类

该库为常见的 HTTP 错误提供类型化错误类：

```typescript
import {
  UnauthorizedError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
  ServiceError,
  AppError,
} from "@theplant/fetch-middleware";

try {
  await fetchData();
} catch (err) {
  if (err instanceof UnauthorizedError) {
    // 处理 401 错误
    console.log(err.errors); // ValidationError 及详情
  } else if (err instanceof ValidationError) {
    // 处理 422 验证错误
    console.log(err.errors.fieldErrors); // 字段特定错误
  }
}
```

## 高级用法

### 组合中间件

```typescript
import {
  createFetchClient,
  jsonResponseMiddleware,
  extractBodyMiddleware,
  httpErrorMiddleware,
  headersMiddleware,
} from "@theplant/fetch-middleware";

const client = createFetchClient({
  baseUrl: "https://api.example.com",
  fetchInit: {
    credentials: "include",
  },
  middlewares: [
    // 添加请求头
    headersMiddleware((headers) => {
      headers.set("Accept", "application/json");
    }),

    // 提取 body（用于 REST API）
    extractBodyMiddleware(),

    // 解析 JSON
    jsonResponseMiddleware(),

    // 使用 toast 处理错误
    httpErrorMiddleware({
      onError: ({ status, body }) => {
        toast.error(body?.message || `错误 ${status}`);
      },
    }),
  ],
});
```

### 创建自定义中间件

```typescript
import type { Middleware } from "@theplant/fetch-middleware";

// 日志中间件
const loggingMiddleware = (): Middleware => {
  return async (req, next, ctx) => {
    const start = Date.now();
    console.log(`→ ${req.method} ${req.url}`);

    try {
      const res = await next(req);
      const duration = Date.now() - start;
      console.log(`← ${res.status} ${req.url} (${duration}ms)`);
      return res;
    } catch (error) {
      const duration = Date.now() - start;
      console.error(`✗ ${req.url} (${duration}ms)`, error);
      throw error;
    }
  };
};

// 认证中间件
const authMiddleware = (getToken: () => string): Middleware => {
  return async (req, next) => {
    const headers = new Headers(req.headers);
    headers.set("Authorization", `Bearer ${getToken()}`);
    return next({ ...req, headers });
  };
};

// 重试中间件
const retryMiddleware = (maxRetries = 3): Middleware => {
  return async (req, next) => {
    let lastError;
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await next(req);
      } catch (error) {
        lastError = error;
        if (i < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
    }
    throw lastError;
  };
};
```

### 中间件顺序很重要

中间件按顺序执行：

```typescript
middlewares: [
  loggingMiddleware(), // 1. 记录请求
  authMiddleware(getToken), // 2. 添加认证头
  extractBodyMiddleware(), // 3. 提取 body（仅 REST）
  jsonResponseMiddleware(), // 4. 解析 JSON
  httpErrorMiddleware({}), // 5. 处理错误
];
```

响应以相反的顺序流动：

1. `httpErrorMiddleware` 首先处理错误
2. `jsonResponseMiddleware` 解析 JSON
3. `extractBodyMiddleware` 提取 body
4. `authMiddleware` 接收结果
5. `loggingMiddleware` 记录响应

## 设计原则

### 保持 Response 原生

所有中间件都应保留原生 `Response` 对象：

```typescript
// ✅ 好：向 Response 添加属性
const middleware: Middleware = async (req, next) => {
  const res = await next(req);
  (res as any)._body = await res.clone().json();
  return res; // 仍然是原生 Response
};

// ❌ 坏：返回新对象
const middleware: Middleware = async (req, next) => {
  const res = await next(req);
  return { data: await res.json() }; // 丢失了原生 Response！
};
```

### 双模式支持

`createFetchClient` 函数返回一个混合体，可同时作为：

1. **Fetch 处理器**：可以传递给 connect-es 等库
2. **REST 客户端**：提供便捷方法（get、post 等）

```typescript
const client = createFetchClient({ middlewares: [...] });

// 作为 fetch 处理器（用于 connect-es）
const transport = createConnectTransport({ fetch: client });

// 作为 REST 客户端
const data = await client.get('/api/users');
```

### 错误信息

`httpErrorMiddleware` 提供基本错误信息：

```typescript
interface HttpErrorInfo {
  status: number; // HTTP 状态码（200、401、404、500 等）
  statusText: string; // HTTP 状态文本
  url: string; // 请求 URL
  body?: any; // 自动解析的响应体（JSON 对象、文本字符串或 undefined）
  response: Response; // 原生 Response 对象
  signal: AbortSignal; // 中止信号（用于高级用途）
}
```

**响应体解析：**

- 中间件根据 `content-type` 自动解析错误响应：
  - `application/json` → 解析为对象
  - `text/*` → 作为字符串返回
  - 其他类型 → `undefined`
- 使用 `response.clone()` 以避免消耗原始 body

**使用说明：**

- 使用 switch/case 根据 `status` 处理不同的 HTTP 状态码
- 如果请求被中止，错误处理器会自动跳过
- 中间件是独立的，不需要其他中间件

## 完整示例

### 带错误处理的 REST API 客户端

```typescript
import {
  createFetchClient,
  jsonResponseMiddleware,
  extractBodyMiddleware,
  httpErrorMiddleware,
  headersMiddleware,
} from "@theplant/fetch-middleware";
import { toast } from "@/lib/toast";

const apiClient = createFetchClient({
  baseUrl: "https://api.example.com",
  fetchInit: {
    credentials: "include",
  },
  middlewares: [
    // 添加请求头
    headersMiddleware((headers) => {
      headers.set("Accept", "application/json");
      const token = localStorage.getItem("token");
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    }),

    // 提取 body 作为最终结果
    extractBodyMiddleware(),

    // 解析 JSON 响应
    jsonResponseMiddleware(),

    // 处理 HTTP 错误
    httpErrorMiddleware({
      onError: async ({ status, body }) => {
        const message = body?.message || `错误 ${status}`;

        if (status === 401) {
          toast.error("请登录");
          window.location.href = "/login";
        } else if (status >= 500) {
          toast.error("服务器错误，请稍后重试。");
        } else {
          toast.error(message);
        }
      },
    }),
  ],
});

// 使用
interface User {
  id: string;
  name: string;
  email: string;
}

const users = await apiClient.get<User[]>("/users");
const user = await apiClient.post<User>("/users", {
  name: "John Doe",
  email: "john@example.com",
});
```

### 带拦截器的 Connect-RPC 客户端

```typescript
import {
  createFetchClient,
  formatProtoErrorMiddleware,
  parseConnectError,
} from "@theplant/fetch-middleware";
import { createClient, type Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { AuthService } from "./proto/auth_pb";
import { toast } from "@/lib/toast";

// 使用二进制格式（protobuf）而不是 JSON
const useBinaryFormat = false;

// 使用 Proto 错误处理创建 fetch 客户端
const fetchClient = createFetchClient({
  fetchInit: {
    credentials: "include",
    headers: {
      Accept: useBinaryFormat ? "application/proto" : "application/json",
      // 确保服务器返回带有 Details 的 Connect 标准错误格式
      "X-Ensure-Connect-Error": "true",
    },
  },
  middlewares: [formatProtoErrorMiddleware()],
});

// 创建错误拦截器
const errorInterceptor: Interceptor = (next) => async (req) => {
  try {
    return await next(req);
  } catch (err) {
    const parsed = parseConnectError(err);

    // 记录错误详情
    console.error("[RPC Error]", {
      code: parsed.code,
      message: parsed.message,
      validationError: parsed.validationError,
    });

    // 显示用户友好的错误
    if (parsed.validationError?.fieldErrors?.length) {
      const firstError = parsed.validationError.fieldErrors[0];
      toast.error(`${firstError.field}: ${firstError.description}`);
    } else if (parsed.localizedMessage) {
      toast.error(parsed.localizedMessage);
    } else {
      toast.error(parsed.message);
    }

    throw err;
  }
};

// 创建 Connect transport
const transport = createConnectTransport({
  baseUrl: "http://localhost:8787",
  useBinaryFormat,
  fetch: fetchClient,
  interceptors: [errorInterceptor],
});

// 创建 RPC 客户端
const authClient = createClient(AuthService, transport);

// 使用
try {
  const response = await authClient.login({
    email: "user@example.com",
    password: "password123",
  });
  console.log("登录成功：", response);
} catch (err) {
  // 错误已由拦截器处理
  console.error("登录失败");
}
```

## TypeScript 支持

所有函数都是完全类型化的：

```typescript
import type {
  Middleware,
  HttpErrorInfo,
  HttpErrorHandler,
  RestClient,
  FetchHandler,
} from "@theplant/fetch-middleware";

// 完全类型化的中间件
const myMiddleware: Middleware = async (req, next, ctx) => {
  return await next(req);
};

// 完全类型化的错误处理器
const errorHandler: HttpErrorHandler = ({ status, body, signal }) => {
  // 所有参数都是完全类型化的
};

// 完全类型化的客户端
const client: RestClient = createFetchClient({
  middlewares: [myMiddleware],
});
```

## 许可证

ISC
