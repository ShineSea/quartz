# Quartz_API模式错误处理优化

## 概述

本文档记录了 Quartz 在 API 模式下遇到的一系列错误处理和构建卡死问题的完整解决过程，包括问题分析、解决方案和最佳实践。

> AI生成。

---

## 问题背景

用户需要在 API 模式下使用 Quartz（通过 `npx quartz build --serve --api`），当 markdown 文件存在 YAML 语法错误时：
1. 服务不应退出进程（`process.exit(1)`）
2. 应该抛出异常，让调用方通过 HTTP 响应返回错误信息
3. 修正错误后，后续的构建请求应该能正常触发

---

## 遇到的问题

### 问题 1: TypeScript 全局变量类型错误

**症状：**
```typescript
// 在 trace.ts 中使用
if (globalThis.__QUARTZ_API_MODE__) { ... }
```
报错：`元素隐式具有 'any' 类型，因为类型'typeof globalThis'没有索引签名`

**原因：**
在 `index.d.ts` 中声明了全局变量，但该文件因包含 `declare module "*.scss"` 被视为模块文件，导致其中的 `declare global` 块在访问 `globalThis` 时出现类型推断问题。

**解决方案：**
将 Node.js 全局变量声明移到 `globals.d.ts` 文件中（该文件原本用于浏览器全局类型），统一管理所有全局类型声明：

```typescript
// globals.d.ts
export declare global {
  interface Document { ... }
  interface Window { ... }
  
  /**
   * Node.js runtime globals
   * API mode flag - when true, build errors throw instead of process.exit(1)
   * Set in handlers.js when --api argument is present
   */
  var __QUARTZ_API_MODE__: boolean | undefined
}
```

---

### 问题 2: 错误日志重复打印

**症状：**
YAML 语法错误在日志和 API 响应中都被打印两遍。

**原因：**
错误处理链中 `trace()` 函数被调用了两次：
- 第一次：`parse.ts:115` 解析 markdown 时捕获 YAML 错误
- 第二次：`build.ts:371` 构建失败时再次处理错误

每次调用都会格式化一遍错误信息，导致重复。

**解决方案：**
创建自定义 `QuartzError` 类，在 `trace()` 函数中检测是否已经是 `QuartzError` 实例，避免重复包装：

```typescript
// trace.ts
export class QuartzError extends Error {
  constructor(
    message: string,
    public readonly originalError: Error,
    public readonly formattedMessage: string,
  ) {
    super(message)
    this.name = "QuartzError"
    this.stack = originalError.stack
  }
}

export function trace(msg: string, err: Error) {
  // 如果已经是 QuartzError，直接重新抛出，避免重复包装
  if (err instanceof QuartzError) {
    throw err
  }
  
  // ... 格式化错误消息
  
  if (globalThis.__QUARTZ_API_MODE__) {
    throw new QuartzError(err.message, err, traceMsg)
  } else {
    console.error(traceMsg)
    process.exit(1)
  }
}
```

```typescript
// build.ts
export default async (argv: Argv, mut: Mutex, clientRefresh: () => void) => {
  try {
    return await buildQuartz(argv, mut, clientRefresh)
  } catch (err) {
    // API 模式下，直接抛出错误，不再重复处理
    if (globalThis.__QUARTZ_API_MODE__) {
      throw err
    }
    trace("\nExiting Quartz due to a fatal error", err as Error)
  }
}
```

---

## 问题 3: 构建失败后无法触发后续构建（死锁）

**症状：**
日志显示 `API build trigger received` 但没有后续构建输出，程序永远卡住。即使修正错误后发送新请求，也无法触发构建。

**原因（死锁）：**
在 `build.ts` 中，`buildQuartz()` 函数内部尝试获取 mutex 锁，但调用者 `handlers.js` 的 `build()` 函数已经持有了这个锁：

```javascript
// handlers.js:build()
const release = await buildMutex.acquire()  // ← 持有锁
try {
  buildApi = await buildQuartz(argv, buildMutex, clientRefresh)  // ← 调用 buildQuartz
} finally {
  release()
}

// build.ts:buildQuartz()
async function buildQuartz(argv: Argv, mut: Mutex, clientRefresh: () => void) {
  const release = await mut.acquire()  // ← ❌ 尝试获取同一个锁，永远等待！
  // ...
}
```

**死锁调用链：**
```
handlers.js:build() 
  ↓ 持有 buildMutex
  ↓ 调用 buildQuartz()
  ↓
build.ts:buildQuartz()
  ↓ 尝试获取 buildMutex
  ❌ 永远等待（死锁）
```

这是经典的**重入锁死锁问题**：同一个调用链中重复获取同一个不可重入的 mutex。

**解决方案：**

1. **核心修复**：注释掉 `buildQuartz()` 内部的 mutex 获取，因为调用者已经持有锁：

```typescript
// build.ts
async function buildQuartz(argv: Argv, mut: Mutex, clientRefresh: () => void) {
  // API 模式下，调用者（handlers.js）已经持有锁，不需要再次获取
  // const release = await mut.acquire()
  
  // ... 构建逻辑 ...
  
  // release()  // API 模式下由调用者释放锁
}
```

