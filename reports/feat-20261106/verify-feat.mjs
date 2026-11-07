// 临时实测脚本（feat-20261106）：统计看板模板 / KPI 卡改文案 / 单元格条形 / 复制 HTML / 新标签页打开
// 运行：node reports/feat-20261106/verify-feat.mjs（依赖项目内 @playwright/test 的 chromium）
// 产物：同目录 5 张截图 + stdout 验证输出。脚本本身为临时文件，不提交版本库。
import { chromium } from '@playwright/test'
import process from 'node:process'

process.env.NO_PROXY ??= 'localhost,127.0.0.1,::1'
process.env.no_proxy ??= 'localhost,127.0.0.1,::1'

const OUT = 'F:/pretty-table/reports/feat-20261106'
const BASE = 'http://127.0.0.1:5173'
const consoleErrors = []
const pageErrors = []

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
const page = await context.newPage()
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})
page.on('pageerror', (e) => pageErrors.push(String(e)))

// ── a) 模板库 → 新建统计看板 ──
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await page.getByRole('heading', { name: '统计看板' }).waitFor({ timeout: 8000 })
await page.screenshot({ path: `${OUT}/00-library-stat-chip.png`, fullPage: false })

await page.locator('article.card', { hasText: '统计看板' }).first().getByRole('button', { name: '使用此模板' }).click()
await page.waitForTimeout(1800) // 渲染核动态加载 + 首帧
const heroVisible = await page.getByTestId('kpi-hero').isVisible().catch(() => false)
console.log('[a] kpi-hero 可见:', heroVisible)
console.log('[a] hero 文案含 本月收入:', (await page.getByTestId('kpi-hero').innerText()).includes('本月收入'))
await page.screenshot({ path: `${OUT}/01-stat-template-opened.png`, fullPage: false })

// ── a2) KPI 卡改文案 ──
await page.getByTestId('group-head-kpi').click()
await page.getByTestId('kpi-label-0').waitFor({ state: 'visible', timeout: 4000 })
await page.getByTestId('kpi-label-0').fill('十月总收入')
await page.getByTestId('kpi-label-0').press('Tab')
await page.waitForTimeout(900)
const heroText2 = await page.getByTestId('kpi-hero').innerText()
console.log('[a2] 改文案后 hero 含 十月总收入:', heroText2.includes('十月总收入'))
await page.screenshot({ path: `${OUT}/02-kpi-label-edited.png`, fullPage: false })

// ── b) 数据格开条形 66%（点「工资收入」行占比格：列2 x=260~400，行1 y=68~104 相对画布）──
const canvas = page.getByTestId('preview-canvas')
const box = await canvas.boundingBox()
console.log('[b] canvas bbox:', JSON.stringify(box))
// 行序：表头36 + 分组行32 + 数据行1..；点数据行1 占比格中心
await canvas.click({ position: { x: 330, y: 36 + 32 + 18 } })
await page.waitForTimeout(600)
const headline = await page.getByTestId('slot-headline').innerText().catch(() => '(无)')
console.log('[b] 选中槽 headline:', headline)
const barArea = page.getByTestId('bar-area')
console.log('[b] 条形区出现:', await barArea.isVisible().catch(() => false))
await page.getByTestId('bar-toggle').check()
await page.waitForTimeout(900)
const ratioVal = await page.getByTestId('bar-ratio').inputValue()
console.log('[b] 条形默认比例:', ratioVal)
await page.screenshot({ path: `${OUT}/03-bar-cell-preview.png`, fullPage: false })

// ── c) 复制 HTML 验证 kpi/bar 节点（读 text/html 风味；readText 只有 TSV plain 风味）──
await page.getByRole('button', { name: '导出', exact: true }).click()
await page.getByRole('button', { name: '复制 HTML' }).click()
await page.waitForTimeout(1200)
const clip = await page.evaluate(async () => {
  const items = await navigator.clipboard.read()
  for (const it of items) {
    if (it.types.includes('text/html')) return await (await it.getType('text/html')).text()
  }
  return ''
})
const tsv = await page.evaluate(() => navigator.clipboard.readText())
console.log('[c] TSV plain 风味首行:', tsv.split('\n')[0])
const kpiPart = clip.includes('data-pt-kpi="1"')
const barPart = /width:66%/.test(clip)
const tablePart = clip.includes('<table')
console.log('[c] 复制 HTML 长度:', clip.length)
console.log('[c] 含 KPI 卡节点(data-pt-kpi):', kpiPart)
console.log('[c] 含条形宽度百分比(width:66%):', barPart)
console.log('[c] 含表格:', tablePart)
// 贴出关键片段
const kpiIdx = clip.indexOf('data-pt-kpi')
console.log('[c] KPI 片段:', clip.slice(Math.max(0, kpiIdx - 60), kpiIdx + 320))
const barIdx = clip.indexOf('width:66%')
console.log('[c] bar 片段:', clip.slice(Math.max(0, barIdx - 260), barIdx + 160))

// ── d) 新标签页打开 ──
const popupPromise = page.waitForEvent('popup', { timeout: 15000 })
await page.getByTestId('png-open-tab').click()
const popup = await popupPromise
await popup.waitForLoadState('domcontentloaded')
await popup.waitForTimeout(2500)
console.log('[d] 新标签 URL scheme:', (await popup.url()).slice(0, 30))
const pngInfo = await popup.evaluate(() => {
  const img = document.images[0]
  if (!img) return { hasImg: false }
  return { hasImg: true, complete: img.complete, w: img.naturalWidth, h: img.naturalHeight }
})
console.log('[d] 新标签图片信息:', JSON.stringify(pngInfo))
await popup.screenshot({ path: `${OUT}/04-png-new-tab.png` })
await popup.close()

await browser.close()

console.log('---')
console.log('[gate] console error 数:', consoleErrors.length)
consoleErrors.forEach((e) => console.log('  console.error:', e.slice(0, 200)))
console.log('[gate] pageerror 数:', pageErrors.length)
pageErrors.forEach((e) => console.log('  pageerror:', e.slice(0, 200)))
console.log('DONE')
