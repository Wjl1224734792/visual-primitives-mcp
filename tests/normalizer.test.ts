/**
 * Normalizer 单元测试：坐标精度归一化
 *
 * TDD Red 阶段：目标模块 src/core/normalizer.ts 尚未实现，预期导入失败
 */
import { describe, it, expect } from 'vitest';
import { normalizeObjects } from '../src/core/normalizer.js';
import type { VisualObject } from '../src/types.js';

/** 创建一个测试物体 */
function makeObject(overrides: Partial<VisualObject> = {}): VisualObject {
  return {
    id: 1,
    label: 'test',
    bbox: [100, 200, 300, 400],
    centroid: [200, 300],
    ...overrides,
  };
}

describe('normalizeObjects - 同精度', () => {
  it('sourcePrecision === targetPrecision 时返回浅拷贝', () => {
    const original: VisualObject[] = [makeObject()];
    const result = normalizeObjects(original, 1000, 1000);

    // 内容相同
    expect(result).toHaveLength(1);
    expect(result[0]!.bbox).toEqual([100, 200, 300, 400]);
    expect(result[0]!.centroid).toEqual([200, 300]);
    // 浅拷贝验证：不同引用
    expect(result).not.toBe(original);
    expect(result[0]).not.toBe(original[0]);
  });

  it('同精度场景下原有属性不应丢失', () => {
    const original: VisualObject[] = [
      makeObject({
        state: '正常',
        relevance: '高',
        timestamp_range: [1.5, 3.0],
      }),
    ];
    const result = normalizeObjects(original, 1000, 1000);

    expect(result[0]!.state).toBe('正常');
    expect(result[0]!.relevance).toBe('高');
    expect(result[0]!.timestamp_range).toEqual([1.5, 3.0]);
  });
});

describe('normalizeObjects - 缩放', () => {
  it('0-1000 → 0-100 精度缩放（比例 0.1）', () => {
    const original: VisualObject[] = [makeObject()];
    // bbox [100,200,300,400] * 0.1 = [10,20,30,40]
    // centroid [200,300] * 0.1 = [20,30]
    const result = normalizeObjects(original, 100, 1000);

    expect(result[0]!.bbox).toEqual([10, 20, 30, 40]);
    expect(result[0]!.centroid).toEqual([20, 30]);
  });

  it('bbox 和 centroid 值缩放后四舍五入到整数', () => {
    const original: VisualObject[] = [
      makeObject({ bbox: [15, 27, 85, 93], centroid: [50, 60] }),
    ];
    // 15*0.1=1.5→2, 27*0.1=2.7→3, 85*0.1=8.5→9, 93*0.1=9.3→9
    // 50*0.1=5→5, 60*0.1=6→6
    const result = normalizeObjects(original, 100, 1000);

    expect(result[0]!.bbox).toEqual([2, 3, 9, 9]);
    expect(result[0]!.centroid).toEqual([5, 6]);
  });

  it('0-1000 → 0-1000 缩放比例应为 1', () => {
    const original: VisualObject[] = [makeObject()];
    const result = normalizeObjects(original, 1000, 1000);

    expect(result[0]!.bbox).toEqual([100, 200, 300, 400]);
    expect(result[0]!.centroid).toEqual([200, 300]);
  });

  it('多个物体同时缩放', () => {
    const original: VisualObject[] = [
      makeObject({ id: 1, bbox: [0, 0, 1000, 1000], centroid: [500, 500] }),
      makeObject({ id: 2, bbox: [200, 300, 500, 700], centroid: [350, 500] }),
    ];
    const result = normalizeObjects(original, 100, 1000);

    expect(result[0]!.bbox).toEqual([0, 0, 100, 100]);
    expect(result[0]!.centroid).toEqual([50, 50]);
    expect(result[1]!.bbox).toEqual([20, 30, 50, 70]);
    expect(result[1]!.centroid).toEqual([35, 50]);
  });

  it('缩放到其他精度（如 500）', () => {
    const original: VisualObject[] = [
      makeObject({ bbox: [0, 0, 1000, 1000], centroid: [500, 500] }),
    ];
    // 500/1000 = 0.5, [0,0,1000,1000]*0.5 = [0,0,500,500]
    const result = normalizeObjects(original, 500, 1000);

    expect(result[0]!.bbox).toEqual([0, 0, 500, 500]);
    expect(result[0]!.centroid).toEqual([250, 250]);
  });
});

