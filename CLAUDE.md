# Visual Primitives MCP

基于 DeepSeek《Thinking with Visual Primitives》论文的多模态空间锚定 MCP 服务器。

## 项目架构

完整架构文档见 [AGENTS.md](./AGENTS.md)。

## 快速参考

| 命令                | 说明              |
| ------------------- | ----------------- |
| `npm run dev`       | 热重载开发        |
| `npm run build`     | 编译 TypeScript   |
| `npm run lint`      | ESLint 检查       |
| `npm run typecheck` | 类型检查          |
| `npm test`          | 运行测试 (vitest) |
| `npm start`         | 启动 MCP 服务     |

## 关键入口

- [src/server.ts](src/server.ts) — MCP 服务入口
- [src/config.ts](src/config.ts) — 环境变量配置
- [src/types.ts](src/types.ts) — 共享类型定义
- [AGENTS.md](AGENTS.md) — 完整架构文档
