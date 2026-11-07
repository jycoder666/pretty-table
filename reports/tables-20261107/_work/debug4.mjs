// 调试4：放置区块后，诊断画布点击被拦原因
import {
  launch, openTemplate, railInsertAfter, railRemove, assertSummary, scrollTop, placeBlock,
} from './helpers.mjs'

const log = (...a) => console.log('[dbg4]', ...a)
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
  log('结构:', await page.getByTestId('structure-summary').innerText())
  await scrollTop(page)
  await placeBlock(page, '分组标题行', 0)
  await placeBlock(page, '强调注脚', 0)
  log('区块已放')

  const info = await page.evaluate(() => {
    const host = document.querySelector('.preview-host')
    const el = document.querySelector('[data-testid="preview-canvas"]')
    const rail0 = document.querySelector('[data-testid="rail-row-0"]')
    const hr = host.getBoundingClientRect()
    const er = el.getBoundingClientRect()
    const r0 = rail0.getBoundingClientRect()
    // 内容坐标 vr2 中心 ≈ 36+36+16=88（gap1 块行）；C0 中心 x=60
    const delta = 18 - (r0.top + r0.height / 2 - hr.top + host.scrollTop)
    const y = 88 - delta
    const point = { x: er.left + 60, y: er.top + y }
    const hit = document.elementFromPoint(point.x, point.y)
    const hitChain = []
    let cur = hit
    while (cur && hitChain.length < 5) {
      hitChain.push(cur.tagName + '.' + String(cur.className).slice(0, 40))
      cur = cur.parentElement
    }
    return {
      hostRect: { top: hr.top, h: hr.height, scrollTop: host.scrollTop },
      elRect: { top: er.top, h: er.height },
      rail0: { top: r0.top, h: r0.height },
      delta, y, point,
      hit: hit ? hit.tagName + '.' + String(hit.className).slice(0, 60) : null,
      hitChain,
    }
  })
  log(JSON.stringify(info, null, 1))
} finally {
  await browser.close()
}
console.log('[dbg4] DONE')
