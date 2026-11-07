// 诊断：leftTag 槽 hint 位置 vs 首列位置
import { launch, openBlank, navFromHome, fillCell, pasteGrid, startPlace, canvas, silenceSelBar } from './lib.mjs'

const { browser, page, consoleErrors } = await launch()
try {
  await openBlank(page, 10, 6, 2)
  await navFromHome(page, 0, 0)
  await fillCell(page, '三年级 2 班 · 课程表')
  const grid = [
    ['节次 / 星期', '周一', '周二', '周三', '周四', '周五'],
    ...Array.from({ length: 8 }, (_, i) => [`第 ${i + 1} 节`, '语文\n心老师', '数学\n李老师', '英语\n陈老师', '体育\n赵老师', '音乐\n孙老师']),
  ]
  await navFromHome(page, 1, 0)
  await pasteGrid(page, grid)

  const hits = await startPlace(page, '左栏标签块')
  const cbx = await canvas(page).boundingBox()
  console.log('canvas:', JSON.stringify(cbx))
  for (const h of hits) console.log(`slot[${h.i}] box=(${Math.round(h.box.x)},${Math.round(h.box.y)},${Math.round(h.box.width)}x${Math.round(h.box.height)}) rel=(${Math.round(h.box.x - cbx.x)},${Math.round(h.box.y - cbx.y)})`)

  // 点第一个槽放入，再点 block-handle 选块
  await silenceSelBar(page)
  await page.locator('.slot-hit.hot, .slot-hit.focused').nth(0).click()
  await page.waitForTimeout(600)
  const handles = page.locator('.block-handle')
  console.log('handle 数:', await handles.count())
  if (await handles.count()) {
    const hb = await handles.first().boundingBox()
    console.log('handle[0] box:', JSON.stringify(hb))
    await handles.first().click({ force: true })
    await page.waitForTimeout(500)
    const bh = await page.getByTestId('block-headline').innerText().catch(() => '(无)')
    console.log('点 handle 后 block-headline:', bh)
    const ta = page.locator('[data-testid="block-headline"] + textarea')
    if (await ta.isVisible().catch(() => false)) {
      await ta.fill('第 1 节 · 08:20–09:00')
      await ta.blur()
      console.log('块文字已填')
    }
  }
} finally { await browser.close() }
console.log('DEBUG_DONE', '| consoleErrors:', consoleErrors.length)
