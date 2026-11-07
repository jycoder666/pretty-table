// 调试：结构操作逐步验证
import { launch, openTemplate, railRemove, railInsertAfter } from './helpers.mjs'

const log = (...a) => console.log('[dbg]', ...a)
const { browser, page } = await launch()
try {
  await openTemplate(page, '多列对比')
  await page.getByTestId('group-head-style').click().catch(() => {})
  log('summary 初始:', await page.getByTestId('structure-summary').innerText())
  const countRail = async (axis) => await page.locator(`[data-testid^="rail-${axis}-"]:not([data-testid*="plus"]):not([data-testid*="menu"])`).count()

  await railRemove(page, 'col', 2)
  log('删C2后 summary:', await page.getByTestId('structure-summary').innerText(), 'cols:', await countRail('col'))

  await railInsertAfter(page, 'col', 2)
  log('加列1后:', await page.getByTestId('structure-summary').innerText(), 'cols:', await countRail('col'))
  await railInsertAfter(page, 'col', 3)
  log('加列2后:', await page.getByTestId('structure-summary').innerText(), 'cols:', await countRail('col'))

  await railRemove(page, 'row', 5)
  log('删R5后:', await page.getByTestId('structure-summary').innerText(), 'rows:', await countRail('row'))
  await railRemove(page, 'row', 2)
  log('删R2后:', await page.getByTestId('structure-summary').innerText(), 'rows:', await countRail('row'))

  for (let i = 0; i < 3; i++) {
    const lastIdx = 8 + i // 删2行后8行(R0-R7)，加第i次前尾行 = 7+i
    const expect = 7 + i
    log(`加行第${i + 1}次: hover rail-row-${expect} 实际 rows:`, await countRail('row'))
    await railInsertAfter(page, 'row', expect)
    log('  ->', await page.getByTestId('structure-summary').innerText(), 'rows:', await countRail('row'))
  }
} finally {
  await browser.close()
}
console.log('[dbg] DONE')
