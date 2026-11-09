/**
 * T-slim lever2 · `vrender-kits/es/installers/graphics.js` 的精选复刻（构建期经
 * vite.config.ts `pt-vtable-browser-env-only` 由 vrenderSharedBrowserLite.ts 引用）。
 *
 * 原版 installStandardGraphicsToApp 的 19 步 register+bindModule 全量注册（含
 * arc3d / pyramid3d / rect3d / richtext 四个重切片）。本应用为 2D 表格渲染：
 * 图片格与图标绘制依赖 image/arc/path/polygon/star（vrender 官方 lite 安装器
 * graphics-lite 恰不注册 image，不可直接用），故本文件 = 原版剔除
 * registerArc3dGraphic / registerPyramid3dGraphic / registerRect3dGraphic /
 * registerRichtextGraphic 及对应 bindModule，其余 install steps 与调用顺序逐行对应：
 * configureRuntimeApplicationForApp → ensure installed → installRuntimeDrawContributionsToApp
 * → installRuntimeGraphicRenderersToApp。
 *
 * richtext/3D 残留说明（v2 探针实测）：richtext 模块仍被 picker installer
 * （bindRichtextCanvasPickerContribution）与 vrender-core register 链顶住（本招不动
 * picker installer，留给 lever4）；3D 收敛至 ~0.9KB raw 残留。
 * 禁止从 `@visactor/vrender-kits/installers/graphics` 原版导入。
 */
import {
  configureRuntimeApplicationForApp,
  getRuntimeInstallerBindingContext,
  installRuntimeDrawContributionsToApp,
  installRuntimeGraphicRenderersToApp,
  refreshRuntimeInstallerContributions,
} from '@visactor/vrender-core/entries/runtime-installer'
import {
  registerArcGraphic,
  registerAreaGraphic,
  registerCircleGraphic,
  registerGlyphGraphic,
  registerGroupGraphic,
  registerImageGraphic,
  registerLineGraphic,
  registerPathGraphic,
  registerPolygonGraphic,
  registerRectGraphic,
  registerShadowRootGraphic,
  registerStarGraphic,
  registerSymbolGraphic,
  registerTextGraphic,
  registerWrapTextGraphic,
} from '@visactor/vrender-core/register/graphic'
import {
  arcModule,
  areaModule,
  circleModule,
  glyphModule,
  imageModule,
  lineModule,
  pathModule,
  polygonModule,
  rectModule,
  starModule,
  symbolModule,
  textModule,
} from '@visactor/vrender-core/graphic/modules'
import type { IApp as ShimApp } from '@visactor/vtable/es/vrender'

/** 原版 standardGraphicInstallSteps 剔除 arc3d / pyramid3d / rect3d / richtext 后的 15 步 */
const curatedGraphicInstallSteps: Array<{
  register: () => void
  bindModule?: TVRenderGraphicModule
}> = [
  { register: registerArcGraphic, bindModule: arcModule },
  { register: registerAreaGraphic, bindModule: areaModule },
  { register: registerCircleGraphic, bindModule: circleModule },
  { register: registerGlyphGraphic, bindModule: glyphModule },
  { register: registerGroupGraphic },
  { register: registerImageGraphic, bindModule: imageModule },
  { register: registerLineGraphic, bindModule: lineModule },
  { register: registerPathGraphic, bindModule: pathModule },
  { register: registerPolygonGraphic, bindModule: polygonModule },
  { register: registerRectGraphic, bindModule: rectModule },
  { register: registerShadowRootGraphic },
  { register: registerStarGraphic, bindModule: starModule },
  { register: registerSymbolGraphic, bindModule: symbolModule },
  { register: registerTextGraphic, bindModule: textModule },
  { register: registerWrapTextGraphic },
]

let curatedGraphicsInstalled = false

/** 原版 ensureStandardGraphicsInstalled：进程级一次 + refreshRuntimeInstallerContributions */
function ensureCuratedGraphicsInstalled(): void {
  if (curatedGraphicsInstalled) return
  const bindingContext = getRuntimeInstallerBindingContext()
  curatedGraphicsInstalled = true
  curatedGraphicInstallSteps.forEach(({ register, bindModule }) => {
    register()
    bindModule?.({ bind: bindingContext.bind })
  })
  refreshRuntimeInstallerContributions()
}

/** 原版 installStandardGraphicsToApp 的精选等价（调用顺序逐行对应） */
export function installCuratedGraphicsToApp(app: ShimApp): void {
  configureRuntimeApplicationForApp(app)
  ensureCuratedGraphicsInstalled()
  installRuntimeDrawContributionsToApp(app)
  installRuntimeGraphicRenderersToApp(app)
}
