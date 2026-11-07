// 探路2：空白向导 → 编辑台结构 dump
import { chromium } from '@playwright/test'
import process from 'node:process'

process.env.NO_PROXY ??= 'localhost,127.0.0.1,::1'
process.env.no_proxy ??= 'localhost,127.0.0.1,::1'

const OUT = 'F:/pretty-table/reports/tables-20261107'
const BASE = 'http://127.0.0.1:5173'
const consoleErrors = []

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
const page = await context.newPage()
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', (e) => consoleErrors.push(String(e)))

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)

// 打开空白向导，填 8 行 6 列 1 层，创建
await page.getByTestId('blank-card').getByRole('button', { name: /配置并新建/ }).click()
await page.getByTestId('blank-wizard').waitFor({ state: 'visible', timeout: 4000 })
await page.getByTestId('blank-rows').fill('8')
await page.getByTestId('blank-cols').fill('6')
await page.getByTestId('blank-levels').selectOption('1')
await page.getByTestId('blank-create').click()
await page.waitForTimeout(2000)
await page.screenshot({ path: `${OUT}/exp-10-editor.png` })

// 编辑台全量 testid
const tids = await page.evaluate(() => {
  const out = []
  document.querySelectorAll('[data-testid]').forEach((el) => {
    const tag = el.tagName.toLowerCase()
    out.push(tag + ' #' + el.getAttribute('data-testid') + ' :: ' + (el.innerText || '').slice(0, 60).replace(/\n/g, ' | '))
  })
  return out
})
console.log('[testids]\n' + tids.join('\n'))

// 顶部/侧栏可见按钮
const ebtns = await page.locator('button:visible').allInnerTexts()
console.log('[编辑台按钮]', JSON.stringify(ebtns))

// 画布 bbox
const canvas = page.getByTestId('preview-canvas')
if (await canvas.count()) {
  console.log('[canvas bbox]', JSON.stringify(await canvas.boundingBox()))
}

await browser.close()
console.log('[gate] console error 数:', consoleErrors.length)
consoleErrors.slice(0, 10).forEach((e) => console.log('  console.error:', e.slice(0, 160)))
console.log('EXPLORE2_DONE')
