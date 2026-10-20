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
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
    },
  }),
)
