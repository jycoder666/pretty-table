import { launch, openTemplate, railInsertAfter } from './helpers.mjs'
const log = (...a) => console.log('[dbg14]', ...a)
const { browser, page } = await launch()
try {
  await openTemplate(page, '单主体明细')
  await railInsertAfter(page, 'col', 2)
  await page.getByRole('button', { name: '← 模板库' }).click()
  const leave = page.getByTestId('confirm-ok')
  try { await leave.waitFor({ state: 'visible', timeout: 4000 }); await leave.click() } catch { log('无确认弹窗') }
  await page.waitForTimeout(800)
  await page.getByTestId('blank-open').click()
  await page.waitForTimeout(400)
  await page.getByTestId('blank-rows').fill('8')
  await page.getByTestId('blank-cols').fill('5')
  await page.getByTestId('blank-levels').selectOption('1')
  await page.getByTestId('blank-create').click()
  await page.waitForTimeout(2500)
  log('summary:', await page.getByTestId('structure-summary').innerText().catch(() => '(无)'))
  log('toast/body:', (await page.locator('body').innerText()).split('\n').slice(0, 4).join(' | '))
} finally { await browser.close() }
console.log('[dbg14] DONE')
