// 探路脚本：模板库 + 编辑台 UI 结构 dump
import { chromium } from '@playwright/test'
import process from 'node:process'

process.env.NO_PROXY ??= 'localhost,127.0.0.1,::1'
process.env.no_proxy ??= 'localhost,127.0.0.1,::1'

const OUT = 'F:/pretty-table/reports/tables-20261107'
const BASE = 'http://127.0.0.1:5173'
const consoleErrors = []
const pageErrors = []

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
const page = await context.newPage()
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', (e) => pageErrors.push(String(e)))

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
await page.screenshot({ path: `${OUT}/exp-00-home.png` })

// 模板卡片列表
const cards = await page.locator('article.card').allInnerTexts()
console.log('[模板卡]', JSON.stringify(cards, null, 1))

// 页面所有按钮
const btns = await page.locator('button:visible').allInnerTexts()
console.log('[首页按钮]', JSON.stringify(btns))

// 进入「空白」模板
const blankCard = page.locator('article.card', { hasText: '空白' }).first()
if (await blankCard.count()) {
  await blankCard.getByRole('button').first().click()
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${OUT}/exp-01-editor.png` })
  // 编辑台 testid 汇总
  const tids = await page.evaluate(() => {
    const out = []
    document.querySelectorAll('[data-testid]').forEach((el) => {
      out.push(el.getAttribute('data-testid') + ' :: ' + (el.innerText || '').slice(0, 40).replace(/\n/g, ' | '))
    })
    return out
  })
  console.log('[testids]', JSON.stringify(tids, null, 1))
  // 可见按钮
  const ebtns = await page.locator('button:visible').allInnerTexts()
  console.log('[编辑台按钮]', JSON.stringify(ebtns))
}

await browser.close()
console.log('---')
console.log('[gate] console error 数:', consoleErrors.length, '| pageerror 数:', pageErrors.length)
consoleErrors.slice(0, 10).forEach((e) => console.log('  console.error:', e.slice(0, 160)))
pageErrors.slice(0, 10).forEach((e) => console.log('  pageerror:', e.slice(0, 160)))
console.log('EXPLORE_DONE')
