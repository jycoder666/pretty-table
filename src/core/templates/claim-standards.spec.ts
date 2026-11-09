import { describe, expect, it } from 'vitest'
import { CLAIM_STANDARDS } from './claim-standards'
import { listPresetTemplates } from './index'
import { validateInstance, cloneInstance } from '../schema/validate'
import { migrateInstance, SCHEMA_VERSION_CURRENT } from '../schema/migrate'
import { buildVisualRows, remapMerges, toOption } from '../adapter/toOption'
import { PALETTES } from '../theme/palettes'
import { LIMITS, visibleRowCount } from '../theme/layoutScales'
import { exportHtml } from '../export/html'

// ── 保险模板套件 need_05 · claim-standards 重疾理赔标准（增量设计 A3-6 / TP06）──
// 文案权威 = 设计文档 A3-6 转写，逐字断言（含「标准3」原文用字）；库内注册
// （index.ts / templates.spec.ts 登记）由集成任务 TP09 收口，本 spec 直连模板常量。

const TITLE_TEXT = '重疾险28种必保重疾理赔标准'
const BAND1_TEXT = '标准一：确诊即赔（3种）'
const BAND2_TEXT = '标准二：做了某种手术即赔（6种）'
const BAND3_TEXT = '标准3：达到疾病约定的状态即赔（19种）'

/** 逐字底稿：28 种必保重疾（3 + 6 + 19，A3-6 R2–R11 按序） */
const DISEASES: string[] = [
  // 标准一：确诊即赔（3 种，R2）
  '恶性肿瘤-重度',
  '严重Ⅲ度烧伤',
  '多个肢体缺失',
  // 标准二：做了某种手术即赔（6 种，R3–R4）
  '重大器官移植术或造血干细胞移植术',
  '严重非恶性颅内肿瘤',
  '主动脉手术',
  '冠状动脉搭桥术',
  '心脏瓣膜手术',
  '严重溃疡性结肠炎',
  // 标准3：达到疾病约定的状态即赔（19 种，R5–R11）
  '较重急性心肌梗死',
  '严重脑中风后遗症',
  '严重阿尔茨海默病',
  '严重克雅氏病',
  '急性重症肝炎或亚急性重症肝炎',
  '严重原发性帕金森病',
  '严重慢性肾衰竭',
  '严重慢性肝衰竭',
  '严重运动神经元病',
  '深度昏迷',
  '瘫痪',
  '重型再生障碍性贫血',
  '双耳失聪',
  '双目失明',
  '严重脑损伤',
  '语言能力丧失',
  '严重慢性呼吸衰竭',
  '严重原发性肺动脉高压',
  '严重脑炎后遗症或严重脑膜炎后遗症',
]

/** 取 VTable 列 style 回调在第 row 行第 col 列的产物（与 toOption.spec.ts 同口径） */
function cellStyle(opt: Record<string, unknown>, row: number, col: number): Record<string, unknown> {
  const cols = opt.columns as { style: (a: { row: number; col: number }) => Record<string, unknown> }[]
  return cols[col]!.style({ row, col })
}

