import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

/**
 * T00 体积收敛：vtable/es/vrender-app.js 为覆盖 8 个平台静态 import 全部 env
 * loader/installer，且被 scenegraph.js（vtable sideEffects 清单成员）静态引用，
 * 摇树无法移除。浏览器应用只需要 browser 分支——这里把这一处 import 在构建期
 * 重定向到浏览器等价 shim（src/core/render/vrenderAppBrowser.ts，逐行复刻原
 * browser 分支链路），平台分支代码不进产物，渲染行为不变。
 * 全仓消费点实查仅 scenegraph.js 一处（grep '../vrender-app'）。
 *
 * shim 里 @visactor/vrender* 传递依赖子路径在 pnpm 严格隔离下无法从 src 解析
 * （项目 node_modules 无这些包），同样借 vrender-app 真实文件所在包上下文代解析。
 */
const vtableBrowserShim = fileURLToPath(new URL('./src/core/render/vrenderAppBrowser.ts', import.meta.url))

/** T-slim 动画链桩：BaseTable 的 './animation' 重定向目标（no-op TableAnimationManager） */
const tableAnimationManagerStub = fileURLToPath(new URL('./src/core/render/tableAnimationManagerStub.ts', import.meta.url))

/** T-slim 动画链桩：'@visactor/vrender-animate/register' 重定向目标（no-op registerAnimate） */
const vrenderAnimateRegisterStub = fileURLToPath(new URL('./src/core/render/vrenderAnimateRegisterStub.ts', import.meta.url))

/** T-slim lever2：'@visactor/vrender/entries/shared-browser' 重定向目标（精选 bootstrap） */
const vrenderSharedBrowserShim = fileURLToPath(new URL('./src/core/render/vrenderSharedBrowserLite.ts', import.meta.url))

/** T-slim lever2：精选 graphics installer（vrenderSharedBrowserShim 引用） */
const vrenderGraphicsInstallerShim = fileURLToPath(new URL('./src/core/render/vrenderGraphicsInstallerLite.ts', import.meta.url))

/** lever2 两个 shim 的 @visactor 传递依赖子路径，从 vtable 包上下文代解析（归一化正斜杠比对） */
const vrenderSideShimImporters = new Set(
  [vrenderSharedBrowserShim, vrenderGraphicsInstallerShim].map((p) => p.replace(/\\/g, '/')),
)

/**
 * T-slim lever3：vtable chart 相关模块桩（行为面见各桩文件头注释；导入面清单——
 * 图内消费点仅 simple-header-layout.js:7、core/style-helper.js:1、scenegraph.js:51/81 四处，
 * 其余消费者（pivot-header-layout/PivotChart/components index/graphic chart.js/cell-type
 * index）均不在 ListTable 应用图内）。仅按 importer 精确命中，同名相对导入不误伤。
 */
const chartGetChartSpecStub = fileURLToPath(new URL('./src/core/render/chartHelperGetChartSpecStub.ts', import.meta.url))
const chartGetAxisConfigStub = fileURLToPath(new URL('./src/core/render/chartHelperGetAxisConfigStub.ts', import.meta.url))
const chartActiveCellListStub = fileURLToPath(new URL('./src/core/render/activeCellChartListStub.ts', import.meta.url))
const chartUpdateChartStub = fileURLToPath(new URL('./src/core/render/updateChartStub.ts', import.meta.url))
const chartRenderHelperStub = fileURLToPath(new URL('./src/core/render/chartRenderHelperStub.ts', import.meta.url))
const chartRenderContributionStub = fileURLToPath(new URL('./src/core/render/chartRenderContributionStub.ts', import.meta.url))
const vchartGraphicPickerStub = fileURLToPath(new URL('./src/core/render/vchartGraphicPickerStub.ts', import.meta.url))

/** shim 消费、需代解析的 vtable 传递依赖子路径 → 运行时入口 */
const shimDeferredSubpaths = new Set([
  '@visactor/vrender-components',
  '@visactor/vrender-kits/installers/browser',
  '@visactor/vrender-kits/env/browser',
])

