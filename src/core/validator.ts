/**
 * 坐标与物体验证器：校验视觉模型返回的物体数据合法性
 *
 * 校验规则：非空、ID 唯一、bbox 范围/合法性、centroid 位置、可选字段格式
 */
import type { VisualObject } from '../types.js';

/** 校验失败时抛出的错误 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * 校验物体列表的合法性
 *
 * @param objects - 待校验的物体数组
 * @param precision - 坐标精度上限（100 或 1000）
 * @throws {ValidationError} 任何校验不通过时，消息指明具体原因
 */
export function validateObjects(
  objects: VisualObject[],
  precision: number
): void {
  if (objects.length === 0) {
    throw new ValidationError('物体数组不能为空');
  }

  const idSet = new Set<number>();
  for (const obj of objects) {
    if (idSet.has(obj.id)) {
      throw new ValidationError(`存在重复 ID: ${String(obj.id)}`);
    }
    idSet.add(obj.id);
  }

  for (const obj of objects) {
    validateBBox(obj, precision);
    validateBBoxOrder(obj);
    validateCentroid(obj);
    validateTimestampRange(obj);
  }
}

/** 校验 bbox 四个值均在 [0, precision] 范围内 */
function validateBBox(obj: VisualObject, precision: number): void {
  const bbox = obj.bbox;
  const labels = ['x1', 'y1', 'x2', 'y2'];
  const values = [bbox[0], bbox[1], bbox[2], bbox[3]];

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v !== undefined && (v < 0 || v > precision)) {
      throw new ValidationError(
        `物体 id=${String(obj.id)} 的 ${labels[i] ?? '?'} 值 ${String(v)} 不在 [0, ${String(precision)}] 范围内`
      );
    }
  }
}

/** 校验 bbox 合法性：x1 < x2 且 y1 < y2 */
function validateBBoxOrder(obj: VisualObject): void {
  const bbox = obj.bbox;
  const x1 = bbox[0];
  const x2 = bbox[2];
  const y1 = bbox[1];
  const y2 = bbox[3];

  if (x1 >= x2) {
    throw new ValidationError(
      `物体 id=${String(obj.id)} 的 bbox x1(${String(x1)}) >= x2(${String(x2)})，需要 x1 < x2`
    );
  }
  if (y1 >= y2) {
    throw new ValidationError(
      `物体 id=${String(obj.id)} 的 bbox y1(${String(y1)}) >= y2(${String(y2)})，需要 y1 < y2`
    );
  }
}

/** 校验 centroid 位置：cx 在 [x1, x2] 内，cy 在 [y1, y2] 内 */
function validateCentroid(obj: VisualObject): void {
  const bbox = obj.bbox;
  const [x1, , x2] = bbox;
  const y1 = bbox[1];
  const y2 = bbox[3];
  const centroid = obj.centroid;
  const cx = centroid[0];
  const cy = centroid[1];

  if (cx < x1 || cx > x2) {
    throw new ValidationError(
      `物体 id=${String(obj.id)} 的 centroid cx(${String(cx)}) 不在 bbox x 范围 [${String(x1)}, ${String(x2)}] 内`
    );
  }
  if (cy < y1 || cy > y2) {
    throw new ValidationError(
      `物体 id=${String(obj.id)} 的 centroid cy(${String(cy)}) 不在 bbox y 范围 [${String(y1)}, ${String(y2)}] 内`
    );
  }
}

/** 校验 timestamp_range 可选字段 */
function validateTimestampRange(obj: VisualObject): void {
  if (obj.timestamp_range !== undefined && obj.timestamp_range !== null) {
    const tr = obj.timestamp_range;
    if (!Array.isArray(tr) || tr.length < 2) {
      throw new ValidationError(
        `物体 id=${String(obj.id)} 的 timestamp_range 无效，必须为 [number, number] 格式`
      );
    }
    if (tr[0] >= tr[1]) {
      throw new ValidationError(
        `物体 id=${String(obj.id)} 的 timestamp_range 起始时间(${String(tr[0])})不小于结束时间(${String(tr[1])})`
      );
    }
  }
}
