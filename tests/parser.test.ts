/**
 * Parser 单元测试：JSON 主解析 + 正则备用解析
 *
 * TDD Red 阶段：目标模块 src/core/parser.ts 尚未实现，预期导入失败
 */
import { describe, it, expect } from 'vitest';
import { parseResponse, AnalysisParseError } from '../src/core/parser.js';
import type { VisualAnalysisResult } from '../src/types.js';

/**
 * 构造标准 API 响应字符串
 * message.content 在真实 API 中始终是 JSON 字符串
 */
function makeApiResponse(content: string): string {
  return JSON.stringify({
    choices: [{ message: { content } }],
  });
}

describe('parseResponse - 标准 JSON 解析（主路径）', () => {
  it('标准 API 响应应正确解析为 VisualAnalysisResult', () => {
    const objects = [
      {
        id: 1,
        label: '红色水杯',
        bbox: [50, 100, 300, 400],
        centroid: [175, 250],
        state: '正常',
        relevance: '高',
      },
    ];
    const rawContent = makeApiResponse(
      JSON.stringify({
        objects,
        reasoning: '识别到红色水杯',
        spatial_relationships: [],
      })
    );

    const result: VisualAnalysisResult = parseResponse(rawContent);

    expect(result.objects).toHaveLength(1);
    expect(result.objects[0]!.id).toBe(1);
    expect(result.objects[0]!.label).toBe('红色水杯');
    expect(result.objects[0]!.bbox).toEqual([50, 100, 300, 400]);
    expect(result.objects[0]!.centroid).toEqual([175, 250]);
    expect(result.reasoning).toBe('识别到红色水杯');
  });

  it('含多个物体的 JSON 应全部解析', () => {
    const objects = [
      {
        id: 1,
        label: 'obj1',
        bbox: [0, 0, 100, 100],
        centroid: [50, 50],
      },
      {
        id: 2,
        label: 'obj2',
        bbox: [200, 200, 300, 300],
        centroid: [250, 250],
      },
    ];
    const rawContent = makeApiResponse(JSON.stringify({ objects }));

    const result = parseResponse(rawContent);

    expect(result.objects).toHaveLength(2);
    expect(result.objects[0]!.id).toBe(1);
    expect(result.objects[1]!.id).toBe(2);
  });

  it('含空间关系的 JSON 应完整保留', () => {
    const rawContent = makeApiResponse(
      JSON.stringify({
        objects: [
          {
            id: 1,
            label: 'A',
            bbox: [0, 0, 100, 100],
            centroid: [50, 50],
          },
        ],
        spatial_relationships: ['object_1 在 object_2 左侧'],
      })
    );

    const result = parseResponse(rawContent);

    expect(result.spatial_relationships).toEqual(['object_1 在 object_2 左侧']);
  });
});

describe('parseResponse - 非标 JSON 正则备用提取', () => {
  it('Markdown 代码块包裹的 JSON 应正确提取', () => {
    const objects = [
      {
        id: 1,
        label: '蓝色笔记本',
        bbox: [100, 200, 400, 500],
        centroid: [250, 350],
      },
    ];
    const jsonStr = JSON.stringify({ objects, reasoning: 'test' });
    // content 被 markdown 代码块包裹
    const rawContent = makeApiResponse('```json\n' + jsonStr + '\n```');

    const result = parseResponse(rawContent);

    expect(result.objects).toHaveLength(1);
    expect(result.objects[0]!.label).toBe('蓝色笔记本');
  });

  it('前后有普通文本的 JSON 应正确提取', () => {
    const objects = [
      {
        id: 1,
        label: 'test',
        bbox: [10, 20, 30, 40],
        centroid: [20, 30],
      },
    ];
    const jsonStr = JSON.stringify({ objects });
    // content: 前导文本 + JSON + 后缀文本
    const content = '这里是一些分析说明文字\n' + jsonStr + '\n以上是分析结果';
    const rawContent = makeApiResponse(content);

    const result = parseResponse(rawContent);

    expect(result.objects).toHaveLength(1);
    expect(result.objects[0]!.id).toBe(1);
  });

  it('嵌套 JSON 对象应正确提取最外层完整对象', () => {
    const innerJson = JSON.stringify({ nested: { value: 1 } });
    const objects = [
      {
        id: 1,
        label: 'nested-test',
        bbox: [0, 0, 50, 50],
        centroid: [25, 25],
      },
    ];
    const jsonStr = JSON.stringify({ objects, metadata: innerJson });
    const rawContent = makeApiResponse('前缀\n' + jsonStr + '\n后缀');

    const result = parseResponse(rawContent);

    expect(result.objects).toHaveLength(1);
    expect(result.objects[0]!.label).toBe('nested-test');
  });

  it('rawContent 直接就是 JSON 内容字符串（非完整 API 响应）', () => {
    const objects = [
      {
        id: 1,
        label: 'direct',
        bbox: [10, 10, 100, 100],
        centroid: [55, 55],
      },
    ];
    const rawContent = JSON.stringify({ objects });

    const result = parseResponse(rawContent);

    expect(result.objects).toHaveLength(1);
    expect(result.objects[0]!.label).toBe('direct');
  });
});

describe('parseResponse - 错误处理', () => {
  it('完全无法解析的内容应抛出 AnalysisParseError', () => {
    const rawContent = '这是一段完全没有 JSON 的普通文本';

    expect(() => parseResponse(rawContent)).toThrow(AnalysisParseError);
  });

  it('仅含花括号的无效 JSON 应抛出 AnalysisParseError', () => {
    const rawContent = '{ 这不是有效的 json }';

    expect(() => parseResponse(rawContent)).toThrow(AnalysisParseError);
  });

  it('objects 数组为空应抛出 AnalysisParseError 并包含 "no objects found"', () => {
    const rawContent = makeApiResponse(JSON.stringify({ objects: [] }));

    expect(() => parseResponse(rawContent)).toThrow(AnalysisParseError);
    expect(() => parseResponse(rawContent)).toThrow(/no objects found/i);
  });

  it('objects 字段缺失应抛出 AnalysisParseError', () => {
    const rawContent = makeApiResponse(
      JSON.stringify({ reasoning: 'no objects field' })
    );

    expect(() => parseResponse(rawContent)).toThrow(AnalysisParseError);
  });

  it('AnalysisParseError 应为 Error 的子类', () => {
    const error = new AnalysisParseError('test message');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AnalysisParseError');
    expect(error.message).toBe('test message');
  });
});
