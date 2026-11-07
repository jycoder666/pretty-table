import { launch, BASE } from './helpers.mjs'
const log = (...a) => console.log('[dbg11]', ...a)
const { browser, page } = await launch()
try {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  const cards = await page.locator('article.card').count()
  log('卡片数:', cards)
  const blank = page.getByTestId('blank-card')
  log('blank-card count:', await blank.count())
  if (await blank.count()) {
    log('blank-card visible:', await blank.isVisible().catch(() => false))
    log('blank-open visible:', await page.getByTestId('blank-open').isVisible().catch(() => false))
  }
  const chips = await page.locator('[data-testid^="filter-chip-"]').allInnerTexts().catch(() => [])
  log('筛选 chips:', JSON.stringify(chips))
  await page.screenshot({ path: 'dbg11.png' })
} finally { await browser.close() }
console.log('[dbg11] DONE')
