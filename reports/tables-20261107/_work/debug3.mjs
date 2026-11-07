// 调试3：加行后 resize 强刷 rail 项 + rail bbox 点击验证
import { launch, openTemplate, railRemove, railInsertAfter } from './helpers.mjs'

const log = (...a) => console.log('[dbg3]', ...a)
const { browser, page } = await launch()
try {
  await openTemplate(page, '多列对比')
  await railRemove(page, 'row', 5)
  await railRemove(page, 'row', 2)
  log('删2行:', await page.getByTestId('structure-summary').innerText())

  const railCount = async () =>
    await page.locator('[data-testid^="rail-row-"]').evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-testid')).filter((t) => t && /^rail-row-\d+$/.test(t)).length,
    )

  // 加行：固定用 rail-row-7 的 plus（R7 恒存在）
  await page.getByTestId('rail-row-7').hover()
  await page.waitForTimeout(200)
  await page.getByTestId('rail-row-plus-7').click()
  await page.waitForTimeout(500)
  log('加1行:', await page.getByTestId('structure-summary').innerText(), 'rail数:', await railCount())

  // resize 强刷
  await page.evaluate(() => window.dispatchEvent(new Event('resize')))
  await page.waitForTimeout(600)
  log('resize 后 rail数:', await railCount())

  // 再加 2 行
  for (let i = 0; i < 2; i++) {
    await page.getByTestId('rail-row-7').hover()
    await page.waitForTimeout(200)
    await page.getByTestId('rail-row-plus-7').click()
    await page.waitForTimeout(500)
    await page.evaluate(() => window.dispatchEvent(new Event('resize')))
    await page.waitForTimeout(400)
  }
  log('最终:', await page.getByTestId('structure-summary').innerText(), 'rail数:', await railCount())

  // rail bbox 点击验证：点 R10（新行）C2 —— 用页面坐标
  const railRow = await page.getByTestId('rail-row-10').boundingBox()
  const railCol = await page.getByTestId('rail-col-2').boundingBox()
  log('railRow10 bbox:', JSON.stringify(railRow), 'railCol2 bbox:', JSON.stringify(railCol))
  if (railRow && railCol) {
    await page.mouse.click(railCol.x + railCol.width / 2, railRow.y + railRow.height / 2)
    await page.waitForTimeout(400)
    log('点击后 headline:', await page.getByTestId('slot-headline').innerText().catch(() => '(无)'))
  }
} finally {
  await browser.close()
}
console.log('[dbg3] DONE')
