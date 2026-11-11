/**
 * T-slim v2 · vrender-kits `picker/contributions/canvas-picker/richtext-module` 的
 * 构建期桩（见 vite.config.ts `pt-vtable-browser-env-only` 的重定向）。
 *
 * 原模块 bindRichtextCanvasPickerContribution 向 DI 容器绑定
 * DefaultCanvasRichTextPicker（richtext 命中检测器，`AABBBounds.containsPoint`）。
 * 消费点（全域探针实查，均在 @visactor/vrender-kits/es 内）：
 * installers/browser.js（本应用 shims 经 installBrowserPickersToApp 实际调用）/
 * installers/app.js（installDefaultGraphicsToApp 等 Barrel 死代码）/ register/register-richtext.js
 * （本招已桩）。桩后 pickerMap 无 richtext 项，pickItem 对 RichText 返回 null
 * （canvas-picker-service.js:32 `if (!picker) return null`，无抛错路径）。
 *
 * 本应用表格单元格从不产生 RichText 图形（无 sort/icons/textConfig，vrender-components
 * 全域无 `new RichText`），命中检测路径零触发；vtable event.js 的
 * `target.pickIcon` 走图形自身方法，不经 picker service，不受影响。
 *
 * 桩为纯 no-op，禁止任何 @visactor 导入——否则 richtext picker 子树重新进包。
 */
export function bindRichtextCanvasPickerContribution(): void {}
