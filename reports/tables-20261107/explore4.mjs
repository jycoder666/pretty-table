// 探路4：组件抽屉全按钮/导出抽屉全按钮/另存模板dialog/主题select/槽位textarea/行列菜单
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
await page.getByTestId('blank-card').getByRole('button', { name: /配置并新建/ }).click()
await page.getByTestId('blank-wizard').waitFor({ state: 'visible', timeout: 4000 })
await page.getByTestId('blank-rows').fill('8')
await page.getByTestId('blank-cols').fill('6')
await page.getByTestId('blank-levels').selectOption('1')
await page.getByTestId('blank-create').click()
await page.waitForTimeout(1800)

// 1. 组件抽屉（按钮+文本全 dump）
await page.getByTestId('library-rail-open').click()
await page.waitForTimeout(900)
const libDump = await page.evaluate(() => {
  const rail = document.querySelector('[data-testid="library-rail"]') || document.body
  const items = []
  rail.querySelectorAll('[data-testid], .lib-item, [class*="lib"]').forEach((el) => {
    const t = el.getAttribute('data-testid')
    if (t && !items.find((i) => i.startsWith(t + ' '))) items.push(t + ' :: ' + (el.innerText || '').slice(0, 70).replace(/\n/g, ' | '))
  })
  return items
})
console.log('[组件抽屉条目]', JSON.stringify(libDump, null, 1))
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// 2. 点画布格 → 槽位 textarea
const canvas = page.getByTestId('preview-canvas')
await canvas.click({ position: { x: 200, y: 70 } })
await page.waitForTimeout(600)
const ta = page.locator('#group-content textarea, textarea:visible')
console.log('[textarea count]', await ta.count())
if (await ta.count()) {
  console.log('[textarea value]', JSON.stringify(await ta.first().inputValue()))
  console.log('[textarea label]', JSON.stringify(await page.evaluate(() => {
    const g = document.querySelector('[data-testid="group-content"]')
    return g ? g.querySelector('label, .label, h4, h5')?.innerText : ''
  })))
}

// 3. 行/列 rail 菜单
await page.getByTestId('rail-col-2').click()
await page.waitForTimeout(500)
const colMenu = await page.evaluate(() => Array.from(document.querySelectorAll('[role="menu"] button, .rail-menu button, [data-testid*="menu"] button')).map((b) => b.innerText.replace(/\n/g, '|')))
console.log('[列菜单]', JSON.stringify(colMenu))
await page.keyboard.press('Escape')
await page.getByTestId('rail-row-2').click()
await page.waitForTimeout(500)
const rowMenu = await page.evaluate(() => Array.from(document.querySelectorAll('[role="menu"] button, .rail-menu button, [data-testid*="menu"] button')).map((b) => b.innerText.replace(/\n/g, '|')))
console.log('[行菜单]', JSON.stringify(rowMenu))
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// 4. 样式面板：主题 select
await page.getByTestId('group-head-style').click()
await page.waitForTimeout(500)
const styleInfo = await page.evaluate(() => {
  const g = document.querySelector('[data-testid="group-style"]')
  if (!g) return {}
  const selects = Array.from(g.querySelectorAll('select')).map((s) => ({ name: s.name || s.id, value: s.value, options: Array.from(s.options).map((o) => o.value + '=' + o.text) }))
  const html = g.innerText.slice(0, 400)
  return { selects, html }
})
console.log('[样式select]', JSON.stringify(styleInfo.selects, null, 1))
console.log('[样式文本]', JSON.stringify(styleInfo.html))

// 5. 导出抽屉全按钮
await page.getByRole('button', { name: '导出', exact: true }).click()
await page.waitForTimeout(900)
const expDump = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('aside button, dialog button, [class*="drawer"] button, [class*="export"] button')).map((b) => (b.getAttribute('data-testid') || '') + ' :: ' + b.innerText.replace(/\n/g, '|').slice(0, 40))
})
console.log('[导出抽屉按钮]', JSON.stringify(expDump))
const scaleInput = page.locator('input[type="number"]')
console.log('[导出数字输入]', await scaleInput.count())
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// 6. 另存为模板 dialog
await page.getByRole('button', { name: '另存为模板' }).click()
await page.waitForTimeout(800)
const dlgDump = await page.evaluate(() => {
  const d = document.querySelector('dialog[open], .modal, [class*="dialog"]')
  if (!d) return '(未找到 dialog)'
  return Array.from(d.querySelectorAll('input, button, select, textarea')).map((el) =>
    el.tagName.toLowerCase() + (el.name ? '[' + el.name + ']' : '') + (el.getAttribute('data-testid') ? '#' + el.getAttribute('data-testid') : '') + ' :: ' + (el.type || '') + ' :: ' + (el.value || el.innerText || '').slice(0, 40).replace(/\n/g, '|'))
})
console.log('[另存模板 dialog]', JSON.stringify(dlgDump, null, 1))

await browser.close()
console.log('[gate] console error 数:', consoleErrors.length)
consoleErrors.slice(0, 10).forEach((e) => console.log('  console.error:', e.slice(0, 160)))
console.log('EXPLORE4_DONE')
