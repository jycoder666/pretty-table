// 探路3：格子编辑 + 组件抽屉 + 样式 + 结构 + 导出
import { chromium } from '@playwright/test'
import process from 'node:process'

process.env.NO_PROXY ??= 'localhost,127.0.0.1,::1'
process.env.no_proxy ??= 'localhost,127.0.0.1,::1'

const OUT = 'F:/pretty-table/reports/tables-20261107'
const BASE = 'http://127.0.0.1:5173'
const consoleErrors = []

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
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

// 1. 点击表头第一格（0 列表头）
const canvas = page.getByTestId('preview-canvas')
const box = await canvas.boundingBox()
console.log('[canvas]', JSON.stringify(box))
await canvas.click({ position: { x: 40, y: 18 } })
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/exp-20-cell-selected.png` })
// 内容面板结构
const contentHtml = await page.evaluate(() => {
  const g = document.querySelector('[data-testid="group-content"]')
  return g ? g.innerText.slice(0, 500) : '(无)'
})
console.log('[内容面板]', JSON.stringify(contentHtml))
const contentTids = await page.evaluate(() => {
  const g = document.querySelector('[data-testid="group-content"]')
  if (!g) return []
  return Array.from(g.querySelectorAll('[data-testid]')).map((el) =>
    el.tagName.toLowerCase() + ' #' + el.getAttribute('data-testid') + ' :: ' + (el.innerText || el.value || '').slice(0, 50).replace(/\n/g, ' | '))
})
console.log('[内容面板 testids]\n' + contentTids.join('\n'))

// 2. 组件抽屉
await page.getByTestId('library-rail-open').click()
await page.waitForTimeout(800)
const libTids = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('[data-testid^="lib-"]')).map((el) =>
    el.getAttribute('data-testid') + ' :: ' + (el.innerText || '').slice(0, 60).replace(/\n/g, ' | '))
})
console.log('[组件库]', JSON.stringify(libTids, null, 1))
await page.screenshot({ path: `${OUT}/exp-21-library.png` })
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// 3. 样式面板
await page.getByTestId('group-head-style').click()
await page.waitForTimeout(500)
const styleTids = await page.evaluate(() => {
  const g = document.querySelector('[data-testid="group-style"]')
  if (!g) return []
  return Array.from(g.querySelectorAll('[data-testid], select, input')).map((el) =>
    (el.getAttribute('data-testid') ? '#' + el.getAttribute('data-testid') : el.tagName.toLowerCase() + ':' + (el.name || el.id || '')) + ' :: ' + (el.innerText || el.value || '').slice(0, 50).replace(/\n/g, ' | '))
})
console.log('[样式面板]\n' + styleTids.join('\n'))
await page.screenshot({ path: `${OUT}/exp-22-style.png` })

// 主题下拉选项
const themeSelect = page.locator('#group-style select, [data-testid="theme-select"]')
if (await themeSelect.count()) {
  const opts = await themeSelect.locator('option').allInnerTexts()
  console.log('[主题选项]', JSON.stringify(opts))
}

// 4. 结构面板
await page.getByTestId('group-head-structure').click()
await page.waitForTimeout(500)
const structTids = await page.evaluate(() => {
  const g = document.querySelector('[data-testid="group-structure"]')
  if (!g) return []
  return Array.from(g.querySelectorAll('[data-testid], select, button, input')).map((el) =>
    (el.getAttribute('data-testid') ? '#' + el.getAttribute('data-testid') : el.tagName.toLowerCase()) + ' :: ' + (el.innerText || el.value || '').slice(0, 50).replace(/\n/g, ' | '))
})
console.log('[结构面板]\n' + structTids.join('\n'))

// 5. 导出抽屉
await page.getByRole('button', { name: '导出', exact: true }).click()
await page.waitForTimeout(800)
const expTids = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('[data-testid^="png-"], [data-testid^="export-"]')).map((el) =>
    el.getAttribute('data-testid') + ' :: ' + (el.innerText || '').slice(0, 50).replace(/\n/g, ' | '))
})
console.log('[导出抽屉]', JSON.stringify(expTids))
await page.screenshot({ path: `${OUT}/exp-23-export.png` })
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// 6. 另存为模板对话框
await page.getByRole('button', { name: '另存为模板' }).click()
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/exp-24-save-tpl.png` })
const saveTids = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('dialog [data-testid], [data-testid^="save-"]')).map((el) =>
    el.getAttribute('data-testid') + ' :: ' + (el.innerText || el.value || '').slice(0, 50).replace(/\n/g, ' | '))
})
console.log('[另存模板]', JSON.stringify(saveTids))
const dlgInput = page.locator('dialog input, [data-testid="tpl-name-input"]')
if (await dlgInput.count()) console.log('[另存模板输入框存在]')

await browser.close()
console.log('[gate] console error 数:', consoleErrors.length)
consoleErrors.slice(0, 10).forEach((e) => console.log('  console.error:', e.slice(0, 160)))
console.log('EXPLORE3_DONE')
