// 表3：十月·家庭收支账（stat 模板：4 KPI + 10 数据行 + 占比条形 + 分组/注脚）
import {
  launch, openTemplate, setTheme, setColors, CREAM, COLOR_LABELS,
  railInsertAfter, railRemove, assertSummary, scrollTop,
  clickCellV, fillSlot, placeBlock, fillBlock, openKpiGroup, kpiAdd, kpiFill, barOn, emphasize,
  exportAll, fileSize,
} from './helpers.mjs'

const NAME = '十月·家庭收支账'
const log = (...a) => console.log('[t3]', ...a)

const { browser, page, consoleErrors, pageErrors } = await launch()
try {
  await openTemplate(page, '统计看板')
  await setTheme(page, '墨青簿册')
  await setColors(page, CREAM, COLOR_LABELS)
  log('模板+主题色板 OK')

  // ── 结构：删 amount/ratio 两列（number 槽，文字更忠实）→ 加 2 text 列；加 4 行（plus-5 使 footer 锚自动后移）──
  await railRemove(page, 'col', 1) // amount
  await railRemove(page, 'col', 1) // ratio（原 C2 已移到 C1）
  await railInsertAfter(page, 'col', 0) // → [C0, u]
  await railInsertAfter(page, 'col', 0) // → [C0, u, u]（列序无妨，重填）
  // 列序：[C0, u, u] 中第二次插在 C1 位 → [C0, u2, u1]。金额=C1 占比=C2 重新按槽填即可
  await railInsertAfter(page, 'row', 5)
  await railInsertAfter(page, 'row', 5)
  await railInsertAfter(page, 'row', 5)
  await railInsertAfter(page, 'row', 5)
  await assertSummary(page, 11, 3, 1)
  log('结构 11行×3列×1层 OK')
  await scrollTop(page)

  // 视觉行几何：R0 表头 | gap-s1(32) | R1R2R3 | gap-s2(32) | R4..R10 | footer(32)
  const rowHeights = [36, 32, 36, 36, 36, 32, 36, 36, 36, 36, 36, 36, 36, 32]
  const vRow = { r0: 0, gap1: 1, r1: 2, r2: 3, r3: 4, gap2: 5, r4: 6, r5: 7, r6: 8, r7: 9, r8: 10, r9: 11, r10: 12, foot: 13 }
  const cols = [120, 140, 140]
  const colX = (c) => cols.slice(0, c).reduce((a, b) => a + b, 0) + cols[c] / 2

  // ── KPI 4 张（默认 [收入, 结余率(accent)]，加 2 张后用上移重排为 收入/支出/结余/结余率）──
  await openKpiGroup(page)
  await kpiAdd(page)
  await kpiAdd(page)
  // 当前 [收入, 结余率, 新, 新]
  await kpiFill(page, 0, { label: '本月收入', value: '21,800', unit: '元' })
  await kpiFill(page, 2, { label: '本月支出', value: '15,280', unit: '元' })
  await kpiFill(page, 3, { label: '本月结余', value: '6,520', unit: '元', accent: true })
  // 重排：支出(idx2)上移 → [收入, 支出, 结余率, 结余]；结余(idx3)上移 → [收入, 支出, 结余, 结余率]
  await page.getByTestId('kpi-up-2').click()
  await page.waitForTimeout(300)
  await page.getByTestId('kpi-up-3').click()
  await page.waitForTimeout(300)
  await kpiFill(page, 3, { label: '结余率', value: '29.9', unit: '%', accent: true })
  const heroText = await page.getByTestId('kpi-hero').innerText()
  log('KPI hero:', JSON.stringify(heroText.replace(/\n/g, ' | ')))

  // ── 区块：gap-s1 收入分组 / gap-s2 支出分组 / footer 小目标注脚 ──
  await placeBlock(page, '分组标题行', 0)
  await placeBlock(page, '强调注脚', 0)
  await placeBlock(page, '分组标题行', 1) // top 序第 2 = gap-s2
  await clickCellV(page, rowHeights, vRow.gap1, colX(0))
  if (await page.getByTestId('block-headline').innerText().catch(() => '')) await fillBlock(page, '收入 · INCOME')
  await clickCellV(page, rowHeights, vRow.gap2, colX(0))
  if (await page.getByTestId('block-headline').innerText().catch(() => '')) await fillBlock(page, '支出 · SPENDING')
  await clickCellV(page, rowHeights, vRow.foot, colX(0))
  if (await page.getByTestId('block-headline').innerText().catch(() => '')) {
    await fillBlock(page, '小目标：月结余 6,000 元以上✓已达成，超 520 元。\n示例样张·收支数据均为排版示例，不涉及真实家庭。')
  }
  log('区块已放并填字')

  // ── 表头（R0 单层，y=18 顶部安全）──
  await clickCellV(page, rowHeights, vRow.r0, colX(0))
  await fillSlot(page, '项目 / ITEM')
  await clickCellV(page, rowHeights, vRow.r0, colX(1))
  await fillSlot(page, '金额（元）')
  await clickCellV(page, rowHeights, vRow.r0, colX(2))
  await fillSlot(page, '占比')
  log('表头已填')

  // ── 10 数据行（自下而上填；占比列开条形；合计行加粗）──
  // rows: [label, amount, ratio|null, barPercent|null, bold]
  const data = [
    ['工资', '18,600', '85.3%', 85.3, false],            // R1
    ['副业', '2,400', '11.0%', 11.0, false],             // R2
    ['理财与其他', '800', '3.7%', 3.7, false],            // R3
    ['房贷', '6,200', '40.6%', 40.6, false],             // R4
    ['餐饮', '3,150', '20.6%', 20.6, false],             // R5
    ['教育', '2,400', '15.7%', 15.7, false],             // R6
    ['交通与通勤', '980', '6.4%', 6.4, false],            // R7
    ['保险及其他', '2,550', '16.7%', 16.7, false],        // R8
    ['支出合计', '15,280', '—', null, true],              // R9
    ['收入合计', '21,800', '—', null, true],              // R10
  ]
  const vRows = [vRow.r1, vRow.r2, vRow.r3, vRow.r4, vRow.r5, vRow.r6, vRow.r7, vRow.r8, vRow.r9, vRow.r10]
  for (let i = data.length - 1; i >= 0; i--) {
    const [label, amount, ratio, bar, bold] = data[i]
    const vr = vRows[i]
    await clickCellV(page, rowHeights, vr, colX(0))
    await fillSlot(page, label)
    // 注：首列标签格模板固定不可强调（isEmphasize 闸门），合计行仅金额格加粗
    await clickCellV(page, rowHeights, vr, colX(1))
    await fillSlot(page, amount)
    if (bold) await emphasize(page, ['bold'])
    if (ratio !== '') {
      await clickCellV(page, rowHeights, vr, colX(2))
      await fillSlot(page, ratio)
      if (bar !== null) {
        await barOn(page, bar)
      }
    }
  }
  log('10 数据行+条形+加粗完成')

  // 抽查
  await clickCellV(page, rowHeights, vRow.r7, colX(2))
  log('抽查 R7C2(交通占比):', await page.getByTestId('slot-headline').innerText())
  await clickCellV(page, rowHeights, vRow.r10, colX(1))
  log('抽查 R10C1(收入合计):', await page.getByTestId('slot-headline').innerText())

  const r = await exportAll(page, NAME, '03-十月家庭收支账-编辑台.png')
  log('PNG bytes:', fileSize(r.png), 'HTML bytes:', fileSize(r.html))
} finally {
  await browser.close()
}
console.log('[t3] console errors:', consoleErrors.length)
consoleErrors.forEach((e) => console.log('  [t3 console.error]', e.slice(0, 200)))
console.log('[t3] page errors:', pageErrors.length)
console.log('[t3] DONE')
