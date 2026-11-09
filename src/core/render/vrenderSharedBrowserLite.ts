/**
 * T-slim lever2 · `@visactor/vrender/entries/shared-browser` 的精选复刻（构建期重定向，
 * 见 vite.config.ts；消费点 vrenderAppBrowser.ts 不变，仍 import 原说明符）。
 *
 * 复刻链 = shared-browser.js + bootstrap-browser.js + bootstrap-common.js 的 browser
 * 分支，行为逐行对应，仅注册面剔除：
 * - registerAnimate（动画链，lever1 已桩）→ registerStandardAnimation 整体不复制
 * - registerRichtext / registerArc3d / registerRect3d / registerPyramid3d（richtext+3D 切片）
 * - plugin/3d（registerDirectionalLight / registerOrthoCamera / registerViewTransform3dPlugin）
 * 保留 2D 全量注册面（官方 lite 入口不注册 image/arc/path/polygon/star，图片格与
 * 图标绘制依赖它们，故不可用 shared-browser-lite，见 bootstrap-browser-lite.js 对照）。
 *
 * 单例语义保持：
 * - ensureBootstrap 幂等键仍为 'browser-shared'，状态存 globalThis[Symbol.for('vrender.bootstrap.state')]（与原 bootstrap-utils 相同 Symbol 键）；
 * - shared 注册表仍挂 globalThis[Symbol.for('visactor.vrender.sharedAppRegistry')]（与原 shared-registry 相同 Symbol 键，两个实例互通）；
 * - pending runtime contributions 走真实 `@visactor/vrender/entries/runtime-contribution`
 *   （vtable 的 installVTableRuntimeContributions 与其共享 pending 队列，必须同实例）；
 * - syncLegacyRenderers/PickersToApp 逐行复刻 bootstrap-utils（其子路径未在 vrender
 *   exports 放行，无法直接 import）。
 */
import { createBrowserApp } from '@visactor/vrender-core/entries/browser'
import { getLegacyBindingContext } from '@visactor/vrender-core/legacy/bootstrap'
import { GraphicRender } from '@visactor/vrender-core/render/symbol'
import { registerFlexLayoutPlugin } from '@visactor/vrender-core/plugin/flex-layout'
import { registerHtmlAttributePlugin, registerReactAttributePlugin } from '@visactor/vrender-core/plugin/attribute'
import { installBrowserEnvToApp, installBrowserPickersToApp } from '@visactor/vrender-kits/installers/browser'
import { registerArc } from '@visactor/vrender-kits/register/register-arc'
import { registerArea } from '@visactor/vrender-kits/register/register-area'
import { registerCircle } from '@visactor/vrender-kits/register/register-circle'
import { registerGlyph } from '@visactor/vrender-kits/register/register-glyph'
import { registerGroup } from '@visactor/vrender-kits/register/register-group'
import { registerImage } from '@visactor/vrender-kits/register/register-image'
import { registerLine } from '@visactor/vrender-kits/register/register-line'
import { registerPath } from '@visactor/vrender-kits/register/register-path'
import { registerPolygon } from '@visactor/vrender-kits/register/register-polygon'
import { registerRect } from '@visactor/vrender-kits/register/register-rect'
import { registerShadowRoot } from '@visactor/vrender-kits/register/register-shadowRoot'
import { registerStar } from '@visactor/vrender-kits/register/register-star'
import { registerSymbol } from '@visactor/vrender-kits/register/register-symbol'
import { registerText } from '@visactor/vrender-kits/register/register-text'
import { registerWrapText } from '@visactor/vrender-kits/register/register-wraptext'
import { CanvasPickerContribution } from '@visactor/vrender-kits/picker/contributions/constants'
import { installPendingRuntimeContributionModulesToApp } from '@visactor/vrender/entries/runtime-contribution'
import { installCuratedGraphicsToApp } from './vrenderGraphicsInstallerLite'
import type { IApp as ShimApp } from '@visactor/vtable/es/vrender'

type RegistryApp = ShimApp & TVRenderRegistryHost
interface TVRenderServiceIdentifier {
  readonly __vrenderServiceId: 'service-identifier'
}

// ── 以下为 vrender/es/entries/shared-registry.js 的逐行复刻（同 Symbol.for 键）──

const SHARED_APP_REGISTRY_KEY = Symbol.for('visactor.vrender.sharedAppRegistry')

