// 调试10：y 偏移量化 + 键盘导航验证
import { launch, openTemplate, clickCellV, fillSlot } from './helpers.mjs'

const log = (...a) => console.log('[dbg10]', ...a)
const { browser, page } = await launch()
try {
  await openTemplate(page, '多列对比')
  const rowHeights = [36, 36, 32, 36, 36, 36, 36, 36, 36, 36, 32]
  const colX = (c) => [120, 140, 140, 140].slice(0, c).reduce((a, b) => a + b, 0) + 70

  // 1) y 偏移量化：R1 中心 54 / 下缘 68 / R1 下 72+4
  for (const y of [54, 63, 68, 71]) {
    const g = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="preview-canvas"]')
      const r = el.getBoundingClientRect()
      return { l: r.left, t: r.top }
    })
    await page.mouse.click(Math.round(g.l + colX(1)), Math.round(g.t + y))
    await page.waitForTimeout(200)
    log(`y=${y} →`, await page.getByTestId('slot-headline').innerText().catch(() => '(无)'))
  }

  // 2) 键盘导航：点 R0C1 后 ArrowDown
  await clickCellV(page, rowHeights, 0, colX(1))
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(250)
  log('R0C1 + ArrowDown →', await page.getByTestId('slot-headline').innerText().catch(() => '(无)'))
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(250)
  log('再 ArrowDown →', await page.getByTestId('slot-headline').innerText().catch(() => '(无)'))
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(250)
  log('ArrowRight →', await page.getByTestId('slot-headline').innerText().catch(() => '(无)'))
} finally {
  await browser.close()
}
console.log('[dbg10] DONE')
