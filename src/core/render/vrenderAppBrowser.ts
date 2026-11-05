/**
 * T00 · `vtable/es/vrender-app.js` 的浏览器等价替代（构建期重定向，见 vite.config.ts）。
 *
 * 原文件为覆盖 node/wx/lynx/harmony/taro/feishu/tt 全平台，静态 import 了 8 份 env loader
 * 与 8 份 install*EnvToApp（switch 分发）；该文件被 scenegraph.js（vtable package.json
 * sideEffects 清单成员）静态引用，无法摇树，平台分支全部进产物。
 *
 * 本应用只在浏览器运行：本文件逐行复刻原文件 browser 分支——
 * - app 创建走 `@visactor/vrender/entries/shared-browser`（生产构建经 Vite browser
 *   condition 本就解析到该入口，sourcemap 实证：标准 browser bootstrap =
 *   installBrowserEnvToApp + installStandardGraphicsToApp + installBrowserPickersToApp
 *   + registerStandardLegacyGraphics + syncLegacy* + registerStandardPipeline）；
 * - env 激活 / poptip / vglobal / vtable runtime contributions / createStage / 释放语义
 *   与原文件 browser 分支逐行对应。
 * 唯一差异：非浏览器分支不存在（调用方 scenegraph.js 在浏览器下 mode 恒为 'browser'）。
 */
import { acquireSharedVRenderApp } from '@visactor/vrender/entries/shared-browser'
import { installPoptipToApp } from '@visactor/vrender-components'
import { loadBrowserEnv } from '@visactor/vrender-kits/env/browser'
import { installBrowserEnvToApp } from '@visactor/vrender-kits/installers/browser'
import { vglobal, type IApp } from '@visactor/vtable/es/vrender'
import { installVTableRuntimeContributions } from '@visactor/vtable/es/scenegraph/runtime-contributions'

type VRenderApp = IApp
type StageParams = Parameters<VRenderApp['createStage']>[0]

interface StageOptions {
  mode?: string
  scope?: string
  app?: VRenderApp
  stage?: unknown
  envParams?: unknown
}

interface ResolvedApp {
  app: VRenderApp
  releaseAppRef: () => void
  appOwned: boolean
}

const envParamsKeyMap = new WeakMap<object, string>()
let envParamsKeyId = 0

const getEnvParamsKey = (envParams: StageOptions['envParams']): string => {
  if (envParams == null) return 'default'
  if (typeof envParams === 'object' || typeof envParams === 'function') {
    const existingKey = envParamsKeyMap.get(envParams as object)
    if (existingKey != null) return `object:${existingKey}`
    envParamsKeyId += 1
    const key = `object:${envParamsKeyId}`
    envParamsKeyMap.set(envParams as object, key)
    return key
  }
  return `primitive:${String(envParams)}`
}

const getVRenderAppKey = (env: string, scope: string | undefined, envParams: StageOptions['envParams']): string =>
  `${env}:${scope ?? 'default'}:${getEnvParamsKey(envParams)}`

const getForcedEnvParams = (envParams: StageOptions['envParams']): Record<string, unknown> => {
  if (envParams == null || (typeof envParams !== 'object' && typeof envParams !== 'function')) {
    return { force: true }
  }
  return Object.assign(Object.create(envParams as object), { force: true })
}

/** 原文件 activateSharedVRenderAppEnv 的 browser default 分支 + activateLegacyVGlobalEnv */
const activateBrowserEnv = (app: VRenderApp, envParams: StageOptions['envParams']): void => {
  installBrowserEnvToApp(app, envParams)
  loadBrowserEnv()
  vglobal.setEnv('browser', getForcedEnvParams(envParams))
  installPoptipToApp(app)
}

/** 原文件 retainDefaultVRenderApp / resolveVRenderApp（env 恒为 'browser'） */
const resolveVRenderApp = (options: StageOptions): ResolvedApp => {
  if (options.app) {
    return { app: options.app, appOwned: false, releaseAppRef: () => {} }
  }
  const key = getVRenderAppKey('browser', options.scope, options.envParams)
  const sharedOptions: { env: 'browser'; key: string; envParams?: unknown } = { env: 'browser', key }
  if (options.envParams != null) sharedOptions.envParams = options.envParams
  const handle = acquireSharedVRenderApp(sharedOptions)
  let released = false
  activateBrowserEnv(handle.app, options.envParams)
  return {
    app: handle.app,
    releaseAppRef: () => {
      if (released) return
      released = true
      handle.release()
    },
    appOwned: true,
  }
}

/** 与原文件 createStageFromVRenderApp 逐行对应（browser 分支） */
export function createStageFromVRenderApp(
  params: StageParams,
  options: StageOptions = {},
): {
  app: VRenderApp | undefined
  stage: unknown
  releaseAppRef: () => void
  stageOwned: boolean
  appOwned: boolean
} {
  if (options.stage) {
    return {
      app: options.app,
      stage: options.stage,
      releaseAppRef: () => {},
      stageOwned: false,
      appOwned: false,
    }
  }
  const resolvedApp = resolveVRenderApp(options)
  try {
    installVTableRuntimeContributions(resolvedApp.app)
    const stage = resolvedApp.app.createStage(params)
    return {
      app: resolvedApp.app,
      stage,
      releaseAppRef: resolvedApp.releaseAppRef,
      stageOwned: true,
      appOwned: resolvedApp.appOwned,
    }
  } catch (error) {
    resolvedApp.releaseAppRef()
    throw error
  }
}
