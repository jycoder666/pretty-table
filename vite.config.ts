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

/** T-slim v2 招1：vrender-core graphic/richtext.js 桩（RichText 类帧布局引擎，应用零 inline 图标单元格） */
const vrenderCoreRichTextGraphicStub = fileURLToPath(new URL('./src/core/render/vrenderCoreRichTextGraphicStub.ts', import.meta.url))

/** lever2 两个 shim + 招1 richtext 类桩的 @visactor 传递依赖子路径，从 vtable 包上下文代解析（归一化正斜杠比对） */
const vrenderSideShimImporters = new Set(
  [vrenderSharedBrowserShim, vrenderGraphicsInstallerShim, vrenderCoreRichTextGraphicStub].map((p) =>
    p.replace(/\\/g, '/'),
  ),
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

/** T-slim v2 招1：vrender-kits register-richtext 链桩（顶层副作用持有整个 richtext 注册链，图内零调用） */
const vrenderKitsRegisterRichtextStub = fileURLToPath(new URL('./src/core/render/vrenderKitsRegisterRichtextStub.ts', import.meta.url))

/** T-slim v2 招1：vrender-kits canvas-picker richtext 绑定桩（RichText 命中检测器，本应用零 RichText 图形） */
const vrenderKitsRichtextPickerBindStub = fileURLToPath(new URL('./src/core/render/vrenderKitsRichtextPickerBindStub.ts', import.meta.url))

/** T-slim v2 招2：vrender-components poptip 子树桩（悬停气泡组件注册链两口全 no-op，行为面见桩文件头注释） */
const vrenderComponentsPoptipStub = fileURLToPath(new URL('./src/core/render/vrenderComponentsPoptipStub.ts', import.meta.url))

/** T-slim v2 招3：vrender-components checkbox 子树桩（应用零 cellType:'checkbox'，行为面见桩文件头注释） */
const vrenderComponentsCheckboxStub = fileURLToPath(new URL('./src/core/render/vrenderComponentsCheckboxStub.ts', import.meta.url))

/** T-slim v2 招5：vtable radio 状态机桩（ListTable 独家消费、应用零 radio 格，行为面见桩文件头注释） */
const vtableRadioStateStub = fileURLToPath(new URL('./src/core/render/vtableRadioStateStub.ts', import.meta.url))

/** T-slim v2 招6：vtable 媒体点击链桩（event.js 独家消费、应用零 link/媒体格，行为面见桩文件头注释） */
const vtableMediaClickStub = fileURLToPath(new URL('./src/core/render/vtableMediaClickStub.ts', import.meta.url))

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
      // T-slim lever2：两个 shim 文件 + 招1 richtext 类桩的 @visactor 子路径从 vtable 包
      // 上下文代解析（vtable 直接依赖 vrender/vrender-core/vrender-kits，与既有 deferred
      // 机制同一锚点、同一 pnpm store 实例；pnpm 严格隔离下 src 无法直连这些子路径）。
      // vrender-app 尚未解析时（招1 桩经 core index.js Barrel 链先于 scenegraph 进图），
      // 从 src 直接可解析的 @visactor/vtable/es/vrender 兜底锚定同一包上下文。
      if (
        vrenderSideShimImporters.has(importer.replace(/\\/g, '/')) &&
        /^@visactor\/(vrender|vrender-core|vrender-kits)(\/|$)/.test(source)
      ) {
        if (!vrenderAppModulePath) {
          const fallback = await this.resolve('@visactor/vtable/es/vrender', vtableBrowserShim, { skipSelf: true })
          if (!fallback) {
            this.error('pt-vtable-browser-env-only: 兜底锚点 @visactor/vtable/es/vrender 解析失败')
          }
          vrenderAppModulePath = fallback.id
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
      // T-slim v2 招1：richtext 残链收割——两个持有者分别桩掉（行为面见两个桩文件头注释）：
      // 1) vrender-kits register-richtext（index-node.js 相对导入 + bootstrap*.js 裸说明符，
      //    图内消费方均为 /@visactor/ 包内文件；vrender-core 同名 register/register-richtext.js
      //    无顶层副作用、经 register/graphic.js Barrel 自然摇树，不在本重定向范围）
      const richtextImporter = importer.replace(/\\/g, '/')
      if (richtextImporter.includes('/@visactor/') && (source.endsWith('register/register-richtext') || source === '@visactor/vrender-kits/register/register-richtext')) {
        return vrenderKitsRegisterRichtextStub
      }
      // 2) canvas-picker/richtext-module（消费方 installers/browser.js + installers/app.js +
      //    register-richtext.js（相对/裸说明符两种形态）+ picker/canvas-module.js 的
      //    loadCanvasPicker（env/browser.js loadBrowserEnv 默认 loadPicker=true 的活调用链，
      //    相对导入形态 './contributions/canvas-picker/richtext-module'）；后缀统一匹配，
      //    同目录 math-picker/richtext-module 由 1) 的桩断链后自然摇树，无需重定向）
      if (richtextImporter.includes('/@visactor/vrender-kits/') && source.endsWith('canvas-picker/richtext-module')) {
        return vrenderKitsRichtextPickerBindStub
      }
      // 3) graphic/richtext.js（RichText 类本体 + createRichText）：图内唯一活消费 =
      //    vtable compute-row-height.js 顶层 utilRichTextMark 实例化（仅 inline 图标 +
      //    autoWrapText 分支使用，应用零触达，见桩文件头注释）。消费方均在 vrender-core
      //    包内（index.js './graphic/richtext' / graphic/index.js、graphic/creator.js
      //    './richtext'）；同名相对说明符在 vrender-kits/vtable 包内不存在（全域探针）。
      //    桩为 Graphic 基类直接子类，行为面见桩文件头注释。
      if (richtextImporter.includes('/@visactor/vrender-core/') && (source === './richtext' || source.endsWith('graphic/richtext'))) {
        return vrenderCoreRichTextGraphicStub
      }
      // T-slim v2 招2：poptip 双口同拔——vrender-components barrel（es/index.js）的两行
      // poptip re-export（'./poptip' 整目录 + './poptip/module'）是 poptip 子树全图唯二
      // 入图口：① vtable/es/vrender.js registerForVrender→loadPoptip；② vrenderAppBrowser
      // shim installPoptipToApp。图内消费面仅 loadPoptip/installPoptipToApp/setPoptipTheme
      // 三名（全域探针实查），桩全 no-op；installPoptipToApp 原版的通用安装步在本应用
      // bootstrap（installCuratedGraphicsToApp）已先行完成，跳过无增量。行为面见桩文件头注释。
      if (
        importer.replace(/\\/g, '/').includes('/@visactor/vrender-components/es/index.js') &&
        (source === './poptip' || source === './poptip/module')
      ) {
        return vrenderComponentsPoptipStub
      }
      // T-slim v2 招3：checkbox 子树收割——barrel `export * from "./checkbox"` 一行是全图
      // 唯一入图口，名字仅被 vtable checkbox-content.js（instanceof 恒假分支）与
      // checkbox-cell.js（cellType:'checkbox' 渲染路径）钉住；本应用 src/**、tables/*.json
      // 零 cellType 用法，路径永不触发。行为面见桩文件头注释。
      if (
        importer.replace(/\\/g, '/').includes('/@visactor/vrender-components/es/index.js') &&
        source === './checkbox'
      ) {
        return vrenderComponentsCheckboxStub
      }
      // T-slim v2 招5：radio 状态机收割——state/radio/radio.js 仅被 ListTable.js 一处
      // 静态导入（两个公共 API 包装名），应用零 radio 格、路径永不触发；返回面兼容
      // （getCellRadioState 非 radio 格恒 !1）。行为面见桩文件头注释。
      if (importer.replace(/\\/g, '/').endsWith('/@visactor/vtable/es/ListTable.js') && source === './state/radio/radio') {
        return vtableRadioStateStub
      }
      // T-slim v2 招6：媒体点击链收割——event/media-click.js 仅被 event/event.js 一处
      // 静态导入（bindMediaClick 单名），初始化时挂媒体预览管理器 + CLICK_CELL 监听；
      // 应用零 linkJump/link/video/audio 格（全域探针实查），监听回调零触达。
      // 行为面见桩文件头注释。
      if (importer.replace(/\\/g, '/').endsWith('/@visactor/vtable/es/event/event.js') && source === './media-click') {
        return vtableMediaClickStub
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
    build: {
      // P6 收尾（体积门禁）：seedTemplates 对 tables/*.json 的动态导入默认拆 8 个
      // 小 chunk，各自独立 gzip 无共享字典（实测 14.4KB）；归并为单 chunk 后
      // 重复键名（templateId/schemaVersion/slots…）跨表共享压缩（实测 8.67KB）。
      // 仍保持懒加载：不进首屏入口，打开库页首次播种时才下载。
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.replace(/\\/g, '/').includes('/tables/')) return 'seed-tables'
            return undefined
          },
        },
      },
    },
  }
})
