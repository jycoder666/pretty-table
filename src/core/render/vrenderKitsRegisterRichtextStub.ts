/**
 * T-slim v2 · `@visactor/vrender-kits/register/register-richtext` 的构建期桩
 * （见 vite.config.ts `pt-vtable-browser-env-only` 的重定向）。
 *
 * 原模块本体是一个带顶层副作用的函数对象（`_registerRichtext.__loaded = !1`），
 * 该副作用语句把整个 richtext 注册链静态顶进产物图：vrender-kits register-richtext
 * → vrender-core registerRichtextGraphic（graphic/richtext.js 全家）+ richtextModule
 * （render/contributions/render/richtext-module.js → richtext-render.js）+
 * math-picker/richtext-module（math-picker/richtext-picker）。进图入口仅
 * vrender-kits/es/index-node.js 的 `export * from "./register/register-richtext"`
 * （vtable/es/vrender.js `export * from "@visactor/vrender-kits"` 链路）；
 * 函数体内注册逻辑在图内零调用（原调用点 bootstrap-common.js 不在本应用图内，
 * 见 vrenderSharedBrowserLite.ts 精选 bootstrap）。
 *
 * 本应用单元格从不产生 RichText 内联图标/富文本（无 sort、无 icons、无 textConfig，
 * 探针实查），注册内容零调用路径；RichText 类本身仍由 vtable compute-row-height.js
 * 顶层 `new RichText` 钉住、行为不受影响（bounds 计算为纯几何布局，不依赖本注册链）。
 *
 * 桩为纯 no-op，禁止任何 @visactor 导入——否则 richtext 注册链重新进包。
 */
export function registerRichtext(): void {}
