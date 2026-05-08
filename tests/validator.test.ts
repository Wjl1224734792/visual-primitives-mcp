/**
 * Validator 单元测试：坐标范围、合法性、唯一性校验
 *
 * TDD Red 阶段：目标模块 src/core/validator.ts 尚未实现，预期导入失败
 */
import { describe, it, expect } from 'vitest';
import { validateObjects, ValidationError } from '../src/core/validator.js';
import type { VisualObject } from '../src/types.js';

/** 创建一个合法的测试物体 */
function makeValidObject(overrides: Partial<VisualObject> = {}): VisualObject {
  return {
    id: 1,
    label: '测试物体',
    bbox: [10, 20, 100, 200],
    centroid: [55, 110],
    ...overrides,
  };
}

describe('validateObjects - 正常通过', () => {
  it('单个合法物体应通过校验', () => {
    const objects: VisualObject[] = [makeValidObject()];
    expect(() => validateObjects(objects, 1000)).not.toThrow();
  });

  it('多个合法物体（不同 ID）应通过校验', () => {
    const objects: VisualObject[] = [
      makeValidObject({ id: 1 }),
      makeValidObject({
        id: 2,
        bbox: [200, 300, 400, 500],
        centroid: [300, 400],
      }),
    ];
    expect(() => validateObjects(objects, 1000)).not.toThrow();
  });

  it('bbox 在 0-100 精度范围内应通过', () => {
    const objects: VisualObject[] = [
      makeValidObject({ bbox: [0, 0, 100, 100], centroid: [50, 50] }),
    ];
    expect(() => validateObjects(objects, 100)).not.toThrow();
  });

  it('centroid 恰好在 bbox 边界上应通过', () => {
    const objects: VisualObject[] = [
      makeValidObject({ id: 1, bbox: [0, 0, 100, 100], centroid: [0, 0] }),
      // cx == x1, cy == y1 边界情况
    ];
    expect(() => validateObjects(objects, 1000)).not.toThrow();
  });

  it('centroid 恰好在 bbox 右下边界应通过', () => {
    const objects: VisualObject[] = [
      makeValidObject({ id: 1, bbox: [0, 0, 100, 100], centroid: [100, 100] }),
    ];
    expect(() => validateObjects(objects, 1000)).not.toThrow();
  });

  it('可选字段为空时正常通过', () => {
    const objects: VisualObject[] = [
      makeValidObject({
        page: undefined,
        timestamp_range: undefined,
        media_type: undefined,
      }),
    ];
    expect(() => validateObjects(objects, 1000)).not.toThrow();
  });

  it('可选字段含合法值时应通过', () => {
    const objects: VisualObject[] = [
      makeValidObject({
        page: 3,
        timestamp_range: [1.5, 5.0],
        media_type: 'video',
      }),
    ];
    expect(() => validateObjects(objects, 1000)).not.toThrow();
  });
});

describe('validateObjects - 空数组', () => {
  it('objects 数组为空应抛出 ValidationError', () => {
    expect(() => validateObjects([], 1000)).toThrow(ValidationError);
    expect(() => validateObjects([], 1000)).toThrow(/不能为空/);
  });
});

describe('validateObjects - ID 唯一性', () => {
  it('存在重复 ID 应抛出 ValidationError', () => {
    const objects: VisualObject[] = [
      makeValidObject({ id: 1, bbox: [0, 0, 50, 50], centroid: [25, 25] }),
      makeValidObject({
        id: 1,
        bbox: [100, 100, 150, 150],
        centroid: [125, 125],
      }),
    ];
    expect(() => validateObjects(objects, 1000)).toThrow(ValidationError);
    expect(() => validateObjects(objects, 1000)).toThrow(/重复.*ID/);
  });

  it('三个物体中有两个相同 ID 应抛出', () => {
    const objects: VisualObject[] = [
      makeValidObject({ id: 1, bbox: [0, 0, 10, 10], centroid: [5, 5] }),
      makeValidObject({ id: 2, bbox: [20, 20, 30, 30], centroid: [25, 25] }),
      makeValidObject({ id: 1, bbox: [40, 40, 50, 50], centroid: [45, 45] }),
    ];
    expect(() => validateObjects(objects, 1000)).toThrow(ValidationError);
  });
});

describe('validateObjects - bbox 范围', () => {
  it('x1 < 0 应抛出 ValidationError', () => {
    const objects: VisualObject[] = [
      makeValidObject({ bbox: [-1, 0, 100, 100], centroid: [50, 50] }),
    ];
    expect(() => validateObjects(objects, 1000)).toThrow(ValidationError);
  });

  it('y1 < 0 应抛出 ValidationError', () => {
    const objects: VisualObject[] = [
      makeValidObject({ bbox: [0, -5, 100, 100], centroid: [50, 50] }),
    ];
    expect(() => validateObjects(objects, 1000)).toThrow(ValidationError);
  });

  it('x2 > precision 应抛出 ValidationError', () => {
    const objects: VisualObject[] = [
      makeValidObject({ bbox: [0, 0, 1001, 100], centroid: [500, 50] }),
    ];
    expect(() => validateObjects(objects, 1000)).toThrow(ValidationError);
  });

  it('y2 > precision 应抛出 ValidationError', () => {
    const objects: VisualObject[] = [
      makeValidObject({ bbox: [0, 0, 100, 1001], centroid: [50, 500] }),
    ];
    expect(() => validateObjects(objects, 1000)).toThrow(ValidationError);
  });

  it('所有 bbox 值均在 0-100 范围外应抛出', () => {
    const objects: VisualObject[] = [
      makeValidObject({ bbox: [0, 0, 200, 200], centroid: [100, 100] }),
    ];
    expect(() => validateObjects(objects, 100)).toThrow(ValidationError);
  });
});

