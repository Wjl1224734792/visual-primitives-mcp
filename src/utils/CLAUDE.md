# src/utils/ — 工具层

跨模块共享的基础工具。

## 文件

| 文件        | 职责            | 关键导出                                |
| ----------- | --------------- | --------------------------------------- |
| `logger.ts` | pino 结构化日志 | `logger` — 自动脱敏 base64/apiKey/token |
| `retry.ts`  | 指数退避重试    | `withRetry<T>(fn, options?)`            |

## 使用

```typescript
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';

logger.info({ sessionId }, '操作完成');
const result = await withRetry(() => fetch(url), { maxAttempts: 3 });
```

## 参考

- [AGENTS.md](../AGENTS.md) — 完整架构文档，见 3.6 节工具层详解
