# Request Queue Middleware 时序问题修复总结

## 1. 问题描述

在处理并发请求时，如果触发了 401 刷新（Refresh Token），后续进入队列的请求可能会出现**乱序**现象。

具体表现为：

- **预期顺序**：`Req1` (触发刷新) -> `Req2` (刷新期间发起) -> `Req3` (刷新期间发起)
- **实际顺序**：`Req2` -> `Req3` -> `Req1`

即：**后来者（刷新期间的新请求）抢跑了，而最早触发刷新的请求反而被排到了最后。**

## 2. 原因分析

问题的根源在于 `requestQueue` 的入队逻辑与 `pendingRequests` 的处理时机不匹配。

### 2.1 关键流程回顾

1.  **Req1 发起**：返回 401，触发 `queueTrigger`。
2.  **进入等待窗口**：为了防止并发请求重复触发刷新，代码设置了一个 10ms 的 `REFRESH_START_DELAY_MS` 等待窗口。
    - 此时 `isRefreshing` 被设为 `true`。
    - `Req1` 依然保留在 `pendingRequests` Map 中，**尚未进入** `requestQueue`。
3.  **Req2 发起**（在 10ms 窗口内）：
    - 检查 `isRefreshing` 为 `true`。
    - **直接调用 `addToQueue`**，将 `Req2` `push` 到 `requestQueue` 尾部。
    - 此时 `requestQueue` = `[Req2]`。
4.  **等待窗口结束**：
    - 代码开始收集 `pendingRequests`（包含 `Req1`）。
    - 将收集到的请求 `push` 到 `requestQueue` 尾部。
    - 此时 `requestQueue` = `[Req2, Req1]`。

### 2.2 结论

由于“刷新期间的新请求”是**实时**进入队列的，而“触发刷新的老请求”是在**等待窗口结束后**才批量进入队列的，导致了**新请求排在老请求前面**。

## 3. 修复方案

为了保证先进先出（FIFO）的时序，我们需要确保**老请求（Pending Requests）始终排在队列的最前面**。

### 3.1 代码变更

在收集并转移 `pendingRequests` 到 `requestQueue` 时，将操作从 `push`（追加到尾部）改为 **`unshift`（插入到头部）**。

**修改前（Push）：**

```typescript
// requestQueue: [Req2]
for (const pending of toQueue) {
  addToQueue(..., pending, ...) // push
}
// requestQueue: [Req2, Req1] ❌ 乱序
```

**修改后（Unshift）：**

```typescript
// requestQueue: [Req2]
// 倒序遍历 toQueue 以保持其内部顺序
for (let i = toQueue.length - 1; i >= 0; i--) {
  const pending = toQueue[i];
  requestQueue.unshift({ ...pending }); // unshift
}
// requestQueue: [Req1, Req2] ✅ 正序
```

### 3.2 逻辑验证

1.  `Req1` 触发刷新，进入等待。
2.  `Req2` 进来，`push` 进队列 -> `[Req2]`。
3.  等待结束，`Req1` 被 `unshift` 进队列 -> `[Req1, Req2]`。
4.  刷新成功，按顺序重试 -> 先 `Req1`，后 `Req2`。

## 4. 测试验证

为了确保修复有效且不再回归，我们添加了两个针对性的测试用例：

1.  **基础时序测试**：
    - 模拟 `Req1` 触发 401。
    - 在刷新等待窗口内发起 `Req2`。
    - 验证重试顺序为 `Req1` -> `Req2`。

2.  **高并发长时测试**：
    - 模拟 5秒 的长时刷新。
    - 期间每隔 300ms 发起一个新请求（共 15 个）。
    - 使用 `Fake Timers` 加速测试执行。
    - 验证所有 15 个请求严格按照发起时间顺序被重试。