describe('claim-standards 重疾理赔标准模板（保险模板套件 need_05 · TP06）', () => {
  it('validate / migrate 通过，schemaVersion 1.2，templateType 显式 detail；detail 旧表头回填不触发', () => {
    expect(CLAIM_STANDARDS.templateId).toBe('claim-standards')
    expect(CLAIM_STANDARDS.schemaVersion).toBe('1.2')
    const v = validateInstance(cloneInstance(CLAIM_STANDARDS))
    expect(v.ok).toBe(true)
    expect(v.ok ? v.value.schemaVersion : undefined).toBe('1.2')
    // templateId 无 pricing/matrix/detail 词根，migrate 兜底推断会落 compare——显式 detail 迁移后不得被改写
    expect(v.ok ? v.value.meta?.templateType : undefined).toBe('detail')
    const m = migrateInstance(cloneInstance(CLAIM_STANDARDS), listPresetTemplates())
    expect(m.ok).toBe(true)
    expect(m.ok ? m.value.schemaVersion : undefined).toBe(SCHEMA_VERSION_CURRENT)
    expect(m.ok ? m.value.meta?.templateType : undefined).toBe('detail')
    expect(CLAIM_STANDARDS.meta?.displayName).toBe('重疾理赔标准')
    expect(CLAIM_STANDARDS.meta?.origin).toBe('preset')
    expect(CLAIM_STANDARDS.themeId).toBe('T-A')
    expect(CLAIM_STANDARDS.zebraOn).toBe(true)
    // detail 旧文档表头第二行回填（migrate.ts）不触发：R1 带1 行有槽 id，不补 head.c*
    expect(m.ok ? m.value.layout.slotGrid?.[1]?.[0] : undefined).toBe('claim.band1')
    expect(m.ok ? m.value.slots['head.c0'] : undefined).toBeUndefined()
  })

  it('结构合法：12 逻辑行 × 3 列、可见行 14（带2/带3 各占 1）、列宽 216×3；格内引用无悬空槽位', () => {
    const grid = CLAIM_STANDARDS.layout.slotGrid ?? []
    expect(grid).toHaveLength(12)
    for (const row of grid) expect(row).toHaveLength(3)
    expect(CLAIM_STANDARDS.layout.rowCount).toBe(12)
    expect(CLAIM_STANDARDS.layout.colCount).toBe(3)
    expect(CLAIM_STANDARDS.layout.rowCount).toBe((CLAIM_STANDARDS.layout.slotGrid ?? []).length)
    expect(CLAIM_STANDARDS.layout.headerLevels).toBe(2)
    expect(CLAIM_STANDARDS.layout.style?.colWidths).toEqual([216, 216, 216])
    // 行列上限不突破（layoutScales LIMITS：20 行 / 12 列）
    expect(CLAIM_STANDARDS.layout.rowCount).toBeLessThanOrEqual(LIMITS.maxRows)
    expect(CLAIM_STANDARDS.layout.colCount).toBeLessThanOrEqual(LIMITS.maxCols)
    // 可见行 = 12 逻辑 + 2 已占用 between-rows 锚点（layoutScales.visibleRowCount 口径）
    expect(visibleRowCount(CLAIM_STANDARDS)).toBe(14)
    // gridSlotIds 无悬空：标题/带1 + 28 病名 = 30 个槽，格内引用都有槽值
    const ids = new Set(grid.flat().filter((x): x is string => !!x))
    expect(ids.size).toBe(30)
    for (const sid of ids) expect(CLAIM_STANDARDS.slots[sid]).toBeDefined()
    expect(Object.keys(CLAIM_STANDARDS.slots)).toHaveLength(30)
    // 全纯文本槽（A3-6 无 defs 面）：slotDefs 空
    expect(Object.keys(CLAIM_STANDARDS.slotDefs ?? {})).toHaveLength(0)
  })

  it('标题/带1/末行 3 条 structuralMerges 锁定；不设用户合并；区块槽 after-2/after-4 + footerSlot(11)', () => {
    const grid = CLAIM_STANDARDS.layout.slotGrid ?? []
    expect(CLAIM_STANDARDS.layout.captionSlot).toBe('claim.title')
    // 标题行覆盖格重复标题槽 id（pricing-v1 先例）；带1 同型
    expect(grid[0]).toEqual(Array(3).fill('claim.title'))
    expect(grid[1]).toEqual(Array(3).fill('claim.band1'))
    // 末行横跨 3 列：锚点 + 覆盖格 null（compare-alpha-v1/matrix-v1 先例）
    expect(grid[11]).toEqual(['claim.d28', null, null])
    expect(CLAIM_STANDARDS.layout.structuralMerges).toEqual([
      { start: [0, 0], end: [0, 2] },
      { start: [1, 0], end: [1, 2] },
      { start: [11, 0], end: [11, 2] },
    ])
    // 成品语义表：不设 merges/allowedMerges（B4：8 张全禁用户合并），无推荐列
    expect(CLAIM_STANDARDS.layout.merges).toBeUndefined()
    expect(CLAIM_STANDARDS.layout.allowedMerges).toBeUndefined()
    expect(CLAIM_STANDARDS.layout.recommendableCols).toEqual([])
    expect(CLAIM_STANDARDS.highlight?.recommendCol).toBeNull()
    // 带2/带3 = 区块实例（sectionBar），label 逐字
    expect(CLAIM_STANDARDS.blocks).toHaveLength(2)
    const [b2, b3] = CLAIM_STANDARDS.blocks
    expect(b2!.type).toBe('sectionBar')
    expect(b2!.slotId).toBe('gap-b2')
    expect(b2!.props?.label).toBe(BAND2_TEXT)
    expect(b3!.type).toBe('sectionBar')
    expect(b3!.slotId).toBe('gap-b3')
    expect(b3!.props?.label).toBe(BAND3_TEXT)
    // 区块槽：after-2 / after-4（between-rows）+ footerSlot(11)
    expect(CLAIM_STANDARDS.layout.blockSlots.map((s) => s.id)).toEqual(['gap-b2', 'gap-b3', 'footer-1'])
    const def2 = CLAIM_STANDARDS.layout.blockSlots.find((s) => s.id === 'gap-b2')!
    expect(def2.accept).toEqual(['sectionBar', 'groupHeader'])
    expect(def2.region).toBe('between-rows')
    expect(def2.rowHint).toBe('after-2')
    const def3 = CLAIM_STANDARDS.layout.blockSlots.find((s) => s.id === 'gap-b3')!
    expect(def3.accept).toEqual(['sectionBar', 'groupHeader'])
    expect(def3.region).toBe('between-rows')
    expect(def3.rowHint).toBe('after-4')
    const footer = CLAIM_STANDARDS.layout.blockSlots.find((s) => s.region === 'footer')!
    expect(footer.accept).toEqual(['emphFooter'])
    expect(footer.rowHint).toBe('after-11')
    // footer 空置不占行：不发 footer 区块实例
    expect(CLAIM_STANDARDS.blocks.some((b) => b.type === 'emphFooter')).toBe(false)
    // 不配 leftTag 槽（A2-①：首列为数据列，leftTag 会遮蔽槽值）；blockSlots 无重复 id
    expect(CLAIM_STANDARDS.layout.blockSlots.filter((s) => s.region === 'left-tag')).toHaveLength(0)
    const slotIds = CLAIM_STANDARDS.layout.blockSlots.map((s) => s.id)
    expect(new Set(slotIds).size).toBe(slotIds.length)
  })

  it('28 种病名逐字齐全（3+6+19）+ 标题/三条带文案逐字；「标准3」原文用字保留', () => {
    const grid = CLAIM_STANDARDS.layout.slotGrid ?? []
    expect(CLAIM_STANDARDS.slots['claim.title']).toBe(TITLE_TEXT)
    expect(CLAIM_STANDARDS.slots['claim.band1']).toBe(BAND1_TEXT)
    // 28 种逐字 + 接线（R2–R10 每行 3 格，R11 末种横跨）
    DISEASES.forEach((name, i) => {
      expect(CLAIM_STANDARDS.slots[`claim.d${i + 1}`]).toBe(name)
    })
    for (let r = 2; r <= 10; r++) {
      for (let c = 0; c < 3; c++) {
        expect(grid[r]?.[c]).toBe(`claim.d${(r - 2) * 3 + c + 1}`)
      }
    }
    expect(grid[11]).toEqual(['claim.d28', null, null])
    // 分组数量：标准一 3 / 标准二 6 / 标准3 19，合计 28
    expect(DISEASES.slice(0, 3)).toHaveLength(3)
    expect(DISEASES.slice(3, 9)).toHaveLength(6)
    expect(DISEASES.slice(9, 28)).toHaveLength(19)
    expect(DISEASES).toHaveLength(28)
    // 带2/带3 文案逐字
    expect(CLAIM_STANDARDS.blocks[0]?.props?.label).toBe(BAND2_TEXT)
    expect(CLAIM_STANDARDS.blocks[1]?.props?.label).toBe(BAND3_TEXT)
    // 「标准3」原文用字逐字保留（中文数字混用，A6-7）：不得改写为「标准三」
    expect(BAND3_TEXT).toContain('标准3：')
    expect(BAND3_TEXT).not.toContain('标准三')
  })

  it('toOption 渲染：区块行偏移正确、末行跨 3 列、标题/带1 主色底白字、sectionBar 主色整行、斑马与 label 加粗', () => {
    const { metas, blockRowIndexes } = buildVisualRows(CLAIM_STANDARDS)
    // footer 槽空置不占行 → 可视行 = 12 逻辑 + 2 区块行 = 14
    expect(metas).toHaveLength(14)
    // 可视行映射：R2 数据在 2，带2 区块行插在 3，带3 插在 6，末行 R11 → 13
    expect(metas[0]![0]!.text).toBe(TITLE_TEXT)
    expect(metas[1]![0]!.text).toBe(BAND1_TEXT)
    expect(metas[2]![0]!.text).toBe('恶性肿瘤-重度')
    expect(metas[3]![0]!.text).toBe(BAND2_TEXT)
    expect(metas[3]![0]!.role).toBe('block')
    expect(metas[3]![0]!.blockType).toBe('sectionBar')
    expect(metas[4]![0]!.text).toBe('重大器官移植术或造血干细胞移植术')
    expect(metas[6]![0]!.text).toBe(BAND3_TEXT)
    expect(metas[6]![0]!.blockType).toBe('sectionBar')
    expect(metas[13]![0]!.text).toBe('严重脑炎后遗症或严重脑膜炎后遗症')
    // 末行跨 3 列 structuralMerge：经区块行偏移后 [11,0]-[11,2] → [13,0]-[13,2]
    const merges = remapMerges(CLAIM_STANDARDS, blockRowIndexes)
    expect(merges).toHaveLength(5) // 3 条 structural + 2 条区块行恒全宽
    expect(merges).toContainEqual({ start: [13, 0], end: [13, 2] })
    expect(merges).toContainEqual({ start: [0, 0], end: [0, 2] })
    expect(merges).toContainEqual({ start: [1, 0], end: [1, 2] })

    const opt = toOption(cloneInstance(CLAIM_STANDARDS), { mode: 'preview' })
    const pa = PALETTES['T-A']
    // 标题行与带1：header 角色 = 主色底白字粗体（带1 header 行近似，A2-⑤）
    expect(cellStyle(opt, 0, 0).bgColor).toBe(pa.primary)
    expect(cellStyle(opt, 0, 0).color).toBe(pa.headerText)
    expect(cellStyle(opt, 1, 0).bgColor).toBe(pa.primary)
    expect(cellStyle(opt, 1, 0).color).toBe(pa.headerText)
    // 带2/带3 sectionBar：主色整行 + 半粗（props.label 消费于 toOption，色随主题无字面量）
    expect(cellStyle(opt, 3, 0).bgColor).toBe(pa.primary)
    expect(cellStyle(opt, 3, 0).color).toBe(pa.headerText)
    expect(cellStyle(opt, 3, 0).fontWeight).toBe(600)
    expect(cellStyle(opt, 6, 0).bgColor).toBe(pa.primary)
    // 数据行：首列 label 加粗（A2-① 白底加粗口径）；斑马随可视行奇偶（含区块行偏移）
    expect(cellStyle(opt, 2, 0).fontWeight).toBe(600)
    expect(cellStyle(opt, 2, 1).bgColor).toBe(pa.paper)
    expect(cellStyle(opt, 5, 1).bgColor).toBe(pa.zebra)
    // 全部槽有值：无占位文案
    const records = opt.records as Record<string, string>[]
    for (const rec of records) {
      for (const text of Object.values(rec)) expect(text).not.toBe('填写内容')
    }
    expect(records[0]!.c0).toBe(TITLE_TEXT)
    expect(records[3]!.c0).toBe(BAND2_TEXT)
    expect(records[6]!.c0).toBe(BAND3_TEXT)
    expect(records[13]!.c0).toBe('严重脑炎后遗症或严重脑膜炎后遗症')
  })

  it('导出 HTML：标题 / 三条带 / 病名可达，末行跨 3 列以 colspan 呈现', () => {
    const r = exportHtml(cloneInstance(CLAIM_STANDARDS))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toContain(TITLE_TEXT)
    expect(r.value).toContain(BAND1_TEXT)
    expect(r.value).toContain(BAND2_TEXT)
    expect(r.value).toContain(BAND3_TEXT)
    expect(r.value).toContain('恶性肿瘤-重度')
    expect(r.value).toContain('严重脑炎后遗症或严重脑膜炎后遗症')
    expect(r.value).toContain('colspan="3"')
  })
})
