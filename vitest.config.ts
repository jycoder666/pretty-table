import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults, type ViteUserConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// vite.config 现为函数形式（GC-19 define）：先以 test 模式求值再合并
const base = (await (
  typeof viteConfig === 'function'
    ? viteConfig({ command: 'serve', mode: 'test', isSsrBuild: false, isPreview: false })
    : viteConfig
)) as ViteUserConfig

export default mergeConfig(
  base,
  defineConfig({
    test: {
      environment: 'jsdom',
      // e2e/ 与 manual-verify/ 都是真机 Playwright 套件（各由自己的 config 收集），不进单测
      exclude: [...configDefaults.exclude, 'e2e/**', 'manual-verify/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
    },
  }),
)
