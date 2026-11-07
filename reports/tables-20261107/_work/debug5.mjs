// 调试5b：mouse.click 页面坐标命中验证
import {
  launch, openTemplate, railInsertAfter, railRemove, scrollTop, placeBlock,
} from './helpers.mjs'

const log = (...a) => console.log('[dbg5]', ...a)
const { browser, page } = await launch()
try {
  await openTemplate(page, '多列对比')
  await railRemove(page, 'col', 2)
  await railInsertAfter(page, 'col', 2)
  await railInsertAfter(page, 'col', 2)
  await railInsertAfter(page, 'row', 7)
  await railInsertAfter(page, 'row', 7)
  await railInsertAfter(page, 'row', 7)
  await railRemove(page, 'row', 5)
  await railRemove(page, 'row', 2)
  await scrollTop(page)
  await placeBlock(page, '分组标题行', 0)
  await placeBlock(page, '强调注脚', 0)
  const rowHeights = [36, 36, 32, 36, 36, 36, 32, 36, 36, 36, 36, 36, 36, 32]
  const cols = [120, 140, 140, 140, 140]
  const colX = (c) => cols.slice(0, c).reduce((a, b) => a + b, 0) + cols[c] / 2

  async function clickV(vr, x) {
    const rail0 = await page.getByTestId('rail-row-0').boundingBox()
    const hostInfo = await page.evaluate(() => {
      const h = document.querySelector('.preview-host')
      return { top: h.getBoundingClientRect().top, scrollTop: h.scrollTop }
    })
    const cellCenter0 = rail0.top + rail0.height / 2 - hostInfo.top + hostInfo.scrollTop
    const delta = rowHeights[0] / 2 - cellCenter0
    let cy = 0
    for (let i = 0; i < vr; i++) cy += rowHeights[i]
    cy += rowHeights[vr] / 2
    const y = cy - delta
    const g = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="preview-canvas"]')
      const r = el.getBoundingClientRect()
      return { l: r.left, t: r.top }
    })
    log('clickV coords:', { x: Math.round(g.l + x), y: Math.round(g.t + y), g, rail0Top: rail0?.top, hostInfo, delta, y })
    await page.mouse.click(Math.round(g.l + x), Math.round(g.t + y))
    await page.waitForTimeout(250)
  }

  await clickV(2, colX(0))
  log('gap1 块行:', await page.getByTestId('block-headline').innerText().catch(() => '(无)'))
  await clickV(0, colX(1))
  log('R0C1 槽:', await page.getByTestId('slot-headline').innerText().catch(() => '(无)'))
  await clickV(12, colX(4))
  log('R10C4 槽:', await page.getByTestId('slot-headline').innerText().catch(() => '(无)'))
  await clickV(13, colX(0))
  log('footer 块行:', await page.getByTestId('block-headline').innerText().catch(() => '(无)'))
} finally {
  await browser.close()
}
console.log('[dbg5] DONE')
