import { describe, expect, it } from 'vitest'
import { PLAN_VS } from './plan-vs'
import { listPresetTemplates } from './index'
import { validateInstance, cloneInstance } from '../schema/validate'
import { migrateInstance, SCHEMA_VERSION_CURRENT } from '../schema/migrate'
import { buildVisualRows, toOption } from '../adapter/toOption'
import { PALETTES } from '../theme/palettes'
import { LIMITS } from '../theme/layoutScales'
import { exportHtml } from '../export/html'

// ── need_07 · plan-vs 方案对比（保险模板套件 · 增量设计 A3-8 / TP08）──
// 登记进模板库（listPresetTemplates/getPresetTemplate、templates.spec.ts 登记断言）由
// 集成注册收口（TP09）统一处理；本文件只测模板本体，不预写注册断言。

/** 收集 slotGrid 里所有非空槽位 id（与 templates.spec.ts 同口径） */
function gridSlotIds(tpl: typeof PLAN_VS): Set<string> {
  const ids = new Set<string>()
  for (const row of tpl.layout.slotGrid ?? []) {
    for (const sid of row) {
      if (sid) ids.add(sid)
    }
  }
  return ids
}

/** 取 VTable 列 style 回调在第 row 行第 col 列的产物（与 toOption.spec.ts 同口径） */
function cellStyle(opt: Record<string, unknown>, row: number, col: number): Record<string, unknown> {
  const cols = opt.columns as { style: (a: { row: number; col: number }) => Record<string, unknown> }[]
  return cols[col]!.style({ row, col })
}

/** 合并影子格取值回调（toOption.customMergeCell 同口径） */
function mergeAt(
  opt: Record<string, unknown>,
  col: number,
  row: number,
): { text: string; range: { start: { col: number; row: number }; end: { col: number; row: number } } } | undefined {
  return (opt.customMergeCell as (col: number, row: number) => ReturnType<typeof mergeAt>)(col, row)
}

