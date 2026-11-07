import { launch, openTemplate, railInsertAfter, BASE } from './helpers.mjs'
const log = (...a) => console.log('[dbg13]', ...a)
const { browser, page } = await launch()
try {
  await openTemplate(page, '单主体明细')
  await railInsertAfter(page, 'col', 2)
  await page.getByRole('button', { name: '← 模板库' }).click()
  const leave = page.getByTestId('confirm-ok')
  try { await leave.waitFor({ state: 'visible', timeout: 4000 }); await leave.click() } catch {}
  await page.waitForTimeout(800)
  log('返回后 URL:', page.url())
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  log('goto 后 URL:', page.url())
  log('blank-card:', await page.getByTestId('blank-card').count())
  log('heading 统计看板:', await page.getByRole('heading', { name: '统计看板' }).count())
  const txt = await page.locator('body').innerText().catch(() => '')
  log('body 首行:', txt.split('\n').slice(0, 6).join(' | '))
  await page.screenshot({ path: 'dbg13.png' })
} finally { await browser.close() }
console.log('[dbg13] DONE')