describe('validateObjects - bbox 合法性', () => {
  it('x1 >= x2 应抛出 ValidationError', () => {
    const objects: VisualObject[] = [
      makeValidObject({ bbox: [100, 0, 100, 100], centroid: [100, 50] }),
    ];
    expect(() => validateObjects(objects, 1000)).toThrow(ValidationError);
  });

  it('x1 > x2 应抛出 ValidationError', () => {
    const objects: VisualObject[] = [
      makeValidObject({ bbox: [200, 0, 100, 100], centroid: [150, 50] }),
    ];
    expect(() => validateObjects(objects, 1000)).toThrow(ValidationError);
  });

  it('y1 >= y2 应抛出 ValidationError', () => {
    const objects: VisualObject[] = [
      makeValidObject({ bbox: [0, 100, 100, 100], centroid: [50, 100] }),
    ];
    expect(() => validateObjects(objects, 1000)).toThrow(ValidationError);
  });

  it('y1 > y2 应抛出 ValidationError', () => {
    const objects: VisualObject[] = [
      makeValidObject({ bbox: [0, 200, 100, 100], centroid: [50, 150] }),
    ];
    expect(() => validateObjects(objects, 1000)).toThrow(ValidationError);
  });
});

describe('validateObjects - centroid 位置', () => {
  it('cx < x1 应抛出 ValidationError', () => {
    const objects: VisualObject[] = [
      makeValidObject({ bbox: [50, 0, 100, 100], centroid: [40, 50] }),
    ];
    expect(() => validateObjects(objects, 1000)).toThrow(ValidationError);
  });

  it('cx > x2 应抛出 ValidationError', () => {
    const objects: VisualObject[] = [
      makeValidObject({ bbox: [0, 0, 100, 100], centroid: [110, 50] }),
    ];
    expect(() => validateObjects(objects, 1000)).toThrow(ValidationError);
  });

  it('cy < y1 应抛出 ValidationError', () => {
    const objects: VisualObject[] = [
      makeValidObject({ bbox: [0, 50, 100, 100], centroid: [50, 40] }),
    ];
    expect(() => validateObjects(objects, 1000)).toThrow(ValidationError);
  });

  it('cy > y2 应抛出 ValidationError', () => {
    const objects: VisualObject[] = [
      makeValidObject({ bbox: [0, 0, 100, 50], centroid: [50, 60] }),
    ];
    expect(() => validateObjects(objects, 1000)).toThrow(ValidationError);
  });
});

describe('validateObjects - 可选字段校验', () => {
  it('page 存在但不是正整数应抛出 ValidationError', () => {
    const objects: VisualObject[] = [makeValidObject({ page: 0 })];
    expect(() => validateObjects(objects, 1000)).toThrow(ValidationError);
  });

  it('page 为负数应抛出 ValidationError', () => {
    const objects: VisualObject[] = [makeValidObject({ page: -1 })];
    expect(() => validateObjects(objects, 1000)).toThrow(ValidationError);
  });

  it('page 为小数应抛出 ValidationError', () => {
    const objects: VisualObject[] = [makeValidObject({ page: 1.5 })];
    expect(() => validateObjects(objects, 1000)).toThrow(ValidationError);
  });

  it('timestamp_range 不是二元组应抛出 ValidationError', () => {
    const objects: VisualObject[] = [
      makeValidObject({ timestamp_range: [1] as unknown as [number, number] }),
    ];
    expect(() => validateObjects(objects, 1000)).toThrow(ValidationError);
  });

  it('timestamp_range 起始时间不小于结束时间应抛出 ValidationError', () => {
    const objects: VisualObject[] = [
      makeValidObject({ timestamp_range: [5.0, 5.0] }),
    ];
    expect(() => validateObjects(objects, 1000)).toThrow(ValidationError);
  });

  it('timestamp_range 起始时间大于结束时间应抛出 ValidationError', () => {
    const objects: VisualObject[] = [
      makeValidObject({ timestamp_range: [10.0, 5.0] }),
    ];
    expect(() => validateObjects(objects, 1000)).toThrow(ValidationError);
  });

  it('media_type 存在但不是合法枚举值应抛出 ValidationError', () => {
    const objects: VisualObject[] = [
      makeValidObject({
        media_type: 'audio/mp3' as unknown as Parameters<
          typeof makeValidObject
        >[0]['media_type'],
      }),
    ];
    // @ts-expect-error 故意传入非法值
    objects[0]!.media_type = 'audio/mp3';
    expect(() => validateObjects(objects, 1000)).toThrow(ValidationError);
    expect(() => validateObjects(objects, 1000)).toThrow(/media_type/);
  });
});

describe('ValidationError 类', () => {
  it('应为 Error 的子类', () => {
    const error = new ValidationError('校验失败：ID 重复');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ValidationError');
    expect(error.message).toBe('校验失败：ID 重复');
  });
});
