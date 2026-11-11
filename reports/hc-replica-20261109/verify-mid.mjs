// 业务路径验证：库页「导入模板」→ 粘贴 JSON → 确认入库 → 打开卡片进编辑台 → 全页截图
import { chromium } from '@playwright/test'
import { readFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const json = readFileSync(resolve(process.cwd(), 'reports/hc-replica-20261109/年度体检·指标解读-1比1.json'), 'utf8')
mkdirSync(resolve(process.cwd(), 'reports/hc-replica-20261109'), { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
await page.goto('http://127.0.0.1:5311/', { waitUntil: 'networkidle' })

// 1. 导入模板（粘贴文本路径）
await page.getByTestId('import-btn').click()
await page.getByTestId('import-dialog').waitFor()
await page.getByTestId('import-text').fill(json)
await page.getByTestId('import-confirm').click()
await page.getByText('已导入「年度体检 · 指标解读」').waitFor({ timeout: 8000 })
console.log('import toast OK')

// 2. 打开覆盖后的卡片（原位替换种子卡，同名唯一）
const card = page.locator('article.card', { has: page.locator('h3', { hasText: '年度体检 · 指标解读' }) })
await card.waitFor({ timeout: 8000 })
await card.locator('button', { hasText: '使用此模板' }).click()

// 3. 等编辑台画布渲染后截图（视口口径：fullPage 拼接会停在虚拟滚动 0 位，窗口外呈空白伪影）
await page.locator('.editor').waitFor({ timeout: 15000 })
await page.locator('.preview-host').waitFor({ timeout: 15000 })
await page.waitForTimeout(1200)
await page.screenshot({ path: resolve(process.cwd(), 'reports/hc-replica-20261109/preview-editor.png'), fullPage: false })
console.log('editor screenshot saved')

// 4. store 数据断言（导出与预览同源模型，不依赖页面内动态 import）
const texts = await page.evaluate(() => {
  const app = document.querySelector('#app')?.__vue_app__
  const st = app?.config.globalProperties?.$pinia?._s?.get('editor')
  return Object.values(st.current.slots).map((s) => s.text).join('\n')
})
const checks = [
  'H E A L T H   C H E C K  ·  K E Y   I N D I C A T O R S',
  '年度体检 · 指标解读',
  '检测日期 2026.04.18',
  'HC-2026-0418',
  '7 项指标中 4 项偏高',
  '128 / 82 mmHg',
  '468 µmol/L',
  '谷丙转氨酶 ALT',
  '需要跟进',
  '保持项目',
  '③ 下一次体检沿用同一机构',
  '便于纵向对比数值',
  '不构成医学诊断',
  '07 / 08',
]
const missing = checks.filter((c) => !texts.includes(c))
console.log(missing.length === 0 ? 'instance data: all ' + checks.length + ' checks hit' : 'instance data MISSING: ' + missing.join(' | '))

// 5. VTable 是 canvas 内部虚拟滚动：悬停画布后滚轮下滚，分段实拍。
// mid 段（2×160=320px）覆盖数据行 2-7（编辑器行 6-11，衔接 top 的行 1-6），回应"接缝外未核验"；
// 再 6×160 到底覆盖注脚两栏/①②③/免责声明。
await page.locator('.vtable-root').hover()
for (let i = 0; i < 2; i++) {
  await page.mouse.wheel(0, 160)
  await page.waitForTimeout(150)
}
await page.waitForTimeout(1200)
console.log('wheeled to mid')
await page.screenshot({ path: resolve(process.cwd(), 'reports/hc-replica-20261109/preview-editor-mid.png'), fullPage: false })
console.log('mid screenshot saved')
for (let i = 0; i < 3; i++) {
  await page.mouse.wheel(0, 160)
  await page.waitForTimeout(150)
}
await page.waitForTimeout(1000)
console.log('wheeled to bottom')
await page.screenshot({ path: resolve(process.cwd(), 'reports/hc-replica-20261109/preview-editor-mid.png'), fullPage: false })
console.log('bottom screenshot saved')
await browser.close()
