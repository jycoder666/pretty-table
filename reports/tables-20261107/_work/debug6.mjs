// 调试6：放置区块后 rail 项恢复轮询
import {
  launch, openTemplate, railInsertAfter, railRemove, scrollTop, placeBlock,
} from './helpers.mjs'

const log = (...a) => console.log('[dbg6]', ...a)
const { browser, page } = await launch()
const errs = []
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
page.on('pageerror', (e) => errs.push(String(e)))
try {
  await openTemplate(page, '多列对比')
  const railCount = async () =>
    await page.locator('[data-testid^="rail-row-"]').evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-testid')).filter((t) => t && /^rail-row-\d+$/.test(t)).length,
    )
  log('初始 rail:', await railCount())
  await placeBlock(page, '分组标题行', 0)
  log('放分组后 rail:', await railCount())
  await placeBlock(page, '强调注脚', 0)
  log('放注脚后 rail:', await railCount())
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(800)
    log(`+${(i + 1) * 800}ms rail:`, await railCount())
  }
  // 结构操作后
  await railRemove(page, 'col', 2)
  log('删C2后 rail:', await railCount())
  await railInsertAfter(page, 'row', 7)
  log('加行后 rail:', await railCount())
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(800)
    log(`+${(i + 1) * 800}ms rail:`, await railCount())
  }
} finally {
  await browser.close()
}
console.log('[dbg6] console errors:', errs.length)
errs.slice(0, 5).forEach((e) => console.log('  err:', e.slice(0, 300)))
console.log('[dbg6] DONE')