interface SharedAppRecord {
  app: ShimApp
  refCount: number
  released: boolean
  releaseApp: () => void
}

const getSharedAppRegistry = (): Map<string, Map<string, SharedAppRecord>> => {
  const target = globalThis as typeof globalThis & {
    [SHARED_APP_REGISTRY_KEY]?: Map<string, Map<string, SharedAppRecord>>
  }
  const registry = target[SHARED_APP_REGISTRY_KEY] ?? new Map()
  target[SHARED_APP_REGISTRY_KEY] = registry
  return registry
}

const getSharedAppEnvRegistry = (env: string, create: boolean): Map<string, SharedAppRecord> | undefined => {
  const registry = getSharedAppRegistry()
  const envRegistry = registry.get(env)
  if (envRegistry || !create) return envRegistry
  const nextEnvRegistry = new Map<string, SharedAppRecord>()
  registry.set(env, nextEnvRegistry)
  return nextEnvRegistry
}

const getOrCreateSharedAppEnvRegistry = (env: string): Map<string, SharedAppRecord> =>
  getSharedAppEnvRegistry(env, true) as Map<string, SharedAppRecord>

const removeSharedAppRecord = (env: string, key: string, record: SharedAppRecord): void => {
  const registry = getSharedAppRegistry()
  const envRegistry = registry.get(env)
  if (envRegistry?.get(key) === record) {
    envRegistry.delete(key)
    if (!envRegistry.size) registry.delete(env)
  }
}

const releaseSharedAppRecord = (env: string, key: string, record: SharedAppRecord): void => {
  if (record.released) return
  record.released = true
  record.refCount = 0
  removeSharedAppRecord(env, key, record)
  record.releaseApp()
}

const createSharedAppRecord = (
  env: string,
  key: string,
  options: Record<string, unknown>,
  createApp: (options: Record<string, unknown>) => ShimApp,
): SharedAppRecord => {
  const app = createApp(options)
  const originalRelease = app.release.bind(app)
  const record: SharedAppRecord = { app, refCount: 0, released: false, releaseApp: originalRelease }
  app.release = () => releaseSharedAppRecord(env, key, record)
  return record
}

interface SharedAppHandle {
  app: ShimApp
  env: string
  key: string
  release: () => void
}

const createSharedAppHandle = (
  registryEnv: string,
  handleEnv: string,
  key: string,
  record: SharedAppRecord,
): SharedAppHandle => {
  let released = false
  return {
    app: record.app,
    env: handleEnv,
    key,
    release() {
      if (released) return
      released = true
      const envRegistry = getSharedAppEnvRegistry(registryEnv, false)
      if (envRegistry?.get(key) === record && !record.released) {
        record.refCount -= 1
        if (record.refCount <= 0) releaseSharedAppRecord(registryEnv, key, record)
      }
    },
  }
}

export const acquireSharedApp = <T extends ShimApp>(
  registryEnv: string,
  options: Record<string, unknown>,
  createApp: (options: Record<string, unknown>) => T,
  handleEnv: string = registryEnv,
): SharedAppHandle => {
  const key = (options.key as string | undefined) ?? 'default'
  const envRegistry = getOrCreateSharedAppEnvRegistry(registryEnv)
  let record = envRegistry.get(key)
  if (record?.app.released) {
    releaseSharedAppRecord(registryEnv, key, record)
    record = undefined
  }
  if (!record) {
    record = createSharedAppRecord(registryEnv, key, options, createApp as (o: Record<string, unknown>) => ShimApp)
    envRegistry.set(key, record)
  }
  record.refCount += 1
  return createSharedAppHandle(registryEnv, handleEnv, key, record)
}

const getSharedApp = (env: string, key = 'default'): ShimApp | null => {
  const record = getSharedAppEnvRegistry(env, false)?.get(key)
  return !record || record.released || record.app.released ? null : record.app
}

const releaseSharedApp = (env: string, key = 'default'): void => {
  const record = getSharedAppEnvRegistry(env, false)?.get(key)
  if (record) releaseSharedAppRecord(env, key, record)
}

// ── 以下为 vrender/es/entries/bootstrap-utils.js 的逐行复刻（同 Symbol.for 键）──

const BOOTSTRAP_STATE = Symbol.for('vrender.bootstrap.state')

