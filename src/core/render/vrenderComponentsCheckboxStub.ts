/**
 * T-slim v2 招3 · `@visactor/vrender-components` checkbox 子树的构建期桩
 * （见 vite.config.ts `pt-vtable-browser-env-only` 的重定向）。
 *
 * 原子树（CheckBox 组件 + loadCheckBoxComponent 顶层副作用 + checkSvg/indeterminateSvg
 * 内联 SVG 常量）经 vrender-components/es/index.js 的 `export * from "./checkbox"`
 * 一行进包；图内唯一把名字钉住的消费方是 vtable 自有文件：
 * - scenegraph/component/checkbox-content.js（`instanceof CheckBox` 两处——实例恒不存在
 *   时 instanceof 恒假、分支天然 no-op）；
 * - scenegraph/group-creater/cell-type/checkbox-cell.js:181 `new CheckBox(...)`——仅
 *   cellType:'checkbox' 列渲染时触达。
 *
 * 本应用全仓（src/**、tables/*.json、模板 schema）零 cellType 用法（全域探针实查，
 * 唯一 "cellType" 字样出现在既有 updateChartStub 头注释），checkbox 单元格渲染路径
 * 永不触发；vtable 侧 checkbox-cell/checkbox-content/state 代码不在本桩范围（仍被
 * scenegraph/state 引用，本招不动）。
 *
 * 桩为纯 no-op 空类（同名同可构造性），禁止任何 @visactor 导入——否则 checkbox
 * 子树重新进包。
 */

/** 图内仅存 `instanceof CheckBox`（恒假）与 checkbox 列渲染路径的 `new CheckBox`（永不触发） */
export class CheckBox {
  constructor(
    _attributes?: Record<string, unknown>,
    _options?: { skipDefault?: boolean },
  ) {}
}
