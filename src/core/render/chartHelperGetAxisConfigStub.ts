/**
 * T-slim lever3 · `vtable/es/layout/chart-helper/get-axis-config.js` 的构建期桩（见
 * vite.config.ts `pt-vtable-browser-env-only` 的重定向，仅命中 core/style-helper.js）。
 *
 * 图内消费点（导入面清单 grep 实证）：core/style-helper.js:1 取 {isLeftOrRightAxis,
 * isTopOrBottomAxis}，调用点 style-helper.js:26-28 均被 `table.isPivotChart() &&` 守卫。
 * 真身两函数首行即 `if (!layout._table.isPivotChart()) return false`——本应用 ListTable
 * 恒非 PivotChart，**桩返回 false 与真身逐位等价**（非 probe 近似，是精确复刻）。
 *
 * 其余导出仅 get-chart-spec.js（已同批桩化）/ components/index.js / graphic/chart.js /
 * PivotChart.js 消费，均不在 ListTable 应用图内；按无 chart 语义返回 false/undefined。
 * 禁止任何 @visactor 导入。
 */

export function isTopOrBottomAxis(_col: unknown, _row: unknown, _layout: unknown): boolean {
  return false
}

export function isLeftOrRightAxis(_col: unknown, _row: unknown, _layout: unknown): boolean {
  return false
}

export function getAxisConfigInPivotChart(_col: unknown, _row: unknown, _layout: unknown): undefined {
  return undefined
}

export function getAxisOption(_col: unknown, _row: unknown, _orient: unknown, _layout: unknown): undefined {
  return undefined
}

export function getAxisRange(
  _collectedValues: unknown,
  _indicatorKeys: unknown,
  _isZeroAlign: unknown,
  _colPath: unknown,
  _seriesId: unknown,
): undefined {
  return undefined
}

export function hasLinearAxis(
  _spec: unknown,
  _tableAxesConfig: unknown,
  _isHorizontal: unknown,
  _isThisXAxis: unknown,
): boolean {
  return false
}

export function getAxisRangeAndTicks(
  _col: unknown,
  _row: unknown,
  _index: unknown,
  _position: unknown,
  _subAxisPosition: unknown,
  _indicatorKeys: unknown,
  _path: unknown,
  _layout: unknown,
): undefined {
  return undefined
}
