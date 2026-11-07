// 表4：年度体检·指标解读
// 步骤 A：按任务先试 detail 模板加 2 列 → 实证固定表头限制（留截图证据）
// 步骤 B：detail 不可行 → 回库页用空白底稿（1 层表头 8 行 5 列）建 7 指标明细
import {
  launch, openTemplate, createBlank, setTheme, setColors, CREAM, COLOR_LABELS,
  railInsertAfter, assertSummary, scrollTop,
  clickCellV, fillSlot, placeBlock, fillBlock, emphasize, setColWidth,
  exportAll, fileSize, OUT,
} from './helpers.mjs'

const NAME = '年度体检·指标解读'
const log = (...a) => console.log('[t4]', ...a)

const { browser, page, consoleErrors, pageErrors } = await launch()
try {
  // ── A. detail 模板实测 ──
  await openTemplate(page, '单主体明细')
  await railInsertAfter(page, 'col', 2)
  await railInsertAfter(page, 'col', 2)
  await assertSummary(page, 10, 5, 2)
  await scrollTop(page)
  // 点 R1C3（表头第二层新列）：headline 与渲染文字取证
  const rowHeightsD = [36, 36, 32, 36, 36, 36, 36, 36, 36, 36, 32] // subject 行36 + R1 36 + gap-g1 32 + R2-R9 36×8 + footer空(不渲染)→ gap-g2? detail gap-g1 after-1, gap-g2 after-5
  // detail: gap-g1 after-1（R1 后）、gap-g2 after-5（R5 后）
  const rhD = [36, 36, 32, 36, 36, 36, 32, 36, 36, 36, 36]
  const colXD = (c) => [120, 140, 140, 140, 140].slice(0, c).reduce((a, b) => a + b, 0) + 70
  await clickCellV(page, rhD, 1, colXD(3))
  const h13 = await page.getByTestId('slot-headline').innerText().catch(() => '(无)')
  await fillSlot(page, '建议')
  await clickCellV(page, rhD, 1, colXD(3))
  const h13b = await page.getByTestId('slot-headline').innerText().catch(() => '(无)')
  await page.screenshot({ path: `${OUT}/04a-detail模板加列实测.png`, fullPage: true })
  log('detail 实测 R1C3: 填前=', h13, ' 填「建议」后=', h13b, '（渲染固定文案见截图 04a）')

  // ── B. 空白底稿重建 ──
  await page.getByRole('button', { name: '← 模板库' }).click()
  const leave = page.getByTestId('confirm-ok')
  try {
    await leave.waitFor({ state: 'visible', timeout: 5000 })
    await leave.click()
  } catch {
    log('无离开确认弹窗（可能非 dirty），直接继续')
  }
  await page.waitForTimeout(1000)
  await createBlank(page, 8, 5, 1)
  await assertSummary(page, 8, 5, 1)
  log('空白底稿 8行×5列×1层 OK')

  await setTheme(page, '墨青簿册')
  await setColors(page, CREAM, COLOR_LABELS)
  // 列宽：状态列窄、建议列宽（列宽输入在样式组，已展开）
  await setColWidth(page, 3, 84)
  await setColWidth(page, 4, 220)
  await scrollTop(page)

  // footer 注脚（先放先填：副题 + 报告单号 + 免责）
  await placeBlock(page, '强调注脚', 0)
  const rowHeights = [36, 36, 36, 36, 36, 36, 36, 36, 32]
  const vFoot = 8
  const cols = [120, 140, 140, 84, 220]
  const colX = (c) => cols.slice(0, c).reduce((a, b) => a + b, 0) + cols[c] / 2
  await clickCellV(page, rowHeights, vFoot, colX(0))
  if (await page.getByTestId('block-headline').innerText().catch(() => '')) {
    await fillBlock(page, '7 项指标中 4 项偏高·均为生活方式相关，未提示器质性异常，建议 3 个月后复查\n报告单号 HC.2026.0418 · 体检日期 2026.04.18\n示例样张·数值仅作排版示意，不构成医学诊断，请以医生意见为准')
  }
  log('footer 注脚已填')

  // 数据 7 行（自下而上 R7→R1）；状态列偏高红字加粗
  // [label, 本次结果, 参考区间, 状态, 建议, 偏高?]
  const data = [
    ['血压 BP', '128/82 mmHg', '<120/80', '偏高', '限盐、每周3次有氧', true],
    ['空腹血糖 GLU', '5.9 mmol/L', '3.9-6.1', '正常', '保持现有饮食结构', false],
    ['总胆固醇 TC', '5.8 mmol/L', '<5.2', '偏高', '减少动物油脂，3个月复查', true],
    ['尿酸 UA', '468 μmol/L', '208-428', '偏高', '少喝含糖饮料与啤酒', true],
    ['体质指数 BMI', '24.6', '18.5-23.9', '偏高', '减重3-5公斤更稳妥', true],
    ['血红蛋白 HGB', '148 g/L', '130-175', '正常', '无需干预', false],
    ['谷丙转氨酶 ALT', '32 U/L', '9-50', '正常', '无需干预', false],
  ]
  for (let i = data.length - 1; i >= 0; i--) {
    const [label, result, range, status, advice, high] = data[i]
    const vr = i + 1 // R1..R7
    await clickCellV(page, rowHeights, vr, colX(0))
    await fillSlot(page, label)
    await clickCellV(page, rowHeights, vr, colX(1))
    await fillSlot(page, result)
    await clickCellV(page, rowHeights, vr, colX(2))
    await fillSlot(page, range)
    await clickCellV(page, rowHeights, vr, colX(3))
    await fillSlot(page, status)
    if (high) await emphasize(page, ['red', 'bold'])
    await clickCellV(page, rowHeights, vr, colX(4))
    await fillSlot(page, advice)
  }
  log('7 指标行已填（4 项偏高红字加粗）')

  // 表头（R0 y=18 顶部安全）
  const heads = ['指标 / ITEM', '本次结果', '参考区间', '状态', '建议']
  for (let c = 0; c < 5; c++) {
    await clickCellV(page, rowHeights, 0, colX(c))
    await fillSlot(page, heads[c])
  }
  log('表头已填')

  // 抽查
  await clickCellV(page, rowHeights, 4, colX(3))
  log('抽查 R4C3(尿酸状态):', await page.getByTestId('slot-headline').innerText())
  await clickCellV(page, rowHeights, 7, colX(0))
  log('抽查 R7C0(转氨酶):', await page.getByTestId('slot-headline').innerText())

  const r = await exportAll(page, NAME, '04-年度体检指标解读-编辑台.png')
  log('PNG bytes:', fileSize(r.png), 'HTML bytes:', fileSize(r.html))
} finally {
  await browser.close()
}
console.log('[t4] console errors:', consoleErrors.length)
consoleErrors.forEach((e) => console.log('  [t4 console.error]', e.slice(0, 200)))
console.log('[t4] page errors:', pageErrors.length)
console.log('[t4] DONE')
