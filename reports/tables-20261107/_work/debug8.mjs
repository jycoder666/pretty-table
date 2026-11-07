import { launch, openTemplate, setTheme, setColors, CREAM, COLOR_LABELS, railInsertAfter, railRemove, scrollTop, placeBlock, clickCellV, fillSlot } from './helpers.mjs'
const log = (...a) => console.log('[dbg8]', ...a)
const { browser, page } = await launch()
try {
  await openTemplate(page, '多列对比')
  await setTheme(page, '墨青簿册')
  await setColors(page, CREAM, COLOR_LABELS)
  await railRemove(page, 'col', 2)
  await railInsertAfter(page, 'col', 2)
  await railInsertAfter(page, 'col', 2)
  await railInsertAfter(page, 'row', 7)
  await railInsertAfter(page, 'row', 7)
  await railInsertAfter(page, 'row', 7)
  await railRemove(page, 'row', 5)
  await railRemove(page, 'row', 2)
  await scrollTop(page)
  const rowHeights = [36, 36, 32, 36, 36, 36, 32, 36, 36, 36, 36, 36, 36, 32]
  const cols = [120, 140, 140, 140, 140]
  const colX = (c) => cols.slice(0, c).reduce((a, b) => a + b, 0) + cols[c] / 2
  const h0 = ['安心e生', '康健守护', '无忧人生', '明悦优选']
  const h1 = ['性价比款', '大保款', '长期续保', '服务型']
  for (let c = 1; c <= 4; c++) {
    await clickCellV(page, rowHeights, 0, colX(c))
    await fillSlot(page, h0[c - 1])
    await clickCellV(page, rowHeights, 1, colX(c))
    await fillSlot(page, h1[c - 1])
  }
  for (let c = 1; c <= 4; c++) {
    await clickCellV(page, rowHeights, 1, colX(c))
    log(`R1C${c} headline:`, await page.getByTestId('slot-headline').innerText().catch(() => '(无)'))
  }
  await page.getByTestId('group-head-structure').click()
  await page.waitForTimeout(300)
  const secs = await page.locator('[data-testid="group-structure"] .section').allInnerTexts()
  log('结构组 sections:', JSON.stringify(secs))
  const ariaState = await page.getByTestId('group-head-structure').getAttribute('aria-expanded')
  log('structure expanded:', ariaState)
} finally { await browser.close() }
console.log('[dbg8] DONE')
