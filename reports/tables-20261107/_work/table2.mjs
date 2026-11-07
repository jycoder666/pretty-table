// 表2：三款机型参数对比（compare 模板，4 列 × 9 数据行，多行文字自下而上填防行高偏移）
import {
  launch, openTemplate, setTheme, setColors, CREAM, COLOR_LABELS,
  railInsertAfter, railRemove, assertSummary, scrollTop,
  clickCellV, fillSlot, placeBlock, fillBlock,
  exportAll, fileSize,
} from './helpers.mjs'

const NAME = '三款机型参数对比'
const log = (...a) => console.log('[t2]', ...a)

const { browser, page, consoleErrors, pageErrors } = await launch()
try {
  await openTemplate(page, '多列对比')
  await setTheme(page, '墨青簿册')
  await setColors(page, CREAM, COLOR_LABELS)
  log('模板+主题色板 OK')

  // ── 结构：4 列（删 C2 拆 band 合并 + 加回）× 11 行 ──
  await railRemove(page, 'col', 2)
  await railInsertAfter(page, 'col', 2) // → 4 列 [C0, band.1, band.2, u]
  await railInsertAfter(page, 'row', 7)
  await railInsertAfter(page, 'row', 7)
  await railInsertAfter(page, 'row', 7)
  await railRemove(page, 'row', 5)
  await railRemove(page, 'row', 2)
  await assertSummary(page, 11, 4, 2)
  log('结构 11行×4列×2层 OK')
  await scrollTop(page)

  const rowHeights = [36, 36, 32, 36, 36, 36, 32, 36, 36, 36, 36, 36, 36, 32]
  const vRow = { r0: 0, r1: 1, gap1: 2, r2: 3, r3: 4, r4: 5, gap2: 6, r5: 7, r6: 8, r7: 9, r8: 10, r9: 11, r10: 12, foot: 13 }
  const cols = [120, 140, 140, 140]
  const colX = (c) => cols.slice(0, c).reduce((a, b) => a + b, 0) + cols[c] / 2

  // ── 区块 ──
  await placeBlock(page, '分组标题行', 0) // gap-g1
  await placeBlock(page, '强调注脚', 0)   // footer
  await placeBlock(page, '分区色条', 1)   // gap-g2（空文字分隔）
  await clickCellV(page, rowHeights, vRow.gap1, colX(0))
  if (await page.getByTestId('block-headline').innerText().catch(() => '')) {
    await fillBlock(page, '核心参数 · 逐项对照')
  }
  await clickCellV(page, rowHeights, vRow.foot, colX(0))
  if (await page.getByTestId('block-headline').innerText().catch(() => '')) {
    await fillBlock(page, '注：均为公开规格整理，充电速度为实验室条件实测均值，实际以产品页面为准。\n示例样张·机型名称与数据仅作排版示意，不构成购买建议。')
  }
  await clickCellV(page, rowHeights, vRow.gap2, colX(0))
  if (await page.getByTestId('block-headline').innerText().catch(() => '')) {
    await fillBlock(page, '')
  }
  log('区块已放并填字')

  // ── 数据 9 行（自下而上填，避免多行文字撑高行后 y 漂移）──
  const rows = [
    ['屏幕', ['6.1" OLED\n120Hz 直屏', '6.7" OLED\n120Hz 曲面', '6.8" LTPO\n120Hz 自适应']],
    ['处理器', ['天玑8400\n4nm', '骁龙8\n4nm', '骁龙8至尊\n3nm']],
    ['内存/存储', ['12+256GB\nLPDDR5X', '16+512GB\nLPDDR5X', '16+1TB\nLPDDR5X']],
    ['后置主摄', ['4800万\nf/1.8·OIS', '5000万\nf/1.7·OIS', '1亿\nf/1.6·OIS']],
    ['电池容量', ['4200mAh\n日常一天一充', '5000mAh\n轻度可用两天', '5500mAh\n重度一天有余']],
    ['有线快充', ['45W\n30分钟约60%', '80W\n30分钟约82%', '100W\n22分钟约80%']],
    ['机身重量', ['178g\n7.4mm 厚', '199g\n7.9mm 厚', '221g\n8.6mm 厚']],
    ['参考价格', ['¥3,299', '¥4,599', '¥5,999']],
    ['适合人群', ['轻薄优先\n通勤与轻度使用', '性能与价格最均衡\n大多数人的主力机', '影像与重度使用\n可接受更重机身']],
  ]
  const vRows = [vRow.r2, vRow.r3, vRow.r4, vRow.r5, vRow.r6, vRow.r7, vRow.r8, vRow.r9, vRow.r10]
  for (let i = rows.length - 1; i >= 0; i--) {
    const [label, vals] = rows[i]
    const vr = vRows[i]
    await clickCellV(page, rowHeights, vr, colX(0))
    await fillSlot(page, label)
    for (let c = 1; c <= 3; c++) {
      await clickCellV(page, rowHeights, vr, colX(c))
      await fillSlot(page, vals[c - 1])
    }
  }
  log('9 数据行已填（倒序）')

  // ── 表头（点击重聚焦 + ArrowDown 导航）──
  const head0 = ['Air', 'Pro', 'Ultra']
  const head1 = ['轻巧款', '均衡款·主推', '旗舰款']
  for (let c = 1; c <= 3; c++) {
    await clickCellV(page, rowHeights, vRow.r0, colX(c))
    await fillSlot(page, head0[c - 1])
    await clickCellV(page, rowHeights, vRow.r0, colX(c))
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(250)
    const h = await page.getByTestId('slot-headline').innerText().catch(() => '')
    if (!h.includes('当前内容') && !h.includes('第 2 行')) throw new Error(`ArrowDown 未选中 R1C${c}: ${h}`)
    await fillSlot(page, head1[c - 1])
  }
  for (let c = 1; c <= 3; c++) {
    await clickCellV(page, rowHeights, vRow.r1, colX(c))
    const h = await page.getByTestId('slot-headline').innerText().catch(() => '')
    if (!h.includes(head1[c - 1])) throw new Error(`R1C${c} 校验失败: ${h}`)
  }
  log('表头已填并校验')

  // 抽查
  await clickCellV(page, rowHeights, vRow.r8, colX(3))
  log('抽查 R8C3(价格):', await page.getByTestId('slot-headline').innerText())

  const r = await exportAll(page, NAME, '02-三款机型参数对比-编辑台.png')
  log('PNG bytes:', fileSize(r.png), 'HTML bytes:', fileSize(r.html))
} finally {
  await browser.close()
}
console.log('[t2] console errors:', consoleErrors.length)
consoleErrors.forEach((e) => console.log('  [t2 console.error]', e.slice(0, 200)))
console.log('[t2] page errors:', pageErrors.length)
console.log('[t2] DONE')