describe('normalizeObjects - 缩放后 bbox 合法性保持', () => {
  it('缩放后仍应保持 x1 < x2', () => {
    const original: VisualObject[] = [
      // bbox 很窄，缩放后可能 x1 === x2
      makeObject({ bbox: [10, 100, 15, 200], centroid: [12, 150] }),
    ];
    // 10*0.1=1, 15*0.1=1.5→2, x1(1)<x2(2) OK
    const result = normalizeObjects(original, 100, 1000);

    expect(result[0]!.bbox[0]!).toBeLessThan(result[0]!.bbox[2]!);
  });

  it('缩放后 x1 === x2 时 x2 应为 x1+1', () => {
    const original: VisualObject[] = [
      // bbox [5,100,6,200] → 5*0.1=0.5→1, 6*0.1=0.6→1, x1===x2
      makeObject({ bbox: [5, 100, 6, 200], centroid: [5, 150] }),
    ];
    const result = normalizeObjects(original, 100, 1000);

    expect(result[0]!.bbox[0]!).toBe(1);
    expect(result[0]!.bbox[2]!).toBe(2); // x2 = x1 + 1
    expect(result[0]!.bbox[0]!).toBeLessThan(result[0]!.bbox[2]!);
  });

  it('缩放后 y1 === y2 时 y2 应为 y1+1', () => {
    const original: VisualObject[] = [
      // bbox [100,5,200,6] → y1=0.5→1, y2=0.6→1, y1===y2
      makeObject({ bbox: [100, 5, 200, 6], centroid: [150, 5] }),
    ];
    const result = normalizeObjects(original, 100, 1000);

    expect(result[0]!.bbox[1]!).toBe(1);
    expect(result[0]!.bbox[3]!).toBe(2); // y2 = y1 + 1
    expect(result[0]!.bbox[1]!).toBeLessThan(result[0]!.bbox[3]!);
  });

  it('质心缩放后应在缩放后的 bbox 范围内', () => {
    const original: VisualObject[] = [
      makeObject({ bbox: [10, 20, 100, 200], centroid: [55, 110] }),
    ];
    const result = normalizeObjects(original, 100, 1000);
    // bbox→[1,2,10,20], centroid→[6,11]
    const obj = result[0]!;
    expect(obj.centroid[0]!).toBeGreaterThanOrEqual(obj.bbox[0]!);
    expect(obj.centroid[0]!).toBeLessThanOrEqual(obj.bbox[2]!);
    expect(obj.centroid[1]!).toBeGreaterThanOrEqual(obj.bbox[1]!);
    expect(obj.centroid[1]!).toBeLessThanOrEqual(obj.bbox[3]!);
  });

  it('质心在边界上缩放后仍在边界上', () => {
    const original: VisualObject[] = [
      makeObject({ bbox: [0, 0, 1000, 1000], centroid: [0, 0] }),
    ];
    const result = normalizeObjects(original, 100, 1000);
    expect(result[0]!.centroid).toEqual([0, 0]);
    expect(result[0]!.bbox).toEqual([0, 0, 100, 100]);
  });
});

describe('normalizeObjects - 不可变性', () => {
  it('不修改原始数组', () => {
    const original: VisualObject[] = [makeObject()];
    const bboxBefore = [...original[0]!.bbox];
    const centroidBefore = [...original[0]!.centroid];

    normalizeObjects(original, 100, 1000);

    // 原始数据不变
    expect(original[0]!.bbox).toEqual(bboxBefore);
    expect(original[0]!.centroid).toEqual(centroidBefore);
  });

  it('不应修改原始物体的嵌套属性', () => {
    const original: VisualObject[] = [
      makeObject({ timestamp_range: [1.5, 3.0] }),
    ];
    normalizeObjects(original, 100, 1000);

    expect(original[0]!.timestamp_range).toEqual([1.5, 3.0]);
  });
});