2. **防御性编程**：在 `handlers.js` 的 `build()` 函数中使用 `try...finally` 确保 mutex 一定会被释放（即使其他地方出错）：

```javascript
const build = async (clientRefresh) => {
  const buildStart = new Date().getTime()
  const release = await buildMutex.acquire()
  
  try {
    // 防止在等待锁的过程中，有更新的请求已经开始执行
    if (lastBuildMs > buildStart) {
      return
    }
    lastBuildMs = buildStart
    
    // ... 构建逻辑
    buildApi = await buildQuartz(argv, buildMutex, clientRefresh)
    clientRefresh()
  } finally {
    release()  // 确保无论成功还是失败，都释放锁
  }
}
```

**补充说明：**
- 之前尝试的"问题 3（try...finally）"和"问题 4（时间戳检查）"都没有解决根本问题
- `try...finally` 只是防御性措施，确保异常时锁能释放
- 时间戳检查只是优化并发请求的逻辑
- **死锁才是导致构建卡住的真正原因**

---

### 问题 4: API 响应包含 ANSI 颜色代码

**症状：**
API 返回的 JSON 响应中包含 ANSI 颜色代码（如 `[41m[30m`），在前端显示为乱码。

**原因：**
`trace()` 函数使用 `styleText()` 添加了终端颜色代码，这些代码在 JSON 中不应该存在。

**解决方案：**
在 `handlers.js` 的 API 错误处理中添加 `stripAnsi()` 函数移除颜色代码：

```javascript
// handlers.js
const stripAnsi = (str) => {
  if (typeof str !== 'string') return str
  return str.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    '',
  )
}

// API 错误响应
const isQuartzError = error.name === 'QuartzError'
const cleanMessage = stripAnsi(
  isQuartzError ? error.originalError?.message || error.message : error.message
)
const cleanStack = stripAnsi(
  isQuartzError ? error.originalError?.stack : error.stack
)

res.end(JSON.stringify({
  success: false,
  error: cleanMessage,
  file: isQuartzError ? extractFilePath(cleanMessage) : null,
  details: cleanStack,
}))
```

---

## 完整的错误处理链路

### 关键改进

1. ✅ 使用自定义 `QuartzError` 类避免重复格式化
2. ✅ API 模式下跳过第二次 `trace()` 调用
3. ✅ **注释掉 `buildQuartz` 内部的 mutex 获取，避免死锁**（核心修复）
4. ✅ `try...finally` 确保 mutex 一定会被释放（防御性措施）
5. ✅ 移除 ANSI 颜色代码，返回干净的 JSON

### API 模式下的正常流程

```
HTTP POST /api/build
  ↓
handlers.js:API endpoint handler
  ↓ 调用 build(clientRefresh)
  ↓
handlers.js:build()
  ↓ buildMutex.acquire() - 获取锁
  ↓ ctx.rebuild() - 编译 TypeScript 配置
  ↓ import buildQuartz - 动态导入编译后的模块
  ↓ buildQuartz(argv, buildMutex, clientRefresh) - 执行实际构建
  ↓
build.ts:buildQuartz()
  ↓ (不再获取 mutex，调用者已持有)
  ↓ rm(output) - 清理输出目录
  ↓ glob() - 扫描文件
  ↓ parseMarkdown() - 解析 markdown
  ↓
processors/parse.ts:parseMarkdown()
  ↓ 遍历所有 .md 文件
  ↓ 解析 frontmatter (YAML)
  ↓ 应用 transformers
  ↓
如果 YAML 解析成功:
  ↓ filterContent() - 过滤内容
  ↓ emitContent() - 生成 HTML
  ↓ startApi() - 返回 API 接口对象
  ↓ handlers.js:release() - 释放锁 (finally 块)
  ↓ HTTP 200 响应
```

### API 模式下的错误流程

```
parseMarkdown() - YAML 语法错误
  ↓
catch (err)
  ↓ 调用 trace(msg, err)
  ↓
trace.ts:trace()
  ↓ 检测到 globalThis.__QUARTZ_API_MODE__ === true
  ↓ throw new QuartzError(err.message, err, formattedMessage)
  ↓
parse.ts 抛出 QuartzError
  ↓
build.ts:buildQuartz() 捕获异常
  ↓ catch (err) - 检测到 __QUARTZ_API_MODE__
  ↓ throw err (直接抛出，不重复处理)
  ↓
handlers.js:build() 捕获异常
  ↓ finally { release() } - 确保释放锁
  ↓ throw 到上层
  ↓
handlers.js:API endpoint catch 块
  ↓ 检查 error.name === 'QuartzError'
  ↓ stripAnsi() - 移除颜色代码
  ↓ extractFilePath() - 提取文件路径
  ↓ HTTP 500 响应 JSON 错误信息
```

---

## 改进总结

### 修改的文件

1. **`globals.d.ts`**
   - 添加 Node.js 全局变量 `__QUARTZ_API_MODE__` 的类型声明

