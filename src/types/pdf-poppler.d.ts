/**
 * pdf-poppler 模块类型声明
 *
 * pdf-poppler 是 CJS 模块，无内置类型声明。
 * 此文件为项目提供 TypeScript 类型支持。
 */
declare module 'pdf-poppler' {
  /** pdf-poppler convert() 方法的选项 */
  interface ConvertOptions {
    /** 输出格式（默认 'jpeg'），可选 'png', 'jpeg', 'tiff' */
    format?: string;
    /** 输出目录 */
    out_dir?: string;
    /** 输出文件名前缀 */
    out_prefix?: string;
    /** 指定页面（从 1 开始），null 表示所有页面 */
    page?: number | null;
    /** 缩放比例，默认 1024 */
    scale?: number;
  }

  /**
   * 将 PDF 文件转换为图像
   * @param file PDF 文件路径
   * @param options 转换选项
   */
  export function convert(
    file: string,
    options?: ConvertOptions
  ): Promise<void>;

  /**
   * 获取 PDF 文件元信息
   * @param file PDF 文件路径
   */
  export function info(file: string): Promise<Record<string, unknown>>;

  /**
   * 将 PDF 文件转换为图像 Buffer 数组（内存操作）
   * @param file PDF 文件路径
   * @param options 转换选项
   */
  export function imgdata(
    file: string,
    options?: ConvertOptions
  ): Promise<Buffer[]>;

  /** poppler 工具的可执行文件路径 */
  export const path: string;

  /** child_process.spawn 的执行选项 */
  export const exec_options: Record<string, unknown>;
}