const vtableBrowserEnvOnly = (): Plugin => {
  // scenegraph.js 引用的 vrender-app 真实位置（解析传递依赖的上下文锚点）
  let vrenderAppModulePath: string | null = null
  return {
    name: 'pt-vtable-browser-env-only',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!importer) return null
      if (source === '../vrender-app' || source === './vrender-app') {
        if (importer.replace(/\\/g, '/').includes('/@visactor/vtable/es/scenegraph/scenegraph.js')) {
          const real = await this.resolve(source, importer, { skipSelf: true })
          if (real) vrenderAppModulePath = real.id
          return vtableBrowserShim
        }
        return null
      }
      // T-slim lever2：shared-browser → 精选 bootstrap（注册面去 animate/richtext/3d/plugin3d）。
      // 消费点仅 vrenderAppBrowser.ts（grep 实查）。
      if (source === '@visactor/vrender/entries/shared-browser') {
        return vrenderSharedBrowserShim
      }
      // T-slim lever2：两个 shim 文件的 @visactor 子路径从 vtable 包上下文代解析
      // （vtable 直接依赖 vrender/vrender-core/vrender-kits，与既有 deferred 机制同一锚点、
      // 同一 pnpm store 实例；pnpm 严格隔离下 src 无法直连这些子路径）
      if (
        vrenderSideShimImporters.has(importer.replace(/\\/g, '/')) &&
        /^@visactor\/(vrender|vrender-core|vrender-kits)(\/|$)/.test(source)
      ) {
        if (!vrenderAppModulePath) {
          this.error('pt-vtable-browser-env-only: vrender-app 未先解析，无法代解析 lever2 shim 依赖')
        }
        const resolved = await this.resolve(source, vrenderAppModulePath, { skipSelf: true })
        if (!resolved) {
          this.error(`pt-vtable-browser-env-only: 无法从 vtable 包上下文解析 ${source}`)
        }
        return resolved.id
      }
      if (importer === vtableBrowserShim && shimDeferredSubpaths.has(source)) {
        if (!vrenderAppModulePath) {
          this.error('pt-vtable-browser-env-only: vrender-app 未先解析，无法代解析 shim 依赖')
        }
        const resolved = await this.resolve(source, vrenderAppModulePath, { skipSelf: true })
        if (!resolved) {
          this.error(`pt-vtable-browser-env-only: 无法从 vtable 包上下文解析 ${source}`)
        }
        return resolved.id
      }
      // T-slim 动画链桩（行为面见两个桩文件头注释）：
      // 1) BaseTable.js 的 './animation'（TableAnimationManager）→ no-op 桩；
      //    仅匹配 BaseTable.js 这一处 import（ts-types/animation 等同名相对路径不受影响）
      if (source === './animation' && importer.replace(/\\/g, '/').endsWith('/@visactor/vtable/es/core/BaseTable.js')) {
        return tableAnimationManagerStub
      }
      // 2) vrender bootstrap-common 的 registerAnimate → no-op 桩（shared-browser 引导链唯一消费点）
      if (source === '@visactor/vrender-animate/register' && importer.replace(/\\/g, '/').includes('/@visactor/')) {
        return vrenderAnimateRegisterStub
      }
      // T-slim lever3：chart 模块桩——按目标文件匹配（全域探针证实 chart 链消费方即图内
      // 核心文件 ListTable/BaseTable/simple-header-layout/style-helper/scenegraph 与
      // contributions/index DI 绑定面，相对形态多样；同名相对导入的 ts-types 等不含这些
      // 说明符）。行为面见各桩文件头注释。
      const normalizedImporter = importer.replace(/\\/g, '/')
      if (normalizedImporter.includes('/@visactor/vtable/es/')) {
        if (source.endsWith('chart-helper/get-chart-spec')) {
          return chartGetChartSpecStub
        }
        if (source.endsWith('chart-helper/get-axis-config')) {
          return chartGetAxisConfigStub
        }
        if (source.endsWith('graphic/active-cell-chart-list')) {
          return chartActiveCellListStub
        }
        if (source.endsWith('refresh-node/update-chart')) {
          return chartUpdateChartStub
        }
        if (source.endsWith('contributions/chart-render-helper')) {
          return chartRenderHelperStub
        }
        if (/(^|\/)chart-render$/.test(source)) {
          return chartRenderContributionStub
        }
        if (/(^|\/)vchart-graphic-picker$/.test(source)) {
          return vchartGraphicPickerStub
        }
      }
      return null
    },
  }
}

/**
 * 开发服务端口策略：
 * - 默认 5310（避开本机 nginx:80、phpstudy xp.cn_cgi:9000-9004、其它项目 Vite:5173 等常驻端口）
 * - 可用环境变量 PT_PORT 覆盖，或命令行 `pnpm dev -- --port 5320` 临时覆盖
 * - strictPort 固定为 true：端口被占时 Vite 直接报错退出，绝不静默换端口，
 *   避免「终端打印 / 脚本打开的地址」与「实际监听端口」不一致而访问到别的服务
 */
const DEV_PORT = Number(process.env.PT_PORT) || 5310

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // GC-19：把调试开关固化为构建期常量，生产构建按 false 静态消减调试代码。
  // .env / .env.<mode> 未声明 VITE_PT_DEBUG 时替换为空串（"" !== "1" 恒假，可被摇树）。
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '')
  return {
    // 显式绑定回环地址与端口，且端口占用即失败（不自动顺延）
    server: {
      host: '127.0.0.1',
      port: DEV_PORT,
      strictPort: true,
    },
    plugins: [vue(), vueDevTools(), vtableBrowserEnvOnly()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    define: {
      'import.meta.env.VITE_PT_DEBUG': JSON.stringify(env.VITE_PT_DEBUG ?? ''),
    },
  }
})
