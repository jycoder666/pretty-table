/**
 * T-slim lever3 · `vtable/es/scenegraph/graphic/contributions/vchart-graphic-picker.js` 的
 * 构建期桩（经 contributions/index.js 的 DI 绑定面进图，同 chartRenderContributionStub）。
 *
 * 真身 VChartPicker 为 chart 格的拾取贡献（@injectable 装饰，经
 * bind(CanvasPickerContribution).toService(VChartPicker) 挂入多绑定）；vrender 拾取注册表
 * 按 graphic type 过滤，无 chart 格时永不被选中。真身 import 的 CHART_NUMBER_TYPE
 * （../chart，即 graphic/chart.js 285 行 Chart 类）随本桩从图内消失。
 * 禁止任何 @visactor 导入。
 */

/** 可绑定空类：DI `bind(X).toSelf().inSingletonScope()` 需要构造器；无 chart 格永不被解析 */
export class VChartPicker {}
