/**
 * T-slim lever3 · `vtable/es/scenegraph/refresh-node/update-chart.js` 的构建期桩（见
 * vite.config.ts `pt-vtable-browser-env-only` 的重定向，仅命中 scenegraph/scenegraph.js）。
 *
 * 图内消费点（导入面清单 grep 实证）：scenegraph.js:51 取 {clearCellChartCacheImage,
 * updateChartSizeForResizeColWidth, updateChartSizeForResizeRowHeight, updateChartState}。
 * 真身行为 = 遍历可视区 cell 找 type==='chart' 节点操作 cacheCanvas/尺寸/状态；chart 节点
 * 仅由 createChartCellGroup 创建（仅 cell-type/index.js 注册，vtableLite 只注册
 * createTextCellGroup，本应用列定义亦无 cellType:'chart'）→ 图内永无 chart 节点，
 * 真身遍历恒为空操作，no-op 桩逐位等价。updateChartState 真身首行
 * `if (table.isPivotChart())` 直接 return——ListTable 下同样恒空操作。
 *
 * 其余导出（clearChartCacheImage/updateChartData）仅 PivotChart.js 与
 * event/self-event-listener/pivot-chart/axis-click.js 消费，不在图内。
 * 禁止任何 @visactor 导入。
 */

/** 真身遍历可视区列找 chart 节点重算尺寸；无 chart 节点 → 空遍历 = no-op */
export function updateChartSizeForResizeColWidth(_scenegraph: unknown, _col: unknown): void {}

/** 真身遍历可视区行找 chart 节点重算尺寸；无 chart 节点 → 空遍历 = no-op */
export function updateChartSizeForResizeRowHeight(_scenegraph: unknown, _row: unknown): void {}

/** 真身清 brushing cell 之外全部 chart 节点 cacheCanvas；无 chart 节点 → no-op */
export function clearChartCacheImage(_scenegraph: unknown): void {}

/** 真身清指定 cell 的 chart 节点 cacheCanvas；无 chart 节点 → no-op */
export function clearCellChartCacheImage(_col: unknown, _row: unknown, _scenegraph: unknown): void {}

/** 真身向 chart 实例同步 records；无 chart 实例 → no-op */
export function updateChartData(_scenegraph: unknown): void {}

/** 真身首行 isPivotChart() 守卫——ListTable 恒直接 return，逐位等价 */
export function updateChartState(_scenegraph: unknown, _datum: unknown, _selectedDataMode: unknown): void {}
