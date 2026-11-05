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
}

declare module '@visactor/vrender-kits/env/browser' {
  export function loadBrowserEnv(): void
}
