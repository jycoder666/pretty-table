/**
 * T-slim v2 招1 · vrender-core `graphic/richtext.js`（RichText 类 + createRichText）的
 * 构建期桩（见 vite.config.ts `pt-vtable-browser-env-only` 的重定向）。
 *
 * 图内进图链（v2 探针实测）：register/register-richtext 链与本桩之前的 picker 链已断，
 * RichText 类本体仍被 vtable `scenegraph/layout/compute-row-height.js:29` 顶层的
 * `const utilRichTextMark = new RichText({width:0,height:0,textConfig:[]})` 静态钉住
 * （连带 graphic/richtext/{frame,paragraph,utils,line,wrapper,icon} 6 文件 ≈8KB gzip）。
 * 该实例仅在「单元格 inline 图标（define.icon/tree/dragOrder → inlineFront/inlineEnd）
 * + autoWrapText」分支被 setAttributes/AABBBounds 使用；本应用全域无 sort/icons/
 * textConfig/tree 配置（src/ + 种子 JSON grep 实查），分支零触达。其余消费面：
 * text-icon-layout/cell-content/event 的 `instanceof RichText` 分支与 `new RichText`
 * （inline 图标单元格内容构造）——同样依赖 inline 图标配置，零触达。
 *
 * 桩 = Graphic 基类（`@visactor/vrender-core/graphic/base`，exports 放行子路径）直接
 * 子类：bounds/attributes/节点树/事件机器全保留，仅富文本帧布局引擎
 * （frame/paragraph/utils/line/wrapper/icon）不进包。numberType 不设（pickerMap 查找
 * 无此键提前返回 null，与 richtext picker 桩语义一致）。
 *
 * 导出面与原模块严格一致（仅 RichText / createRichText 两名，graphic/index.js 与
 * core index.js 经 Barrel 透传给 vtable barrel）。禁止任何 @visactor/vrender-kits、
 * @visactor/vrender-core/graphic/richtext 导入——否则帧布局引擎重新进包。
 */
import { Graphic } from '@visactor/vrender-core/graphic/base'

export class RichText extends Graphic {
  constructor(params?: Record<string, unknown>) {
    super(params)
    this.type = 'richtext'
  }
}

export function createRichText(attributes?: Record<string, unknown>): RichText {
  return new RichText(attributes)
}
