import { launch, openTemplate, createBlank, railInsertAfter, scrollTop, clickCellV, fillSlot } from './helpers.mjs'
const log = (...a) => console.log('[dbg12]', ...a)
const { browser, page } = await launch()
try {
  await openTemplate(page, '单主体明细')
  await railInsertAfter(page, 'col', 2)
  await railInsertAfter(page, 'col', 2)
  await scrollTop(page)
  log('detail 5列完成')
  await page.getByRole('button', { name: '← 模板库' }).click()
  await page.waitForTimeout(800)
  const leave = page.getByTestId('confirm-ok')
  log('confirm visible:', await leave.isVisible().catch(() => false))
  if (await leave.isVisible().catch(() => false)) {
    await leave.click()
    await page.waitForTimeout(800)
  }
  log('当前 URL:', page.url())
  const cards = await page.locator('article.card').count().catch(() => -1)
  log('卡片数:', cards)
  await page.screenshot({ path: 'dbg12.png' })
  await createBlank(page, 8, 5, 1)
  log('blank 创建:', await page.getByTestId('structure-summary').innerText())
} finally { await browser.close() }
console.log('[dbg12] DONE')
