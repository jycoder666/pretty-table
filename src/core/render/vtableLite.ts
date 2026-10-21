/**
 * T34 · VTable lite 深入口：绕开 `@visactor/vtable` 全量 index 入口
 * （连带 PivotTable / PivotChart / 图表格注册 → vrender-components 图表依赖进包）。
 *
 * 选用 plain `es/ListTable` + 手工注册「构造期必需」组件（对照 es/ListTable-all 的注册清单，
 * 剔除 chart / sparkline / audio / video / switch / animation 重依赖项）：
 * - tooltipHandler / menuHandler / title / emptyTip：BaseTable 组件层构造即取用
 * - registerTextCell：文本格 createTextCellGroup（本应用单元格 = 文本 + customLayout 图片格）
 * - registerCustomCellStylePlugin：ListTable-all 同款插件（低成本，行为对齐全量版）
 *
 * 实测（chromium）：经完整导出链路验证（e2e/png-threshold.spec.ts）。
 */
import { Factory } from '@visactor/vtable/es/core/factory'
import { ListTable } from '@visactor/vtable/es/ListTable'
import { EmptyTip } from '@visactor/vtable/es/components/empty-tip/empty-tip'
import { MenuHandler } from '@visactor/vtable/es/components/menu/dom/MenuHandler'
import { Title } from '@visactor/vtable/es/components/title/title'
import { TooltipHandler } from '@visactor/vtable/es/components/tooltip/TooltipHandler'
import { registerCustomCellStylePlugin } from '@visactor/vtable/es/plugins/custom-cell-style'
import { createCellGroup as createTextCellGroup } from '@visactor/vtable/es/scenegraph/group-creater/cell-type/text-cell'
// P1：图片格绘制通道（vrender Group/Image 工厂）与 VTable 同 chunk 装载（侧效注册）
import '../adapter/imageDrawVRender'

Factory.registerComponent('tooltipHandler', TooltipHandler)
Factory.registerComponent('menuHandler', MenuHandler)
Factory.registerComponent('title', Title)
Factory.registerComponent('emptyTip', EmptyTip)
// 等价 es/scenegraph/group-creater/cell-type 的 registerTextCell()；不走其 index
// （index 连带 chart/sparkline/video/audio 单元格注册 → 图表运行时进包）
Factory.registerFunction('createTextCellGroup', createTextCellGroup)
registerCustomCellStylePlugin()

export { ListTable }
