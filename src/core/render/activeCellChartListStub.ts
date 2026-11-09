/**
 * T-slim lever3 · `vtable/es/scenegraph/graphic/active-cell-chart-list.js` 的构建期桩（见
 * vite.config.ts `pt-vtable-browser-env-only` 的重定向，仅命中 scenegraph/scenegraph.js）。
 *
 * 图内消费点（导入面清单 grep 实证）：scenegraph.js:81 取 {clearAndReleaseBrushingChartInstance,
 * getBrushingChartInstance, getBrushingChartInstanceCellPos}，调用点 scenegraph.js:452-454——
 * 先双读 brushingChartInstanceCellPos/brushingChartInstance 且要求两者同时为真才走 clear 路径；
 * 本应用无 chart 格，brushingChartInstance 恒 undefined，clear 路径不可达，getter 直读字段即
 * 与真身逐位一致。refresh-node/update-chart.js:9 的 getBrushingChartInstanceCellPos 随其自身
 * 桩化消失。
 *
 * 其余导出仅 graphic/chart.js / pivot-header-layout.js / PivotChart.js 消费（不在图内）；
 * 桩按「无 chart 实例」语义逐行对齐真身：实例表为空时真身的遍历/删除均为空操作，等价于
 * 旗标与字段的复位。字段名（brushingChartInstance / brushingChartInstanceCellPos /
 * disabledTooltipToAllChartInstances / delayRunDimensionHoverTimer*）与真身一一对应。
 * 禁止任何 @visactor 导入。
 */

/** 真身操作所及的 scenegraph 字段面（scenegraph.js 构造期初始化同名字段） */
interface ChartScenegraphHost {
  brushingChartInstance?: unknown
  brushingChartInstanceCellPos?: { col: number; row: number }
  disabledTooltipToAllChartInstances?: boolean
  delayRunDimensionHoverTimerForColumnDirection?: unknown[]
  delayRunDimensionHoverTimerForRowDirection?: unknown[]
  delayRunDimensionHoverTimerForViewRange?: unknown[]
}

export function setBrushingChartInstance(
  chartInstance: unknown,
  col: number,
  row: number,
  scenegraph: ChartScenegraphHost,
): void {
  scenegraph.brushingChartInstance = chartInstance
  scenegraph.brushingChartInstanceCellPos = { col, row }
}

export function clearBrushingChartInstance(scenegraph: ChartScenegraphHost): void {
  scenegraph.brushingChartInstance = undefined
  scenegraph.brushingChartInstanceCellPos = { col: -1, row: -1 }
}

/**
 * 真身：enableTooltipToAllChartInstances（旗标复位 + 空实例表遍历）→ 释放 cell 内 chart
 * （无 chart 格不达）→ 清两张实例表（空表）→ 复位 instance/pos。无 chart 时等价于下面的
 * 三行复位。
 */
export function clearAndReleaseBrushingChartInstance(scenegraph: ChartScenegraphHost): void {
  scenegraph.disabledTooltipToAllChartInstances = false
  scenegraph.brushingChartInstance = undefined
  scenegraph.brushingChartInstanceCellPos = { col: -1, row: -1 }
}

export function getBrushingChartInstance(scenegraph: ChartScenegraphHost): unknown {
  return scenegraph.brushingChartInstance
}

export function getBrushingChartInstanceCellPos(scenegraph: ChartScenegraphHost): { col: number; row: number } | undefined {
  return scenegraph.brushingChartInstanceCellPos
}

/** 真身按可视区收集 chart 实例；无 chart 格 → 空表 */
export function generateChartInstanceListByColumnDirection(
  _col: unknown,
  _dimensionValueOrXValue: unknown,
  _positionValueOrYValue: unknown,
  _canvasXY: unknown,
  _table: unknown,
  _hideTooltip?: boolean,
  _isScatter?: boolean,
): unknown[] {
  return []
}

export function generateChartInstanceListByRowDirection(
  _row: unknown,
  _dimensionValueOrXValue: unknown,
  _positionValueOrYValue: unknown,
  _canvasXY: unknown,
  _table: unknown,
  _hideTooltip?: boolean,
  _isScatter?: boolean,
): unknown[] {
  return []
}

export function generateChartInstanceListByViewRange(_datum: unknown, _table: unknown, _deactivate?: boolean): unknown[] {
  return []
}

/** 真身遍历实例表逐个 release；无 chart 格 → 空表遍历 = no-op */
export function clearChartInstanceListByColumnDirection(
  _col: unknown,
  _excludedRow: unknown,
  _table: unknown,
  _forceRelease?: boolean,
): void {}

export function clearChartInstanceListByRowDirection(
  _row: unknown,
  _excludedCol: unknown,
  _table: unknown,
  _forceRelease?: boolean,
): void {}

function clearTimers(list: unknown[] | undefined): void {
  if (!list) return
  for (const timer of list) clearTimeout(timer as ReturnType<typeof setTimeout>)
  list.length = 0
}

/** 以下 4 个与真身逐行对应（clearTimeout + 清空数组；字段未初始化时真身同样不可达） */
export function clearDelayRunDimensionHoverTimerForColumnDirection(scenegraph: ChartScenegraphHost): void {
  clearTimers(scenegraph.delayRunDimensionHoverTimerForColumnDirection)
}

export function clearDelayRunDimensionHoverTimerForRowDirection(scenegraph: ChartScenegraphHost): void {
  clearTimers(scenegraph.delayRunDimensionHoverTimerForRowDirection)
}

export function clearDelayRunDimensionHoverTimerForViewRange(scenegraph: ChartScenegraphHost): void {
  clearTimers(scenegraph.delayRunDimensionHoverTimerForViewRange)
}

export function clearDelayRunDimensionHoverTimers(scenegraph: ChartScenegraphHost): void {
  clearDelayRunDimensionHoverTimerForColumnDirection(scenegraph)
  clearDelayRunDimensionHoverTimerForRowDirection(scenegraph)
  clearDelayRunDimensionHoverTimerForViewRange(scenegraph)
}

export function clearAllChartInstanceList(_table: unknown, _forceRelease?: boolean): void {}

export function isDisabledTooltipToAllChartInstances(scenegraph: ChartScenegraphHost): boolean {
  return scenegraph.disabledTooltipToAllChartInstances === true
}

/** 真身：置位 + 清延时器 + 空实例表遍历 */
export function disableTooltipToAllChartInstances(scenegraph: ChartScenegraphHost): void {
  scenegraph.disabledTooltipToAllChartInstances = true
  clearDelayRunDimensionHoverTimers(scenegraph)
}

/** 真身：复位 + 空实例表遍历 */
export function enableTooltipToAllChartInstances(scenegraph: ChartScenegraphHost): void {
  scenegraph.disabledTooltipToAllChartInstances = false
}
