/**
 * T-slim lever3 · `vtable/es/layout/chart-helper/get-chart-spec.js` 的构建期桩（见
 * vite.config.ts `pt-vtable-browser-env-only` 的重定向，仅命中 layout/simple-header-layout.js）。
 *
 * 图内消费点（导入面清单 grep 实证）：simple-header-layout.js:7 取 {checkHasChart, getChartDataId}；
 * 其余导出（getRawChartSpec/getChartSpec/getChartAxes 等）仅 pivot-header-layout.js / PivotChart.js
 * 消费，均不在 ListTable 应用图内（layout/index.js 仅再导出 SimpleHeaderLayoutMap；dist 无
 * PivotHeaderLayoutMap 标记）。
 *
 * 桩语义（无 chart 列下的逐位等价）：
 * - checkHasChart：真身遍历 layout.columnObjects 找 chartSpec——本应用列定义永不携带
 *   chartSpec，恒 false；ask 明确「checkHasChart 必须恒 false」。
 * - getChartDataId：真身读 chartSpec.data.id；无 chart 语义值为 undefined。
 * - 其余导出按「无 chart」语义返回 false/undefined，签名与原文件对齐。
 * 禁止任何 @visactor 导入。
 */

/** 真身遍历 layout.columnObjects 查 chartSpec；本应用无 chart 列 → 恒 false */
export function checkHasChart(_layout: unknown): boolean {
  return false
}

/**
 * 真身读 layout.getRawChartSpec(col,row)?.data.id。SimpleHeaderLayoutMap 未定义
 * getRawChartSpec（仅 PivotHeaderLayoutMap 有），ListTable 流程不可达；返回 undefined
 * 即无 chart 语义值。
 */
export function getChartDataId(_col: unknown, _row: unknown, _layout: unknown): undefined {
  return undefined
}

export function getRawChartSpec(_col: unknown, _row: unknown, _layout: unknown): undefined {
  return undefined
}

export function isShareChartSpec(_col: unknown, _row: unknown, _layout: unknown): boolean {
  return false
}

export function isNoChartDataRenderNothing(_col: unknown, _row: unknown, _layout: unknown): boolean {
  return false
}

export function checkHasCartesianChart(_indicatorsDefine: unknown): boolean {
  return false
}

export function isCartesianChart(_col: unknown, _row: unknown, _layout: unknown): boolean {
  return false
}

export function isHasCartesianChartInline(
  _col: unknown,
  _row: unknown,
  _checkDirection: unknown,
  _layout: unknown,
): boolean {
  return false
}

export function getChartSpec(_col: unknown, _row: unknown, _layout: unknown): undefined {
  return undefined
}

export function getChartAxes(_col: unknown, _row: unknown, _layout: unknown): undefined {
  return undefined
}
