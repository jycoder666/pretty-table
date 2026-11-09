/**
 * T-slim lever3 · `vtable/es/scenegraph/graphic/contributions/chart-render-helper.js` 的构建期桩
 * （见 vite.config.ts 重定向，仅命中 ListTable.js:41）。
 *
 * 图内消费点（全域探针 grep 实证）：ListTable.js:41 取 { clearChartRenderQueue }（列表表更新/
 * 释放路径清空 chart 渲染队列）。真身队列 chartRenderKeys/chartRenderQueueList 仅由 renderChart/
 * startRenderChartQueue 填充——那些只在 chart 格渲染（createChartCellGroup）时被调用，本应用
 * 无 chart 格 → 队列恒空，clearChartRenderQueue no-op 与真身逐位等价。
 *
 * 其余导出（renderChart/startRenderChartQueue/cacheStageCanvas 等）仅 graphic/chart.js 与
 * contributions/chart-render.js / vchart-graphic-picker.js 消费（全域探针证实不在图内），
 * 桩按无 chart 语义补齐签名。renderChart 真身会 new VChart 实例（ClassType 来自 chart
 * attribute，本应用永不注册）——桩杜绝该路径。禁止任何 @visactor 导入。
 */

/** 真身为模块级可变 let 绑定；无 chart 渲染时恒为空数组 */
export const chartRenderKeys: unknown[] = []
export const chartRenderQueueList: unknown[] = []

/** 真身常量 false（开关位） */
export const cancelRenderChartQueue = false

export function setBatchRenderChartCount(_count: unknown): void {}

/** 真身清空队列并取消 RAF；空队列下等价 no-op */
export function clearChartRenderQueue(): void {}

export function IsHandlingChartQueue(): boolean {
  return false
}

/** 真身 new VChart 并 renderSync；无 chart 格不可达，桩杜绝该路径 */
export function renderChart(_chart: unknown): void {}

export function startRenderChartQueue(_table: unknown): void {}

export function cacheStageCanvas(_stage: unknown, _chart: unknown): void {}
