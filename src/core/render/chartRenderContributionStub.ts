/**
 * T-slim lever3 · `vtable/es/scenegraph/graphic/contributions/chart-render.js` 的构建期桩
 * （经 contributions/index.js 的 DI 绑定面进入图内——该 index 由 installVTableRuntimeContributions
 * 安装，是渲染贡献承重墙，必须保留真身；仅图表贡献桩化）。
 *
 * 桩面：ChartRender / ChartRenderContribution 与真身同 `Symbol.for` 键（DI 绑定标识不变），
 * DefaultCanvasChartRender 为可绑定空类——vrender 渲染注册表按 graphic type 过滤贡献，
 * 本应用无 chart 格，该贡献永不被选中；真身首行 `bind(GraphicRender).to(DefaultCanvasChartRender)`
 * 仅是多绑定候选之一。真身的 renderChart 队列消费（chart-render-helper）随本桩消失。
 * 禁止任何 @visactor 导入。
 */

/** 与真身同 Symbol.for 键的 DI 服务标识（contributions/index.js bind 用） */
export const ChartRender = Symbol.for('ChartRender')

export const ChartRenderContribution = Symbol.for('ChartRenderContribution')

/** 可绑定空类：DI `bind(X).toSelf().inSingletonScope()` 需要构造器；无 chart 格永不被解析 */
export class DefaultCanvasChartRender {}
