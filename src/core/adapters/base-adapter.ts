/**
 * 适配器包入口
 *
 * 重新导出 MediaAdapter 接口（实际定义在 src/types.ts 中，已冻结）。
 * 所有模态适配器（ImageAdapter、VideoAdapter、DocumentAdapter）
 * 均需 implements MediaAdapter 接口。
 */
export type { MediaAdapter } from '../../types.js';