describe('plan-vs 方案对比模板（保险模板套件 A3-8）', () => {
  it('validate / migrate 通过，schemaVersion 1.3，templateType 显式 detail（不被词根兜底改写）', () => {
    expect(PLAN_VS.templateId).toBe('plan-vs')
    expect(PLAN_VS.schemaVersion).toBe('1.2')
    const v = validateInstance(cloneInstance(PLAN_VS))
    expect(v.ok).toBe(true)
    expect(v.ok ? v.value.schemaVersion : undefined).toBe('1.2')
    expect(v.ok ? v.value.meta?.templateType : undefined).toBe('detail')
    const m = migrateInstance(cloneInstance(PLAN_VS), listPresetTemplates())
    expect(m.ok).toBe(true)
    expect(m.ok ? m.value.schemaVersion : undefined).toBe(SCHEMA_VERSION_CURRENT)
    expect(SCHEMA_VERSION_CURRENT).toBe('1.3')
    // 'plan-vs' 无词根命中，migrate 兜底推断会落 compare——显式 detail 迁移后不得被改写
    expect(m.ok ? m.value.meta?.templateType : undefined).toBe('detail')
    expect(PLAN_VS.meta?.displayName).toBe('方案对比')
    expect(PLAN_VS.meta?.origin).toBe('preset')
    expect(PLAN_VS.themeId).toBe('T-A')
    expect(PLAN_VS.zebraOn).toBe(true)
  })

  it('结构合法：6 行 × 4 列、headerLevels 2、列宽 [90,180,140,140]、行列上限内', () => {
    const grid = PLAN_VS.layout.slotGrid ?? []
    expect(grid).toHaveLength(6)
    for (const row of grid) expect(row).toHaveLength(4)
    expect(PLAN_VS.layout.rowCount).toBe(6)
    expect(PLAN_VS.layout.rowCount).toBe(grid.length)
    expect(PLAN_VS.layout.colCount).toBe(4)
    expect(PLAN_VS.layout.headerLevels).toBe(2)
    expect(PLAN_VS.layout.style?.colWidths).toEqual([90, 180, 140, 140])
    expect(PLAN_VS.layout.rowCount).toBeLessThanOrEqual(LIMITS.maxRows)
    expect(PLAN_VS.layout.colCount).toBeLessThanOrEqual(LIMITS.maxCols)
  })

  it('slotGrid / slotDefs 完整：格内引用无悬空槽位，rowCount === slotGrid.length；保费为纯文本槽（无 defs）', () => {
    const ids = gridSlotIds(PLAN_VS)
    expect(ids.size).toBeGreaterThan(0)
    for (const sid of ids) {
      expect(PLAN_VS.slots[sid]).toBeDefined()
    }
    for (const sid of Object.keys(PLAN_VS.slotDefs ?? {})) {
      expect(PLAN_VS.slots[sid]).toBeDefined()
    }
    // A3-8 披露④：保费无货币格式 defs（纯文本槽，控增量）
    expect(Object.keys(PLAN_VS.slotDefs ?? {})).toHaveLength(0)
  })

  it('标题 captionSlot + 4 条 structuralMerges 全锁定；覆盖格 null（标题行重复标题槽 id）；不设用户合并', () => {
    const grid = PLAN_VS.layout.slotGrid ?? []
    expect(grid[0]).toEqual(['plan.title', 'plan.title', 'plan.title', 'plan.title'])
    expect(PLAN_VS.layout.captionSlot).toBe('plan.title')
    const sm = PLAN_VS.layout.structuralMerges ?? []
    expect(sm).toContainEqual({ start: [0, 0], end: [0, 3] }) // 标题满宽
    expect(sm).toContainEqual({ start: [1, 2], end: [1, 3] }) // 表头「方案二」跨 C2-C3
    expect(sm).toContainEqual({ start: [4, 1], end: [5, 1] }) // 方案一保额~保费纵向
    expect(sm).toContainEqual({ start: [5, 2], end: [5, 3] }) // 方案二保费横向
    expect(sm).toHaveLength(4)
    // 覆盖格 null（compare-alpha-v1.ts:124 先例）：[1,3] / [5,1] / [5,3]
    expect(grid[1]![3]).toBeNull()
    expect(grid[5]![1]).toBeNull()
    expect(grid[5]![3]).toBeNull()
    // 成品语义表：不设 merges / allowedMerges（B4 约定），无推荐列
    expect(PLAN_VS.layout.merges).toBeUndefined()
    expect(PLAN_VS.layout.allowedMerges).toBeUndefined()
    expect(PLAN_VS.layout.recommendableCols).toEqual([])
    expect(PLAN_VS.highlight?.recommendCol).toBeNull()
  })

  it('表头行槽位化：R1 有槽 id，migrate 的 detail 表头回填不触发，列头文案逐字', () => {
    expect((PLAN_VS.layout.slotGrid ?? [])[1]).toEqual(['plan.h.dim', 'plan.h.plan1', 'plan.h.plan2', null])
    expect(PLAN_VS.slots['plan.h.dim']).toBe('方案')
    expect(PLAN_VS.slots['plan.h.plan1']).toBe('方案一：纯重疾+身故')
    expect(PLAN_VS.slots['plan.h.plan2']).toBe('方案二：纯重疾+定期寿险')
    const m = migrateInstance(cloneInstance(PLAN_VS), listPresetTemplates())
    expect(m.ok).toBe(true)
    if (!m.ok) return
    // 回填触发会把 R1 改写为 head.c0..「项目/说明/备注」；本表 R1 有槽 id，天然规避
    expect(m.value.layout.slotGrid?.[1]).toEqual(['plan.h.dim', 'plan.h.plan1', 'plan.h.plan2', null])
    expect(m.value.slots['head.c0']).toBeUndefined()
  })

  it('4 行数据文案逐字（A3-8 转写），槽位与 slotGrid 数据行一一对应', () => {
    expect(PLAN_VS.slots['plan.title']).toBe('纯重疾+身故 VS 纯重疾+定期寿险')
    // R2 产品
    expect(PLAN_VS.slots['plan.r2.dim']).toBe('产品')
    expect(PLAN_VS.slots['plan.r2.c1']).toBe('某重疾险')
    expect(PLAN_VS.slots['plan.r2.c2']).toBe('某重疾险')
    expect(PLAN_VS.slots['plan.r2.c3']).toBe('某定期寿险')
    // R3 保障内容（C2 无红）
    expect(PLAN_VS.slots['plan.r3.dim']).toBe('保障内容')
    expect(PLAN_VS.slots['plan.r3.c2']).toBe('重疾+中症+轻症')
    // R4 保额
    expect(PLAN_VS.slots['plan.r4.dim']).toBe('保额')
    expect(PLAN_VS.slots['plan.r4.c2']).toBe('30万(30岁男，保终身，20年交)')
    // R5 保费
    expect(PLAN_VS.slots['plan.r5.dim']).toBe('保费')
    const grid = PLAN_VS.layout.slotGrid ?? []
    expect(grid[2]).toEqual(['plan.r2.dim', 'plan.r2.c1', 'plan.r2.c2', 'plan.r2.c3'])
    expect(grid[3]).toEqual(['plan.r3.dim', 'plan.r3.c1', 'plan.r3.c2', 'plan.r3.c3'])
    expect(grid[4]).toEqual(['plan.r4.dim', 'plan.r4.c1', 'plan.r4.c2', 'plan.r4.c3'])
    expect(grid[5]).toEqual(['plan.r5.dim', null, 'plan.r5.c2', null])
  })

  it('语义补全（A6-1 默认口径）：方案一锚点「30万(30岁男，保终身，20年交)，保费7020」+ 保费方案二「4224＋914＝5138」整格红', () => {
    // [4,1]-[5,1] 纵向合并锚点：保额/保费两行并入单值（两数值逐字保留，「保费」取自 C0 行标）
    expect(PLAN_VS.slots['plan.r4.c1']).toBe('30万(30岁男，保终身，20年交)，保费7020')
    // [5,2]-[5,3] 横向合并锚点：三数值全保留（4224＋914＝5138）、整格红
    expect(PLAN_VS.slots['plan.r5.c2']).toEqual({ text: '4224＋914＝5138', emphasize: ['red'] })
  })

  it('4 处整格红（A2-③ 结论短语红整格化）：R3C1 / R3C3 / R4C3 / R5C2，其余数据格无强调', () => {
    const reds: Array<[string, string]> = [
      ['plan.r3.c1', '重疾+中症+轻症+身故/全残'],
      ['plan.r3.c3', '身故/全残'],
      ['plan.r4.c3', '30万(30岁男，保至70岁，20年交)'],
    ]
    for (const [sid, text] of reds) {
      expect(PLAN_VS.slots[sid]).toEqual({ text, emphasize: ['red'] })
    }
    expect(PLAN_VS.slots['plan.r5.c2']).toEqual({ text: '4224＋914＝5138', emphasize: ['red'] })
    // 非红格：纯字符串或无 emphasize 键
    expect(PLAN_VS.slots['plan.r3.c2']).toBe('重疾+中症+轻症')
    expect(PLAN_VS.slots['plan.r4.c2']).toBe('30万(30岁男，保终身，20年交)')
    expect(PLAN_VS.slots['plan.r2.c1']).toBe('某重疾险')
  })

  it('toOption 渲染：标题满宽可达（detail 无角格硬编码）、合并区进渲染链、影子格取锚点文本、红格色随主题', () => {
    const { metas } = buildVisualRows(PLAN_VS)
    // footer 槽空置不占行 → 可视行 = 逻辑行（6）
    expect(metas).toHaveLength(6)
    // detail 类不做 compare 角格硬编码：R0 渲染标题本身
    expect(metas[0]![0]!.text).toBe('纯重疾+身故 VS 纯重疾+定期寿险')
    expect(metas[0]![0]!.text).not.toBe('项目')
    expect(metas[1]![1]!.text).toBe('方案一：纯重疾+身故')
    expect(metas[1]![2]!.text).toBe('方案二：纯重疾+定期寿险')
    expect(metas[2]![0]!.text).toBe('产品')
    expect(metas[3]![1]!.text).toBe('重疾+中症+轻症+身故/全残')
    expect(metas[4]![1]!.text).toBe('30万(30岁男，保终身，20年交)，保费7020')
    expect(metas[5]![2]!.text).toBe('4224＋914＝5138')
    // 覆盖格影子槽为空文本（合并区内容由 customMergeCell 补齐）
    expect(metas[1]![3]!.text).toBe('')
    expect(metas[5]![1]!.text).toBe('')
    // 角色：R0/R1 表头；数据首列 c===0 自动 label（白底加粗近似）；其余 body
    expect(metas[0]![0]!.role).toBe('header')
    expect(metas[1]![2]!.role).toBe('header')
    expect(metas[2]![0]!.role).toBe('label')
    expect(metas[2]![1]!.role).toBe('body')

    const opt = toOption(cloneInstance(PLAN_VS), { mode: 'preview' })
    const pa = PALETTES['T-A']
    const pt = opt.__pt as {
      metas: Array<Array<{ text: string; role: string }>>
      merges: Array<{ start: [number, number]; end: [number, number] }>
    }
    // 合并区进渲染链（merges = merges + structuralMerges）：4 条全在
    expect(pt.merges).toEqual([
      { start: [0, 0], end: [0, 3] },
      { start: [1, 2], end: [1, 3] },
      { start: [4, 1], end: [5, 1] },
      { start: [5, 2], end: [5, 3] },
    ])
    // 合并影子格取锚点文本（每个影子格各画一份完整内容）
    expect(mergeAt(opt, 3, 1)?.text).toBe('方案二：纯重疾+定期寿险')
    expect(mergeAt(opt, 3, 1)?.range).toEqual({ start: { col: 2, row: 1 }, end: { col: 3, row: 1 } })
    expect(mergeAt(opt, 1, 5)?.text).toBe('30万(30岁男，保终身，20年交)，保费7020')
    expect(mergeAt(opt, 1, 5)?.range).toEqual({ start: { col: 1, row: 4 }, end: { col: 1, row: 5 } })
    expect(mergeAt(opt, 3, 5)?.text).toBe('4224＋914＝5138')
    expect(mergeAt(opt, 3, 5)?.range).toEqual({ start: { col: 2, row: 5 }, end: { col: 3, row: 5 } })
    // 红格：色 = 主题 emphasis（无字面量）；非红 body 格不取 emphasis 色
    expect(cellStyle(opt, 3, 1).color).toBe(pa.emphasis)
    expect(cellStyle(opt, 3, 3).color).toBe(pa.emphasis)
    expect(cellStyle(opt, 4, 3).color).toBe(pa.emphasis)
    expect(cellStyle(opt, 5, 2).color).toBe(pa.emphasis)
    expect(cellStyle(opt, 3, 2).color).not.toBe(pa.emphasis)
    // 红格不带 bold（A3-8 只标 red，fontWeight 不因 red 改写）
    expect(cellStyle(opt, 5, 2).fontWeight).toBeUndefined()
    // 首列 label 加粗（600）
    expect(cellStyle(opt, 2, 0).fontWeight).toBe(600)
    // VTable 喂数：关键格逐字（含合并锚点、非锚点影子格为空串）
    const records = opt.records as Array<Record<string, string>>
    expect(records[2]).toEqual({ c0: '产品', c1: '某重疾险', c2: '某重疾险', c3: '某定期寿险' })
    expect(records[4]!.c1).toBe('30万(30岁男，保终身，20年交)，保费7020')
    expect(records[5]!.c0).toBe('保费')
    expect(records[5]!.c2).toBe('4224＋914＝5138')
  })

  it('区块槽：footerSlot(5) 按约定空置；不发区块实例、不配 leftTag、无重复槽 id', () => {
    expect(PLAN_VS.blocks).toEqual([])
    const slots = PLAN_VS.layout.blockSlots
    const footer = slots.find((s) => s.region === 'footer')
    expect(footer).toBeDefined()
    expect(footer!.accept).toEqual(['emphFooter'])
    const lastRow = (PLAN_VS.layout.slotGrid ?? []).length - 1
    expect(footer!.rowHint).toBe(`after-${lastRow}`)
    // 不配 leftTag（A2-①：首列为数据列，leftTag 会把文字搬进区块 props 遮蔽槽值）
    expect(slots.filter((s) => s.region === 'left-tag')).toHaveLength(0)
    const ids = slots.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('HTML 导出可达：caption 取标题槽，表头/合并锚点/红格文案入表', () => {
    const r = exportHtml(cloneInstance(PLAN_VS))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toContain('纯重疾+身故 VS 纯重疾+定期寿险')
    expect(r.value).toContain('<table')
    expect(r.value).toContain('方案一：纯重疾+身故')
    expect(r.value).toContain('方案二：纯重疾+定期寿险')
    expect(r.value).toContain('30万(30岁男，保终身，20年交)，保费7020')
    expect(r.value).toContain('4224＋914＝5138')
  })
})
