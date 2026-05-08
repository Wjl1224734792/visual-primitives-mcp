---
alwaysApply: true
platforms: [claude]
description: TypeScript Type 与 Interface 使用规范（含 Zod 实践）— 所有 .claude 智能体强制遵守
---

# TypeScript Type 与 Interface 使用规范（含 Zod 实践）

## 一句话原则

**默认使用 `interface`，遇到 `type` 专属场景再用 `type`。**

## 必须使用 `type` 的场景

- 联合类型 `|`
- 元组 `[...]`
- 映射/条件类型（如 `Pick`、`Exclude`、`ReturnType`）
- 原始类型别名（`type Name = string`）

## 必须使用 `interface` 的场景

- 声明合并（扩展第三方库类型，如 `Window`、`Express.Request`）
- 类实现契约（`class User implements IUser`）

## 默认推荐 `interface` 的场景

- 定义纯对象结构（数据模型、API 响应、Props 等）
- 理由：扩展性好（`extends`）、错误提示友好、编译器性能略优

## 快速对照表

| 场景         | 选择        |
| ------------ | ----------- |
| 对象形状     | `interface` |
| 联合 / 元组  | `type`      |
| 工具类型     | `type`      |
| 类契约       | `interface` |
| 全局类型扩展 | `interface` |

> 对象优先 `interface`，做不到再换 `type`。

---

## 关于 Zod 的补充说明

### Zod 不能完全替代本规范

- Zod 用于**运行时校验**，通过 `z.infer<typeof schema>` 得到的类型本质上是 **type alias**，不是 `interface`。
- `interface` 的以下能力 Zod **无法替代**：
  - 声明合并
  - 类实现契约
  - 部分场景下更友好的编辑器提示

### Zod 环境下的调整建议

| 场景                       | 纯 TS 规范  | 用了 Zod 后的做法                                    |
| -------------------------- | ----------- | ---------------------------------------------------- |
| API 请求/响应体            | `interface` | 只写 Zod schema，用 `z.infer` 自动生成类型，不再手写 |
| 复杂联合/元组              | `type`      | 仍需 `type`（Zod 表达不直观）                        |
| 全局类型扩展               | `interface` | 仍用 `interface`                                     |
| 类契约                     | `interface` | 仍用 `interface`                                     |
| 工具类型（`Pick`、`Omit`） | `type`      | 可基于 `z.infer` 运算，或用纯 `type`                 |

### 修正后的一句话原则（Zod 环境下）

> **凡是由外部数据（API、DB、表单）定义的结构 → 只用 Zod schema，不手写类型；凡是需要声明合并、类实现、或 TS 特有类型运算的 → 继续遵守 `interface`/`type` 规范。**
