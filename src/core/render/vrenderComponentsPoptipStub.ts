/**
 * T-slim v2 招2 · `@visactor/vrender-components` poptip 子树的构建期桩
 * （见 vite.config.ts `pt-vtable-browser-env-only` 的重定向）。
 *
 * poptip 子树（PopTip 组件 + PopTipRenderContribution + PopTipPlugin /
 * PopTipForClipedTextPlugin + register/theme）经全图唯二入图口进包：
 * ① vtable/es/vrender.js `registerForVrender()` → `loadPoptip()`（barrel 裸说明符）；
 * ② vrenderAppBrowser.ts `installPoptipToApp(app)`（barrel 裸说明符）。
 * 两口都落在 vrender-components/es/index.js 的两行 re-export
 * （`export * from "./poptip"` + `export { loadPoptip } from "./poptip/module"`），
 * 本重定向把这两行指向本桩，整个 poptip 目录离开产物图。
 *
 * 图内消费面（全域探针实查）仅三名，桩全 no-op：
 * - loadPoptip：vtable registerForVrender 顶层调用（原版 bindPoptip 双容器绑定 +
 *   refreshRuntimeInstallerContributions），本应用单元格零 poptip 图形，绑定内容
 *   零调用路径；
 * - installPoptipToApp：vrenderAppBrowser shim activateBrowserEnv 调用。原版
 *   `configureRuntimeApplicationForApp → bindPoptip(runtime) → refreshRuntimeInstaller
 *   Contributions → installRuntimeGraphicRenderersToApp` 四步中，除 bindPoptip 外
 *   三步在本应用 bootstrap（vrenderGraphicsInstallerLite.installCuratedGraphicsToApp，
 *   先于本调用执行）已按同序完成，且均为按当前绑定面枚举/装配的操作，poptip 绑定
 *   不存在时重复执行无增量，跳过无行为差异；
 * - setPoptipTheme：vtable scenegraph.js 按 theme.textPopTipStyle 合并 poptip 主题
 *   （原版 merge(theme.poptip, ...)，纯主题对象写入），poptip 组件不存在后无消费方。
 *
 * 行为差异（有意为之）：裁剪文本格 hover 气泡（"poptipForText" 插件）不再可用——
 * 本应用表格交互面（点选/描边/滚动/导出）不经过该插件；scenegraph.js 对
 * "poptipForText" 的 findPluginsByName 查询在插件未注册时返回空数组，forEach 天然
 * no-op，无抛错路径。
 *
 * 桩为纯 no-op，禁止任何 @visactor 导入——否则 poptip 子树重新进包。
 * tag/scrollbar/title/checkbox 等 barrel 兄弟子树仍被 vtable 组件消费，不在本桩范围。
 */

/** vtable registerForVrender 注册链的 poptip 装载（原版为 DI 容器绑定，应用零触达） */
export function loadPoptip(): void {}

/** vrenderAppBrowser shim 的 poptip 安装（原版通用安装步由 installCuratedGraphicsToApp 先行完成） */
export function installPoptipToApp(_app: unknown): void {}

/** vtable scenegraph.js 的 poptip 主题合并（原版 merge(theme.poptip, ...)，poptip 移除后无消费方） */
export function setPoptipTheme(_defaultPoptipTheme?: unknown): void {}