2. **`quartz/util/trace.ts`**
   - 新增 `QuartzError` 自定义错误类
   - 添加重复包装检查，避免错误被格式化多次
   - API 模式下抛出 `QuartzError` 而非 `process.exit(1)`

3. **`quartz/build.ts`**
   - **注释掉 `buildQuartz()` 内部的 mutex 获取/释放逻辑**（核心修复，避免死锁）
   - API 模式下直接抛出错误，不重复调用 `trace()`

4. **`quartz/cli/handlers.js`**
   - 设置全局变量 `globalThis.__QUARTZ_API_MODE__`
   - **使用 `try...finally` 确保 mutex 必然释放**（防御性措施）
   - 简化时间戳检查逻辑（在获取锁后检查 `lastBuildMs > buildStart`）
   - API 错误处理中添加 ANSI 代码移除、文件路径提取功能

### 改进后的优点

1. **进程稳定性** - API 模式下遇到错误不再退出进程
2. **错误信息清晰** - 错误只打印一次，API 响应返回干净的 JSON（无 ANSI 颜色代码）
3. **资源管理正确** - **解决死锁问题**（核心修复），避免锁永远不释放导致的构建卡死
4. **代码简洁** - 移除了冗余的 `currentBuildMs` 变量和调试日志
5. **代码可维护性** - 错误处理链路清晰，职责分明

### 规避的问题

1. ✅ **TypeScript 类型错误** - 全局变量类型声明正确
2. ✅ **重复错误日志** - 通过 QuartzError 实例检查避免
3. ✅ **Mutex 死锁** - buildQuartz 不再重复获取锁（**这是导致构建卡住的根本原因**）
4. ✅ **资源泄漏** - finally 块确保锁释放（防御性措施）
5. ✅ **API 响应乱码** - ANSI 代码被正确移除
6. ✅ **进程意外退出** - API 模式抛出异常而非 exit
7. ✅ **代码冗余** - 简化时间戳检查逻辑，移除不必要的变量

---

## 最佳实践建议

### 1. Mutex 使用规范

在使用 mutex 时，**必须**使用 `try...finally` 模式：

```javascript
const release = await mutex.acquire()
try {
  // 可能抛出异常的代码
} finally {
  release()  // 确保必然释放
}
```

### 2. 避免嵌套获取同一个锁

如果函数接收 mutex 作为参数，需要明确是：
- **由调用者管理锁**（函数内部不获取锁）
- **由函数自己管理锁**（函数内部获取并释放锁）

不要在同一个调用链中重复获取同一个锁。

### 3. 错误处理链路设计

对于需要多层传递的错误：
- 创建自定义错误类携带上下文信息
- 在最外层统一格式化和处理
- 避免在中间层重复处理

### 4. 全局变量的类型声明

- 浏览器和 Node.js 的全局变量可以在同一个 `declare global` 块中
- 避免在包含 `declare module` 的文件中使用 `declare global`
- 全局类型声明应集中管理

### 5. API 响应设计

返回给前端的 JSON 应该：
- 移除所有终端相关的格式（ANSI 颜色代码）
- 提取关键信息（文件路径、错误位置等）
- 结构化错误信息便于前端展示

---

## 测试验证

修复完成后，应验证以下场景：

1. ✅ **YAML 语法错误**
   - 发送包含 YAML 错误的 markdown
   - 验证返回 500 错误，包含清晰的错误信息
   - 验证服务未退出

2. ✅ **错误修正后重建**
   - 修正 YAML 错误后再次发送请求
   - 验证构建成功，返回 200
   - 验证文件正确生成

3. ✅ **快速连续请求**
   - 快速发送多个构建请求
   - 验证不会出现死锁
   - 验证最终构建成功

4. ✅ **日志检查**
   - 验证错误日志只打印一次
   - 验证无 ANSI 代码泄漏到 API 响应

---

# 总结

这次优化解决了 Quartz API 模式下的核心问题。**最关键的发现是死锁问题**：`buildQuartz()` 内部重复获取调用者已持有的 mutex，导致程序永远卡住。

**问题演变过程**：
1. 最初以为是"mutex 未释放"（问题 3），添加了 `try...finally`
2. 发现还不行，以为是"时间戳检查逻辑错误"（问题 4），引入了额外的 `currentBuildMs` 变量
3. 通过调试日志最终定位到**死锁问题**（问题 5），这才是根本原因
4. 修复死锁后，发现问题 3 和 4 的修改都过度复杂化了
5. 最终简化代码：只保留核心修复（注释掉重复的 mutex 获取）和防御性措施（`try...finally`）

**核心教训**：
- ✅ **避免在调用链中重复获取同一个锁**（最重要！）
- ✅ 始终使用 `try...finally` 管理资源（防御性编程）
- ✅ 使用调试日志定位卡死问题
- ✅ 自定义错误类携带完整上下文
- ✅ **问题定位后及时简化过度复杂的代码**

这些经验可以应用到其他类似的异步资源管理和错误处理场景中。
