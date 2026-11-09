/**
 * T00 · vrenderAppBrowser.ts 消费的 @visactor/vrender* 传递依赖子路径的类型声明。
 *
 * pnpm 严格隔离下项目 node_modules 没有这些包的直接入口（src 不放行解析），
 * 运行时 import 由 vite.config.ts 的 pt-vtable-browser-env-only 插件借 vtable 包
 * 上下文代解析；本文件只为 vue-tsc 提供最小类型面（真实 d.ts 与此一致，
 * 见 node_modules/.pnpm/@visactor+vrender@1.1.12/.../es/entries/shared-browser.d.ts）。
 * 全仓消费点仅 vrenderAppBrowser.ts 一处（grep 实查），无覆盖冲突。
 *
 * 注意：本文件必须保持为脚本（顶层无 import/export），`declare module` 才是
 * 环境声明——对无法解析的说明符生效；一旦变成模块文件就退化为模块增强。
 */

type ShimApp = import('@visactor/vtable/es/vrender').IApp

/** vrender 运行时安装器的绑定上下文（runtime-installer getRuntimeInstallerBindingContext 返回面，按需最小化） */
interface TVRenderBindingContext {
  bind: (identifier: unknown, ...rest: unknown[]) => unknown
  isBound: (identifier: unknown) => boolean
}

/** vrender-core graphic module（bindModule 步骤传入 { bind } 的函数） */
type TVRenderGraphicModule = (context: { bind: TVRenderBindingContext['bind'] }) => void

/** BaseTable/IApp 上的 legacy 渲染器/拾取器注册表宿主（bootstrap-utils syncLegacy* 使用面） */
interface TVRenderRegistryHost {
  registry: {
    renderer: { register: (key: string, renderer: unknown) => void; unregister?: (key: string) => void }
    picker: { register: (key: string, picker: unknown) => void; unregister?: (key: string) => void }
  }
}

/** vrender 服务标识（GraphicRender / CanvasPickerContribution 等 getLegacyBindingContext().getAll 入参） */
interface TVRenderServiceIdentifier {
  readonly __vrenderServiceId: 'service-identifier'
}

declare module '@visactor/vrender/entries/shared-browser' {
  export interface TVRenderSharedAppHandle {
    app: ShimApp
    release: () => void
  }
  export interface TVRenderSharedBrowserAppOptions {
    env?: 'browser'
    envParams?: unknown
    key?: string
  }
  export function acquireSharedVRenderApp(options?: TVRenderSharedBrowserAppOptions): TVRenderSharedAppHandle
}

declare module '@visactor/vrender-components' {
  export function installPoptipToApp(app: ShimApp, envParams?: unknown): void
}

declare module '@visactor/vrender-kits/installers/browser' {
  export function installBrowserEnvToApp(app: ShimApp, envParams?: unknown): void
  export function installBrowserPickersToApp(app: ShimApp): void
}

declare module '@visactor/vrender-kits/env/browser' {
  export function loadBrowserEnv(): void
}

// ── T-slim lever2：精选 bootstrap（vrenderSharedBrowserLite / vrenderGraphicsInstallerLite）消费面 ──

declare module '@visactor/vrender-core/entries/browser' {
  export function createBrowserApp(options?: Record<string, unknown>): ShimApp
}

declare module '@visactor/vrender-core/entries/runtime-installer' {
  export function configureRuntimeApplicationForApp(app: ShimApp): void
  export function getRuntimeInstallerBindingContext(): TVRenderBindingContext
  export function installRuntimeDrawContributionsToApp(app: ShimApp): void
  export function installRuntimeGraphicRenderersToApp(app: ShimApp): void
  export function refreshRuntimeInstallerContributions(): void
}

declare module '@visactor/vrender-core/register/graphic' {
  export function registerArcGraphic(): void
  export function registerAreaGraphic(): void
  export function registerCircleGraphic(): void
  export function registerGlyphGraphic(): void
  export function registerGroupGraphic(): void
  export function registerImageGraphic(): void
  export function registerLineGraphic(): void
  export function registerPathGraphic(): void
  export function registerPolygonGraphic(): void
  export function registerRectGraphic(): void
  export function registerShadowRootGraphic(): void
  export function registerStarGraphic(): void
  export function registerSymbolGraphic(): void
  export function registerTextGraphic(): void
  export function registerWrapTextGraphic(): void
}

declare module '@visactor/vrender-core/graphic/modules' {
  export const arcModule: TVRenderGraphicModule
  export const areaModule: TVRenderGraphicModule
  export const circleModule: TVRenderGraphicModule
  export const glyphModule: TVRenderGraphicModule
  export const imageModule: TVRenderGraphicModule
  export const lineModule: TVRenderGraphicModule
  export const pathModule: TVRenderGraphicModule
  export const polygonModule: TVRenderGraphicModule
  export const rectModule: TVRenderGraphicModule
  export const starModule: TVRenderGraphicModule
  export const symbolModule: TVRenderGraphicModule
  export const textModule: TVRenderGraphicModule
}

declare module '@visactor/vrender-core/plugin/flex-layout' {
  export function registerFlexLayoutPlugin(): void
}

declare module '@visactor/vrender-core/plugin/attribute' {
  export function registerHtmlAttributePlugin(): void
  export function registerReactAttributePlugin(): void
}

declare module '@visactor/vrender-core/legacy/bootstrap' {
  export function getLegacyBindingContext(): { getAll(identifier: TVRenderServiceIdentifier): unknown[] }
}

declare module '@visactor/vrender-core/render/symbol' {
  export const GraphicRender: TVRenderServiceIdentifier
}

declare module '@visactor/vrender-kits/register/register-arc' {
  export function registerArc(): void
}

declare module '@visactor/vrender-kits/register/register-area' {
  export function registerArea(): void
}

declare module '@visactor/vrender-kits/register/register-circle' {
  export function registerCircle(): void
}

declare module '@visactor/vrender-kits/register/register-glyph' {
  export function registerGlyph(): void
}

declare module '@visactor/vrender-kits/register/register-group' {
  export function registerGroup(): void
}

declare module '@visactor/vrender-kits/register/register-image' {
  export function registerImage(): void
}

declare module '@visactor/vrender-kits/register/register-line' {
  export function registerLine(): void
}

declare module '@visactor/vrender-kits/register/register-path' {
  export function registerPath(): void
}

declare module '@visactor/vrender-kits/register/register-polygon' {
  export function registerPolygon(): void
}

declare module '@visactor/vrender-kits/register/register-rect' {
  export function registerRect(): void
}

declare module '@visactor/vrender-kits/register/register-shadowRoot' {
  export function registerShadowRoot(): void
}

declare module '@visactor/vrender-kits/register/register-star' {
  export function registerStar(): void
}

declare module '@visactor/vrender-kits/register/register-symbol' {
  export function registerSymbol(): void
}

declare module '@visactor/vrender-kits/register/register-text' {
  export function registerText(): void
}

declare module '@visactor/vrender-kits/register/register-wraptext' {
  export function registerWrapText(): void
}

declare module '@visactor/vrender-kits/picker/contributions/constants' {
  export const CanvasPickerContribution: TVRenderServiceIdentifier
}

declare module '@visactor/vrender/entries/runtime-contribution' {
  export function installPendingRuntimeContributionModulesToApp(app: ShimApp): void
  export function installRuntimeContributionModule(module: unknown, options?: Record<string, unknown>): void
}
