/** Shared system font stack for preview / PNG / HTML (GC-8). */
export const FONT_STACK =
  '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Segoe UI", sans-serif'

/**
 * Schema 1.3：衬线栈（系统自带，不内嵌字体文件守门首屏体积）。
 * 消费点：layout.style.fontFamily='serif'（表格）与 poster.titleFont='serif'（海报标题）。
 */
export const FONT_STACK_SERIF =
  '"Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, Georgia, serif'

/** 字体族解析单点：'serif' → 衬线栈，其余（含缺省）→ 无衬线栈 */
export function fontStackOf(family: 'sans' | 'serif' | undefined): string {
  return family === 'serif' ? FONT_STACK_SERIF : FONT_STACK
}
