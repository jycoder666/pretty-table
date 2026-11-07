// 实验室2：hover 行/列轨道菜单、组件抽屉正确定位、块放置与编辑
import { chromium } from '@playwright/test'
import process from 'node:process'

process.env.NO_PROXY ??= 'localhost,127.0.0.1,::1'
process.env.no_proxy ??= 'localhost,127.0.0.1,::1'

const BASE = 'http://127.0.0.1:5173'
const consoleErrors = []

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
const page = await context.newPage()
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', (e) => consoleErrors.push(String(e)))

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
await page.locator('article.card', { hasText: '价目清单' }).first().getByRole('button', { name: '使用此模板' }).click()
await page.waitForTimeout(2000)

// 1) hover 行轨道第 12 项 → 出现 plus/menu 按钮？
const rowBtn = page.getByTestId('rail-row-12')
await rowBtn.hover()
await page.waitForTimeout(400)
const menuBtn = page.getByTestId('rail-row-menu-12')
console.log('[row menu-12 存在]', await menuBtn.count(), '可见', await menuBtn.isVisible().catch(() => false))
if (await menuBtn.isVisible().catch(() => false)) {
  await menuBtn.click()
  await page.waitForTimeout(400)
  for (const k of ['before', 'after', 'remove', 'prev', 'next']) {
    const b = page.getByTestId(`menu-row-${k}`)
    console.log(`[menu-row-${k}]`, await b.count() ? `disabled=${await b.isDisabled()} text=${await b.innerText()}` : '无')
  }
  // 试删合计行
  const rm = page.getByTestId('menu-row-remove')
  if (!(await rm.isDisabled())) {
    await rm.click()
    await page.waitForTimeout(600)
    const dlg = page.getByRole('button', { name: /删除/ }).last()
    if (await dlg.isVisible().catch(() => false)) { await dlg.click(); await page.waitForTimeout(600) }
    console.log('[删合计行后]', await page.getByTestId('structure-summary').innerText())
  }
  await page.keyboard.press('Escape')
}

// 2) 删列 C0
const colBtn = page.getByTestId('rail-col-0')
await colBtn.hover()
await page.waitForTimeout(300)
const cMenu = page.getByTestId('rail-col-menu-0')
console.log('[col menu-0 可见]', await cMenu.isVisible().catch(() => false))
if (await cMenu.isVisible().catch(() => false)) {
  await cMenu.click()
  await page.waitForTimeout(400)
  const rmC = page.getByTestId('menu-col-remove')
  console.log('[menu-col-remove]', await rmC.count() ? `disabled=${await rmC.isDisabled()}` : '无')
  if (await rmC.count() && !(await rmC.isDisabled())) {
    await rmC.click()
    await page.waitForTimeout(600)
    const dlg = page.getByRole('button', { name: /删除/ }).last()
    if (await dlg.isVisible().catch(() => false)) { await dlg.click(); await page.waitForTimeout(500) }
    console.log('[删列后]', await page.getByTestId('structure-summary').innerText())
  }
  await page.keyboard.press('Escape')
}

// 3) 组件抽屉
await page.getByTestId('library-rail-open').click()
await page.waitForTimeout(700)
const libText = await page.evaluate(() => document.querySelector('.block-lib')?.innerText?.slice(0, 200) ?? '(无 .block-lib)')
console.log('[组件库文本]', JSON.stringify(libText))
const ghBtn = page.locator('.block-lib li', { hasText: '分组标题行' })
console.log('[分组标题行 li 数]', await ghBtn.count())
if (await ghBtn.count()) {
  await ghBtn.first().click()
  await page.waitForTimeout(700)
  // 放置态：SlotOverlay 虚线槽
  const overlay = await page.evaluate(() => {
    const els = document.querySelectorAll('[class*="slot"], [class*="drop"], [class*="place"]')
    return Array.from(els).slice(0, 15).map((e) => (e.getAttribute('data-testid') || '') + '|' + e.className.toString().slice(0, 50) + '|' + (e.innerText || '').slice(0, 20))
  })
  console.log('[放置态元素]', JSON.stringify(overlay, null, 1))
  await page.screenshot({ path: 'F:/pretty-table/reports/tables-20261107/exp-30-placing.png' })
  // 点 gap-g2 槽试试（第 7 逻辑行后的块槽 → 可见行索引：0 caption,1 head,2 g1,3..8 材料6,9 g2,10..13 人工4,14 合计）
  // SlotOverlay 槽元素可点击：找 gap 相关 testid
  const g2 = page.locator('[data-testid*="gap-g2"], [data-testid="slot-gap-g2"]').first()
  console.log('[gap-g2 槽元素]', await g2.count())
  await page.keyboard.press('Escape')
}

console.log('[gate] console error 数:', consoleErrors.length)
consoleErrors.slice(0, 8).forEach((e) => console.log('  console.error:', e.slice(0, 140)))
await browser.close()
console.log('LAB2_DONE')
