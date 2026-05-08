/**
 * 坐标归一化器：在不同精度之间缩放物体坐标
 *
 * 不可变操作：不修改原数组，返回新数组
 */
import type { VisualObject } from '../types.js';

/**
 * 将物体坐标从源精度归一化到目标精度
 *
 * @param objects - 待归一化的物体数组
 * @param targetPrecision - 目标精度（如 100、1000）
 * @param sourcePrecision - 源精度（如 1000）
 * @returns 归一化后的新物体数组（不修改原数组）
 */
export function normalizeObjects(
  objects: VisualObject[],
  targetPrecision: number,
  sourcePrecision: number
): VisualObject[] {
  // 同精度直接返回浅拷贝
  if (sourcePrecision === targetPrecision) {
    return objects.map(obj => ({ ...obj }));
  }

  const scale = targetPrecision / sourcePrecision;

  return objects.map(obj => {
    const x1 = obj.bbox[0];
    const y1 = obj.bbox[1];
    const x2 = obj.bbox[2];
    const y2 = obj.bbox[3];
    const cx = obj.centroid[0];
    const cy = obj.centroid[1];

    let newX1 = Math.round(x1 * scale);
    let newY1 = Math.round(y1 * scale);
    let newX2 = Math.round(x2 * scale);
    let newY2 = Math.round(y2 * scale);
    const newCx = Math.round(cx * scale);
    const newCy = Math.round(cy * scale);

    // 缩放后确保 x1 < x2
    if (newX1 >= newX2) {
      newX2 = newX1 + 1;
    }
    // 缩放后确保 y1 < y2
    if (newY1 >= newY2) {
      newY2 = newY1 + 1;
    }

    return {
      ...obj,
      bbox: [newX1, newY1, newX2, newY2] as [number, number, number, number],
      centroid: [newCx, newCy] as [number, number],
    };
  });
}
