# TASK-001: 工程配置初始化

## 1. 修复目标

为 visual-primitives-mcp 项目创建完整的工程配置基础设施，包括 package.json、TypeScript 配置、ESLint/Prettier 格式化工具链、Git hooks、commitlint、CI 流水线和项目目录结构。

## 2. 对应 finding / task ID

- **Task**: TASK-001 (Round 1, P0)
- **映射 REQ**: REQ-C01, REQ-C02, REQ-C03, REQ-C04, REQ-C05, REQ-C06, REQ-N07, REQ-N08
- **依赖**: 无
- **被依赖**: 全部其他 TASK

## 3. 变更文件 / 变更范围

| 文件                       | 状态 | 说明                                                  |
| -------------------------- | ---- | ----------------------------------------------------- |
| `package.json`             | 新建 | 项目元数据 + 全部运行时/开发依赖声明                  |
| `tsconfig.json`            | 新建 | strict 模式 + ESM + NodeNext 模块                     |
| `eslint.config.js`         | 新建 | ESLint 9 flat config + strict TS 规则 + prettier 兼容 |
| `.prettierrc`              | 新建 | 项目统一格式化配置                                    |
| `.prettierignore`          | 新建 | 忽略 dist/node_modules/data/coverage                  |
| `.gitignore`               | 新建 | 忽略 node_modules/dist/data/.env/coverage/\*.log      |
| `.husky/pre-commit`        | 新建 | lint-staged 触发                                      |
| `commitlint.config.js`     | 新建 | Conventional Commits 校验                             |
| `.github/workflows/ci.yml` | 新建 | CI 流水线: lint -> typecheck -> test -> build         |
| `vitest.config.ts`         | 新建 | vitest + v8 coverage 配置                             |
| `data/.gitkeep`            | 新建 | 确保 data/ 被 git 跟踪                                |
| `src/` 及其子目录          | 新建 | 源码目录结构                                          |
| `tests/` 及其子目录        | 新建 | 测试目录结构                                          |

## 4. 修复说明

### 4.1 package.json

- 项目名 `visual-primitives-mcp`，使用 ESM (`"type": "module"`)
- 声明全部运行时依赖和开发依赖（后续 TASK 不再新增依赖）
- 完整的 scripts 集合：dev/build/start/lint/format/typecheck/test 等
- lint-staged 配置：`*.ts` 文件执行 eslint --fix + prettier --write；`*.{json,md,yaml,yml}` 执行 prettier --write
- husky v9 `prepare` script 使用新式命令 `husky`（无需加 `install`）

### 4.2 版本修正

`pdf-poppler` 在 npm 上最新版本为 `0.2.3`，而非任务文档声明的 `0.6.0`。已修正为 `^0.2.3`。

### 4.3 tsconfig.json

- target ES2023, module NodeNext, moduleResolution NodeNext
- strict: true + noUnusedLocals + noUnusedParameters + noUncheckedIndexedAccess
- declaration + declarationMap + sourceMap 开启
- rootDir: ./src, outDir: ./dist
- include 仅 src/\*\*/\*.ts, exclude node_modules/dist/tests

### 4.4 eslint.config.js (ESLint 9 flat config)

- 使用 `@typescript-eslint/eslint-plugin` v8 提供的 `configs.strict` 和 `configs['strict-type-checked']`
- 自定义规则：`unused-imports/no-unused-imports: error`、`no-console: warn`
- `eslint-config-prettier` 关闭所有与 Prettier 冲突的规则
- 忽略 dist/node_modules/data/coverage

### 4.5 CI Pipeline (.github/workflows/ci.yml)

- 触发条件: push (main/develop) + pull_request
- 4 个独立 job: lint -> typecheck -> test -> build
- Node.js 22.x, ubuntu-22.04, npm ci + cache

### 4.6 目录结构

```
src/
  core/adapters/   -- 模态适配器（图片/视频/文档）
  handlers/        -- MCP 工具处理器
  transport/       -- 传输层（stdio/SSE/HTTP Stream）
  templates/       -- 提示词模板
  utils/           -- 工具函数
tests/
  adapters/        -- 适配器测试
  fixtures/        -- 测试样本文件
data/              -- 运行时数据（SQLite 数据库）
```

## 5. 验证命令与结果

### 5.1 npm install

状态: **通过**

- 588 packages installed successfully
- husky prepare 执行（.git 不存在警告属于正常——项目尚未 git init）

### 5.2 ESLint 配置加载

状态: **通过**

```bash
npx eslint --print-config src/server.ts
# ESLint v9.39.4
# 成功输出完整配置：@typescript-eslint strict rules + strict-type-checked + unused-imports + prettier
```

### 5.3 package.json 语法验证

状态: **通过**

```bash
node -e "console.log(JSON.parse(require('fs').readFileSync('package.json', 'utf8')).name)"
# 输出: visual-primitives-mcp
```

### 5.4 format:check / typecheck / build / test

状态: **预期失败（空项目）** — 这些命令因为目前没有任何 `.ts` 源文件而报错，属于正常行为。一旦 TASK-002 创建第一个源文件，这些命令将正常工作。

| 命令                   | 退出码 | 原因                     |
| ---------------------- | ------ | ------------------------ |
| `npm run format:check` | 2      | 无文件匹配 patterns      |
| `npm run typecheck`    | 2      | TS18003: No inputs found |
| `npm run build`        | 2      | TS18003: No inputs found |
| `npm test`             | 1      | No test files found      |

## 6. 未处理风险

| 风险                          | 说明                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| husky .git not found          | 项目尚未 git init，husky prepare 无法设置 hooks 路径。这是正常的——git init 后重新运行 `npm run prepare` 即可                   |
| Windows 系统兼容性            | `.husky/pre-commit` 在 Windows 上可能无法直接执行。建议项目成员在 git bash/WSL 环境下运行，或使用 husky v9 的 Windows 兼容模式 |
| ESLint flat config 插件兼容性 | `eslint-plugin-unused-imports` v4 和 `eslint-plugin-import` v2 在 ESLint 9 flat config 下的兼容性需实际使用时验证              |

## 7. 推荐的下一步

1. **git init**: 初始化 git 仓库，重新运行 `npm run prepare` 激活 husky hooks
2. **TASK-002**: 配置体系、类型定义与工具库（依赖 TASK-001 完成）
3. 若 ESLint flat config 出现插件兼容问题，可考虑降级为 ESLint 8 传统配置格式，或升级插件至兼容版本
