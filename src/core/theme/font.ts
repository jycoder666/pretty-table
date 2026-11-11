/** Shared system font stack for preview / PNG / HTML (GC-8). */
export const FONT_STACK =
  '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Segoe UI", sans-serif'

/**
 * 衬线字体栈（'serif' 强调 mark 专用，2026-11-10）：预览画布与 HTML 内联双链路同源。
 * 字体栈不算色值（check:colors 红线不受影响）；零新增依赖，全部回落系统衬线。
 */
export const SERIF_FONT_STACK =
  '"Noto Serif SC","Source Han Serif SC",Georgia,"SimSun",serif'
