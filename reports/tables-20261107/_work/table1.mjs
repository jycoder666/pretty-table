// 表1：百万医疗险·横向测评（compare 模板，双层表头 4 产品 × 9 指标）
import {
  launch, openTemplate, setTheme, setColors, CREAM, COLOR_LABELS,
  railInsertAfter, railRemove, assertSummary, scrollTop,
  clickCellV, fillSlot, placeBlock, fillBlock, setRecommend,
  exportAll, fileSize,
} from './helpers.mjs'

const NAME = '百万医疗险·横向测评'
const log = (...a) => console.log('[t1]', ...a)

const { browser, page, consoleErrors, pageErrors } = await launch()
try {
  await openTemplate(page, '多列对比')
  log('模板已打开')

  // ── 主题 + 奶油风色板 ──
  await setTheme(page, '墨青簿册')
  await setColors(page, CREAM, COLOR_LABELS)
  log('主题色板已设')

  // ── 结构：5 列 × 11 行（固定锚操作，规避尾行轨道项缺失缺陷）──
  await railRemove(page, 'col', 2)          // 删 C2：band 合并区随删列自动收缩移除
  await railInsertAfter(page, 'col', 2)     // plus-2：新列插 C3
  await railInsertAfter(page, 'col', 2)     // plus-2：再插一列（列序无妨，均空槽）→ 5 列
  await railInsertAfter(page, 'row', 7)     // 尾部加行 ×3（R7 恒存在）
  await railInsertAfter(page, 'row', 7)
  await railInsertAfter(page, 'row', 7)
  await railRemove(page, 'row', 5)          // 删原 number 行（row.5）
  await railRemove(page, 'row', 2)          // 删原 mark 行（row.2）
  await assertSummary(page, 11, 5, 2)
  log('结构 11行×5列×2层 OK')
  await scrollTop(page)

  // 视觉行几何（gap-g1 after-1 / gap-g2 after-4 / footer after-10，三者均有区块后各占 32px）
  const rowHeights = [36, 36, 32, 36, 36, 36, 32, 36, 36, 36, 36, 36, 36, 32]
  const vRow = { r0: 0, r1: 1, gap1: 2, r2: 3, r3: 4, r4: 5, gap2: 6, r5: 7, r6: 8, r7: 9, r8: 10, r9: 11, r10: 12, foot: 13 }
  const cols = [120, 140, 140, 140, 140]
  const colX = (c) => cols.slice(0, c).reduce((a, b) => a + b, 0) + cols[c] / 2

  // ── 区块：gap-g1 分组标题行 / gap-g2 空分区色条（消占位文案）/ footer 强调注脚 ──
  const p1 = await placeBlock(page, '分组标题行', 0)
  log('分组标题行→gap-g1（候选槽', p1.total, '）')
  const p2 = await placeBlock(page, '强调注脚', 0)
  log('强调注脚→footer')
  const p3 = await placeBlock(page, '分区色条', 1) // 第 2 个槽（top 序）= gap-g2
  log('分区色条→gap-g2')
  // gap-g2 分区色条文字置空（视觉中性分隔条）
  await clickCellV(page, rowHeights, vRow.gap2, colX(0))
  const sh2 = await page.getByTestId('block-headline').innerText().catch(() => '')
  if (sh2) await fillBlock(page, '')

  // 区块文字（点块行 C0 选中区块）
  await clickCellV(page, rowHeights, vRow.gap1, colX(0))
  const bh = await page.getByTestId('block-headline').innerText().catch(() => '')
  if (!bh) throw new Error('gap-g1 块行点击未选中区块: headline 空')
  await fillBlock(page, '核心指标对照')
  await clickCellV(page, rowHeights, vRow.foot, colX(0))
  const fh = await page.getByTestId('block-headline').innerText().catch(() => '')
  if (!fh) throw new Error('footer 块行点击未选中区块')
  await fillBlock(page, '注：保费为30岁男性、有社保、首年保费口径；保障为年累计上限，实际赔付以条款为准。\n示例样张·产品名与数据仅作排版示意，不构成任何产品评价或推荐。')
  log('区块文字已填')

  // ── 双层表头（表头格 fill 会触发重绘行布局偏移，用点击重聚焦 + ArrowDown 导航）──
  const head0 = ['安心e生', '康健守护', '无忧人生', '明悦优选']
  const head1 = ['性价比款', '大保款', '长期续保', '服务型']
  for (let c = 1; c <= 4; c++) {
    await clickCellV(page, rowHeights, vRow.r0, colX(c))
    await fillSlot(page, head0[c - 1])
    await clickCellV(page, rowHeights, vRow.r0, colX(c)) // 重聚焦画布（fill 后 Tab 焦点在面板）
    await page.keyboard.press('ArrowDown') // → R1 同列格
    await page.waitForTimeout(250)
    const h = await page.getByTestId('slot-headline').innerText().catch(() => '')
    if (!h.includes('当前内容') && !h.includes('第 2 行')) throw new Error(`ArrowDown 未选中 R1C${c}: ${h}`)
    await fillSlot(page, head1[c - 1])
  }
  // 表头校验
  for (let c = 1; c <= 4; c++) {
    await clickCellV(page, rowHeights, vRow.r1, colX(c))
    const h = await page.getByTestId('slot-headline').innerText().catch(() => '')
    if (!h.includes(head1[c - 1])) throw new Error(`R1C${c} 校验失败: ${h} 期望含 ${head1[c - 1]}`)
  }
  log('双层表头已填并通过校验')

  // ── 9 指标行 ──
  const rows = [
    ['首年保费', ['268', '386', '512', '445']],
    ['一般住院保额', ['200万', '300万', '300万', '250万']],
    ['重疾医疗保额', ['400万', '600万', '500万', '450万']],
    ['年免赔额', ['1万元', '1万元', '5000元', '8000元']],
    ['报销比例（经社保）', ['100%', '100%', '100%', '90%']],
    ['院外特药目录', ['102种', '128种', '118种', '96种']],
    ['保证续保期', ['6年', '10年', '20年', '5年']],
    ['住院垫付', ['支持', '支持', '支持', '不支持']],
    ['综合评级', ['★★★★☆', '★★★★☆', '★★★★★', '★★★☆☆']],
  ]
  const vRows = [vRow.r2, vRow.r3, vRow.r4, vRow.r5, vRow.r6, vRow.r7, vRow.r8, vRow.r9, vRow.r10]
  for (let i = 0; i < rows.length; i++) {
    const [label, vals] = rows[i]
    const vr = vRows[i]
    await clickCellV(page, rowHeights, vr, colX(0))
    await fillSlot(page, label)
    for (let c = 1; c <= 4; c++) {
      await clickCellV(page, rowHeights, vr, colX(c))
      await fillSlot(page, vals[c - 1])
    }
  }
  log('9 指标行已填')

  // 抽查 2 格
  await clickCellV(page, rowHeights, vRow.r2, colX(3))
  log('抽查 R2C3:', await page.getByTestId('slot-headline').innerText())
  await clickCellV(page, rowHeights, vRow.r10, colX(4))
  log('抽查 R10C4:', await page.getByTestId('slot-headline').innerText())

  // ── 推荐列：无忧人生（结构组按钮按 R1 表头文字定位）──
  await setRecommend(page, '长期续保')
  log('推荐列=无忧人生(C3)')

  // ── 导出四件套 ──
  const r = await exportAll(page, NAME, '01-百万医疗险-编辑台.png')
  log('导出:', JSON.stringify({ ...r, htmlLen: r.htmlLen }))
  log('PNG bytes:', fileSize(r.png), 'HTML bytes:', fileSize(r.html))
} finally {
  await browser.close()
}
console.log('[t1] console errors:', consoleErrors.length)
consoleErrors.forEach((e) => console.log('  [t1 console.error]', e.slice(0, 200)))
console.log('[t1] page errors:', pageErrors.length)
pageErrors.forEach((e) => console.log('  [t1 pageerror]', e.slice(0, 200)))
console.log('[t1] DONE')
