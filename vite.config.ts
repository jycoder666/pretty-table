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

/** shim 消费、需代解析的 vtable 传递依赖子路径 → 运行时入口 */
const shimDeferredSubpaths = new Set([
  '@visactor/vrender/entries/shared-browser',
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
      return null
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // GC-19：把调试开关固化为构建期常量，生产构建按 false 静态消减调试代码。
  // .env / .env.<mode> 未声明 VITE_PT_DEBUG 时替换为空串（"" !== "1" 恒假，可被摇树）。
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '')
  return {
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
