import { defineConfig } from '@playwright/test'

/**
 * 真机人工项验证专用配置（与 e2e/ 主套件隔离，不进 pnpm test:e2e）：
 * - headed 真实浏览器（真机渲染 + 真系统剪贴板）
 * - testDir 指向本目录，主 config 的 testDir=./e2e 不会收集本目录
 * 运行：pnpm exec playwright test --config manual-verify/playwright.manual.config.ts
 */
export default defineConfig({
  testDir: '.',
  timeout: 180 * 1000,
  expect: { timeout: 10 * 1000 },
  workers: 1,
  reporter: [['list']],
  use: {
    // 与 vite.config.ts 端口策略一致：默认 5310，可用 PT_PORT 覆盖
    baseURL: `http://127.0.0.1:${Number(process.env.PT_PORT) || 5310}`,
    headless: false,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    actionTimeout: 20 * 1000,
  },
  webServer: {
    command: 'npm run dev',
    port: Number(process.env.PT_PORT) || 5310,
    reuseExistingServer: true,
  },
})
