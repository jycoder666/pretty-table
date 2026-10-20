import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // GC-19：把调试开关固化为构建期常量，生产构建按 false 静态消减调试代码。
  // .env / .env.<mode> 未声明 VITE_PT_DEBUG 时替换为空串（"" !== "1" 恒假，可被摇树）。
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '')
  return {
    plugins: [vue(), vueDevTools()],
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
