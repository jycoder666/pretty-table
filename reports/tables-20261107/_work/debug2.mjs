// 调试2：加行后 rail 项 dump
import { launch, openTemplate, railRemove, railInsertAfter } from './helpers.mjs'

const log = (...a) => console.log('[dbg2]', ...a)
const { browser, page } = await launch()
try {
  await openTemplate(page, '多列对比')
  await railRemove(page, 'row', 5)
  await railRemove(page, 'row', 2)
  log('删2行后:', await page.getByTestId('structure-summary').innerText())
  await railInsertAfter(page, 'row', 7)
  log('加1行后:', await page.getByTestId('structure-summary').innerText())
  const ids = await page.locator('[data-testid^="rail-row-"]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-testid')).filter((t) => t && /^rail-row-\d+$/.test(t)),
  )
  log('rail 项:', ids.join(','))
  await page.waitForTimeout(2000)
  const ids2 = await page.locator('[data-testid^="rail-row-"]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-testid')).filter((t) => t && /^rail-row-\d+$/.test(t)),
  )
  log('2s 后 rail 项:', ids2.join(','))
  // 画布内容高度
  const info = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="preview-canvas"]')
    const h = document.querySelector('.preview-host')
    return { canvasRect: c?.getBoundingClientRect().toJSON(), hostScrollTop: h?.scrollTop }
  })
  log('canvas:', JSON.stringify(info))
  const shot = 'F:/pretty-table/reports/tables-20261107/_work/dbg2.png'
  await page.screenshot({ path: shot })
  log('截图:', shot)
} finally {
  await browser.close()
}
console.log('[dbg2] DONE')