const ensureBootstrap = (target: object, key: string): boolean => {
  const host = target as typeof target & { [BOOTSTRAP_STATE]?: Set<string> }
  const state = host[BOOTSTRAP_STATE] ?? new Set<string>()
  host[BOOTSTRAP_STATE] = state
  if (!state.has(key)) {
    state.add(key)
    return true
  }
  return false
}

const LEGACY_RENDERER_NAMESPACE = 'vrender:legacy-renderer'
const LEGACY_PICKER_NAMESPACE = 'vrender:legacy-picker'
const legacyEntryKeys = new WeakMap<object, Map<string, Set<string>>>()

const createBootstrapEntryKey = (entry: unknown, prefix: string): string => {
  const e = entry as { type?: unknown; numberType?: unknown; constructor?: { name?: string } } | null | undefined
  const type = e?.type ?? 'unknown'
  const numberType = e?.numberType ?? 'unknown'
  const ctor = e?.constructor?.name ?? 'anonymous'
  return `${prefix}:${String(numberType)}:${String(type)}:${ctor}`
}

const getTrackedEntryKeys = (registry: object, namespace: string): Set<string> => {
  let namespaces = legacyEntryKeys.get(registry)
  if (!namespaces) {
    namespaces = new Map()
    legacyEntryKeys.set(registry, namespaces)
  }
  let keys = namespaces.get(namespace)
  if (!keys) {
    keys = new Set()
    namespaces.set(namespace, keys)
  }
  return keys
}

const clearTrackedEntryKeys = (registry: object, namespace: string, unregister?: (key: string) => void): void => {
  const keys = getTrackedEntryKeys(registry, namespace)
  if (unregister) keys.forEach((key) => unregister(key))
  keys.clear()
}

/** 原版 syncLegacyRenderersToApp（GraphicRender 通道，含 reInit 回调语义） */
const syncLegacyRenderersToApp = (app: RegistryApp): void => {
  const legacyRenderers = getLegacyBindingContext().getAll(GraphicRender as TVRenderServiceIdentifier) ?? []
  const registeredKeys = getTrackedEntryKeys(app.registry.renderer, LEGACY_RENDERER_NAMESPACE)
  const seen = new Set<string>()
  clearTrackedEntryKeys(
    app.registry.renderer,
    LEGACY_RENDERER_NAMESPACE,
    app.registry.renderer.unregister?.bind(app.registry.renderer),
  )
  legacyRenderers.forEach((renderer) => {
    const key = createBootstrapEntryKey(renderer, LEGACY_RENDERER_NAMESPACE)
    if (!seen.has(key)) {
      seen.add(key)
      ;(renderer as { reInit?: () => void } | null | undefined)?.reInit?.call(renderer)
      app.registry.renderer.register(key, renderer)
      registeredKeys.add(key)
    }
  })
}

/** 原版 syncLegacyPickersToApp（pickerContribution 通道） */
const syncLegacyPickersToApp = (app: RegistryApp, pickerContribution: TVRenderServiceIdentifier): void => {
  const legacyPickers = getLegacyBindingContext().getAll(pickerContribution) ?? []
  const registeredKeys = getTrackedEntryKeys(app.registry.picker, LEGACY_PICKER_NAMESPACE)
  const seen = new Set<string>()
  clearTrackedEntryKeys(
    app.registry.picker,
    LEGACY_PICKER_NAMESPACE,
    app.registry.picker.unregister?.bind(app.registry.picker),
  )
  legacyPickers.forEach((picker) => {
    const key = createBootstrapEntryKey(picker, LEGACY_PICKER_NAMESPACE)
    if (!seen.has(key)) {
      seen.add(key)
      app.registry.picker.register(key, picker)
      registeredKeys.add(key)
    }
  })
}

// ── 以下为 vrender/es/entries/bootstrap-browser.js + bootstrap-common.js 的精选复刻 ──

/** 原版 standardLegacyGraphicRegistrations 剔除 richtext / arc3d / rect3d / pyramid3d 后的 15 项 */
const curatedLegacyGraphicRegistrations = [
  registerArc,
  registerArea,
  registerCircle,
  registerGlyph,
  registerGroup,
  registerImage,
  registerLine,
  registerPath,
  registerPolygon,
  registerRect,
  registerShadowRoot,
  registerStar,
  registerSymbol,
  registerText,
  registerWrapText,
]

