// 调试9：表头行 fill 最小验证
import { launch, openTemplate, clickCellV, fillSlot } from './helpers.mjs'

const log = (...a) => console.log('[dbg9]', ...a)
const { browser, page } = await launch()
try {
  await openTemplate(page, '多列对比')
  // 原生结构：R0=band 行（gap-g1 占位 32 在 R1 后）R1=obj.name R2 起
  const rowHeights = [36, 36, 32, 36, 36, 36, 36, 36, 36, 36, 32]
  const colX = (c) => [120, 140, 140, 140].slice(0, c).reduce((a, b) => a + b, 0) + 70

  await clickCellV(page, rowHeights, 0, colX(1))
  log('点 R0C1 headline:', await page.getByTestId('slot-headline').innerText().catch(() => '(无)'))
  await fillSlot(page, '安心e生TEST')
  await clickCellV(page, rowHeights, 0, colX(1))
  log('再点 R0C1 headline:', await page.getByTestId('slot-headline').innerText().catch(() => '(无)'))

  await clickCellV(page, rowHeights, 1, colX(1))
  log('点 R1C1 headline:', await page.getByTestId('slot-headline').innerText().catch(() => '(无)'))
  await fillSlot(page, '性价比款TEST')
  await clickCellV(page, rowHeights, 1, colX(1))
  log('再点 R1C1 headline:', await page.getByTestId('slot-headline').innerText().catch(() => '(无)'))

  await clickCellV(page, rowHeights, 3, colX(1))
  log('点 R2C1 headline:', await page.getByTestId('slot-headline').innerText().catch(() => '(无)'))
  await fillSlot(page, '数据格TEST')
  await clickCellV(page, rowHeights, 3, colX(1))
  log('再点 R2C1 headline:', await page.getByTestId('slot-headline').innerText().catch(() => '(无)'))
} finally {
  await browser.close()
}
console.log('[dbg9] DONE')
