// v5：任务1（避开相邻组行约束）+ 任务6（textarea 用 block-headline 邻接定位）
import { chromium } from '@playwright/test'
import process from 'node:process'

process.env.NO_PROXY ??= 'localhost,127.0.0.1,::1'
process.env.no_proxy ??= 'localhost,127.0.0.1,::1'
const BASE = 'http://127.0.0.1:5173'
const OUT = 'F:/pretty-table/reports/feat2-20261107'

async function withPage(fn) {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
  const page = await context.newPage()
  try { await fn(page) } finally { await browser.close() }
}
const selBarSilence = (page) => page.evaluate(() => {
  const el = document.querySelector('[data-testid="selection-bar"]')
  if (el) el.style.pointerEvents = 'none'
  document.querySelectorAll('.block-handle, .block-handle-wrap').forEach((b) => { b.style.pointerEvents = 'none' })
})
const ghCount = (page) => page.evaluate(() => {
  const app = document.querySelector('#app')?.__vue_app__
  const store = app?.config.globalProperties?.$pinia?._s?.get('editor')
  return store?.current?.blocks?.filter((b) => b.type === 'groupHeader').length ?? -1
})

// ── 1. 分组动态化：插到行2、行3、行5（避开紧贴已有分组行下方）──
await withPage(async (page) => {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await page.locator('article.card', { hasText: '价目清单' }).first().getByRole('button', { name: '使用此模板' }).click()
  await page.waitForTimeout(2200)
  await page.getByTestId('group-head-structure').click()
  await page.waitForTimeout(400)
  const before = await ghCount(page)
  let ok = 0
  for (const downs of [2, 3, 5]) {
    await selBarSilence(page)
    await page.getByTestId('preview-canvas').click({ position: { x: 36, y: 16 } })
    await page.waitForTimeout(250)
    for (let k = 0; k < downs; k++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(120) }
    const btn = page.getByTestId('group-add')
    if (await btn.isDisabled().catch(() => true)) continue
    await btn.click()
    await page.waitForTimeout(900)
    const now = await ghCount(page)
    if (now > before + ok) ok++
  }
  const after = await ghCount(page)
  console.log(`[${after === before + 3 ? 'PASS' : 'FAIL'}] 1. 分组动态化 :: ${before}→${after}（成功 ${ok}/3；插入点=行2/3/5，行4 紧贴分组行下方的拒绝为设计约束）`)
  await page.screenshot({ path: `${OUT}/01-分组动态化.png`, fullPage: true })
})

// ── 6. leftTag 放置与文字编辑 ──
await withPage(async (page) => {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await page.getByTestId('blank-card').getByRole('button', { name: '配置并新建' }).click()
  await page.getByTestId('blank-wizard').waitFor({ state: 'visible', timeout: 5000 })
  await page.getByTestId('blank-create').click()
  await page.waitForTimeout(2200)
  const railBtn = page.getByTestId('library-rail-open')
  if (await railBtn.isVisible().catch(() => false)) { await railBtn.click(); await page.waitForTimeout(500) }
  await page.locator('.block-lib li', { hasText: '左栏标签' }).first().click()
  await page.waitForTimeout(600)
  await selBarSilence(page)
  const n = await page.locator('.slot-hit.hot, .slot-hit.focused').count()
  if (!n) { console.log('[FAIL] 6. leftTag :: 无放置槽'); return }
  await page.locator('.slot-hit.hot, .slot-hit.focused').first().click()
  await page.waitForTimeout(600)
  const sel = await page.evaluate(() => {
    const app = document.querySelector('#app')?.__vue_app__
    const store = app?.config.globalProperties?.$pinia?._s?.get('editor')
    const b = store?.current?.blocks?.find((x) => x.type === 'leftTag')
    if (!b) return 'no-block'
    store.selectedBlockId = b.id
    return b.id
  })
  await page.waitForTimeout(700)
  const ta = page.locator('[data-testid="block-headline"] + textarea')
  const vis = await ta.isVisible().catch(() => false)
  let typed = false
  if (sel !== 'no-block' && vis) {
    await ta.fill('城东')
    await ta.blur()
    await page.waitForTimeout(500)
    typed = await page.evaluate(() => {
      const app = document.querySelector('#app')?.__vue_app__
      const store = app?.config.globalProperties?.$pinia?._s?.get('editor')
      return store?.current?.blocks?.find((x) => x.type === 'leftTag')?.props?.text === '城东'
    })
  }
  console.log(`[${sel !== 'no-block' && vis && typed ? 'PASS' : 'FAIL'}] 6. leftTag可编辑 :: 选中=${sel} 编辑入口=${vis} 写入生效=${typed}`)
  await page.screenshot({ path: `${OUT}/06-leftTag.png`, fullPage: true })
})
