// 调试7：删行后画布渲染状态 + 内容坐标 mouse click 命中
import { launch, openTemplate, railRemove, railInsertAfter, scrollTop, placeBlock } from './helpers.mjs'

const log = (...a) => console.log('[dbg7]', ...a)
const { browser, page } = await launch()
const errs = []
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
page.on('pageerror', (e) => errs.push(String(e)))
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
  await page.waitForTimeout(1500)

  const info = await page.evaluate(() => {
    const host = document.querySelector('.preview-host')
    const el = document.querySelector('[data-testid="preview-canvas"]')
    const canvas = el.querySelector('canvas')
    const rails = [...document.querySelectorAll('[data-testid^="rail-row-"]')]
      .map((e) => e.getAttribute('data-testid'))
      .filter((t) => t && /^rail-row-\d+$/.test(t))
    return {
      hostScrollTop: host.scrollTop,
      hostH: host.getBoundingClientRect().height,
      elH: el.getBoundingClientRect().height,
      canvasH: canvas ? canvas.getBoundingClientRect().height : null,
      canvasAttrH: canvas ? canvas.height : null,
      rails,
    }
  })
  log('状态:', JSON.stringify(info))

  // 内容坐标直点（假设无内部滚动）：R0C1 中心 x=190 y=18
  const g = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="preview-canvas"]')
    const r = el.getBoundingClientRect()
    return { l: r.left, t: r.top }
  })
  await page.mouse.click(Math.round(g.l + 190), Math.round(g.t + 18))
  await page.waitForTimeout(300)
  log('R0C1 槽:', await page.getByTestId('slot-headline').innerText().catch(() => '(无)'))
  // R10C4: y = 8×36+2×32 前 10 行 = 36*8? R10 vr12: 36+36+32+36*3+32+36*5 = 408; +18=426
  let yAcc = 0
  const rowHeights = [36, 36, 32, 36, 36, 36, 32, 36, 36, 36, 36, 36, 36, 32]
  for (let i = 0; i < 12; i++) yAcc += rowHeights[i]
  await page.mouse.click(Math.round(g.l + 610), Math.round(g.t + yAcc + 18))
  await page.waitForTimeout(300)
  log('R10C4 槽:', await page.getByTestId('slot-headline').innerText().catch(() => '(无)'))
  // gap1 块行 vr2 y=36+36+16=88
  await page.mouse.click(Math.round(g.l + 60), Math.round(g.t + 88))
  await page.waitForTimeout(300)
  log('gap1 块行:', await page.getByTestId('block-headline').innerText().catch(() => '(无)'))
} finally {
  await browser.close()
}
console.log('[dbg7] console errors:', errs.length)
errs.slice(0, 5).forEach((e) => console.log('  err:', e.slice(0, 300)))
console.log('[dbg7] DONE')
