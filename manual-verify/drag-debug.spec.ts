import { test, type Page } from '@playwright/test'

import { openPreset } from '../e2e/acceptance/helpers'

/**
 * 拖拽技术调试（非交付用例）：确认 dnd-kit 指针拖拽在真实浏览器里的可行手势，
 * 以及 place 模式（点击/Enter 待放置）兜底路径。默认 chromium 运行，可 --browser=webkit。
 */

async function diag(page: Page, label: string) {
  const d = await page.evaluate(() => ({
    slotHits: document.querySelectorAll('.slot-hit').length,
    overlay: document.querySelector('.slot-overlay')?.className ?? null,
    libActive: Array.from(document.querySelectorAll('.block-lib li')).map((li) => li.className),
  }))
  console.log(`[${label}]`, JSON.stringify(d))
  return d
}

test('拖拽手势诊断', async ({ page }) => {
  test.setTimeout(120_000)
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('[console.error]', m.text())
  })
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  await openPreset(page, '多列对比表')
  await diag(page, 'before')

  const libItem = page.locator('.block-lib li', { hasText: '分区色条' })
  const box = (await libItem.boundingBox())!
  console.log('libItem box', JSON.stringify(box))

  // 手势 A：按下 → 小步移动 → 观察
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(120)
  await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 6, { steps: 3 })
  await page.waitForTimeout(120)
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 8 })
  await page.waitForTimeout(300)
  const during = await diag(page, 'during-drag')

  if (during.slotHits === 0) {
    // 手势 B：先移出再移回（部分 dnd 实现要求首帧位移阈值）
    await page.mouse.move(box.x + 200, box.y + 200, { steps: 10 })
    await page.waitForTimeout(300)
    await diag(page, 'during-drag-moved-out')
  }

  const slotCount = await page.locator('.slot-hit').count()
  if (slotCount > 0) {
    const tb = (await page.locator('.slot-hit').nth(1).boundingBox())!
    await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 20 })
    await page.waitForTimeout(300)
    await page.mouse.up()
    await page.waitForTimeout(600)
    await diag(page, 'after-drop')
    // 导出 HTML 里是否出现「分区」
    await page.getByRole('button', { name: '导出', exact: true }).click()
    await page.getByTestId('html-preview-btn').click()
    const frame = await (await page.locator('[data-testid="html-preview-frame"]').elementHandle())?.contentFrame()
    const txt = ((await frame!.locator('body').innerText()) ?? '').replace(/\s+/g, '')
    console.log('afterHasBlock=', txt.includes('分区'))
  } else {
    await page.mouse.up()
    await page.waitForTimeout(200)
    // 兜底：点击库项进入待放置模式
    await libItem.click()
    await page.waitForTimeout(300)
    const placed = await diag(page, 'place-mode')
    if (placed.slotHits > 0) {
      await page.locator('.slot-hit').nth(1).click()
      await page.waitForTimeout(600)
      await page.getByRole('button', { name: '导出', exact: true }).click()
      await page.getByTestId('html-preview-btn').click()
      const frame = await (await page.locator('[data-testid="html-preview-frame"]').elementHandle())?.contentFrame()
      const txt = ((await frame!.locator('body').innerText()) ?? '').replace(/\s+/g, '')
      console.log('placeModeAfterHasBlock=', txt.includes('分区'))
    }
  }
})