/** 原版 pluginRegistrations 剔除 plugin/3d（registerDirectionalLight / registerOrthoCamera /
 *  registerViewTransform3dPlugin）后的 3 项；registerStandardAnimation 不复刻（无动画） */
const curatedPipelineRegistrations = [registerFlexLayoutPlugin, registerHtmlAttributePlugin, registerReactAttributePlugin]

const registerCuratedPipeline = (): void => {
  curatedPipelineRegistrations.forEach((register) => register())
}

const registerCuratedLegacyGraphics = (): void => {
  curatedLegacyGraphicRegistrations.forEach((register) => register())
}

/** 原版 bootstrapVRenderSharedBrowserApp（幂等键 'browser-shared'，调用顺序逐行对应） */
const bootstrapCuratedSharedBrowserApp = (app: ShimApp, envParams: unknown): ShimApp => {
  if (!ensureBootstrap(app, 'browser-shared')) return app
  installBrowserEnvToApp(app, envParams)
  installCuratedGraphicsToApp(app)
  installBrowserPickersToApp(app)
  registerCuratedLegacyGraphics()
  syncLegacyRenderersToApp(app as RegistryApp)
  syncLegacyPickersToApp(app as RegistryApp, CanvasPickerContribution as TVRenderServiceIdentifier)
  registerCuratedPipeline()
  return app
}

// ── 以下为 vrender/es/entries/shared-browser.js 的逐行复刻 ──

const SHARED_BROWSER_REGISTRY_ENV = 'browser-shared'

interface SharedBrowserAppOptions {
  context?: unknown
  env?: string
  envParams?: unknown
  key?: string
}

/** 原版对非对象入参同样会因 `in` 操作符抛 TypeError——保持一致，不加 typeof 守卫放宽 */
const isSharedBrowserAppOptions = (options: object): boolean =>
  'context' in options || 'env' in options || 'envParams' in options || 'key' in options

const assertBrowserEnv = (env: string | undefined): void => {
  if (env !== undefined && env !== 'browser') {
    throw new Error(`The browser condition only supports env "browser"; received "${String(env)}".`)
  }
}

const resolveSharedBrowserAppOptions = (
  optionsOrEnvParams: SharedBrowserAppOptions | unknown,
  env: string | undefined,
): { env: string; envParams?: unknown; key?: string; context?: unknown } => {
  assertBrowserEnv(env)
  if (env !== undefined) return { env, envParams: optionsOrEnvParams }
  if (optionsOrEnvParams === undefined) return { env: 'browser' }
  if (isSharedBrowserAppOptions(optionsOrEnvParams as object)) {
    assertBrowserEnv((optionsOrEnvParams as SharedBrowserAppOptions).env)
    return Object.assign(Object.assign({}, optionsOrEnvParams), { env: 'browser' })
  }
  return { env: 'browser', envParams: optionsOrEnvParams }
}

const createSharedBrowserApp = (options: SharedBrowserAppOptions): ShimApp => {
  const { envParams } = options
  const entryOptions: Partial<SharedBrowserAppOptions> = Object.assign({}, options)
  delete entryOptions.env
  delete entryOptions.envParams
  delete entryOptions.key
  const app = bootstrapCuratedSharedBrowserApp(createBrowserApp(entryOptions), envParams)
  installPendingRuntimeContributionModulesToApp(app)
  return app
}

export function acquireSharedBrowserVRenderApp(
  optionsOrEnvParams?: SharedBrowserAppOptions | unknown,
  env?: string,
): SharedAppHandle {
  const options = resolveSharedBrowserAppOptions(optionsOrEnvParams, env)
  return acquireSharedApp(SHARED_BROWSER_REGISTRY_ENV, options as Record<string, unknown>, createSharedBrowserApp, 'browser')
}

export function getSharedBrowserVRenderApp(key?: string): ShimApp | null {
  return getSharedApp(SHARED_BROWSER_REGISTRY_ENV, key)
}

export function releaseSharedBrowserVRenderApp(key?: string): void {
  releaseSharedApp(SHARED_BROWSER_REGISTRY_ENV, key)
}

export { acquireSharedBrowserVRenderApp as acquireSharedVRenderApp, getSharedBrowserVRenderApp as getSharedVRenderApp, releaseSharedBrowserVRenderApp as releaseSharedVRenderApp }
