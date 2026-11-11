import { describe, expect, it } from 'vitest'
import { DUTY_COMPARE } from './duty-compare'
import { listPresetTemplates } from './index'
import { validateInstance, cloneInstance } from '../schema/validate'
import { migrateInstance, SCHEMA_VERSION_CURRENT } from '../schema/migrate'
import { buildVisualRows, toOption } from '../adapter/toOption'
import { PALETTES } from '../theme/palettes'
import { LIMITS } from '../theme/layoutScales'

// ── need_02 · duty-compare 保障责任对比（保险模板套件 · 增量设计 A3-3 / TP03）──
// 登记进模板库（listPresetTemplates/getPresetTemplate、templates.spec.ts 登记断言）由
// 集成注册收口（TP09）统一处理；本文件只测模板本体，不预写注册断言。

/** 收集 slotGrid 里所有非空槽位 id（与 templates.spec.ts 同口径） */
function gridSlotIds(tpl: typeof DUTY_COMPARE): Set<string> {
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

/** 数据行 n（1–15）某列的槽值 */
function cell(n: number, key: string): unknown {
  return DUTY_COMPARE.slots[`duty.r${n}.${key}`]
}

describe('duty-compare 保障责任对比模板（保险模板套件 A3-3）', () => {
  it('validate / migrate 通过，schemaVersion 1.3，templateType 显式 matrix（规避 compare 词根误判）', () => {
    expect(DUTY_COMPARE.templateId).toBe('duty-compare')
    // 库卡显示名（设计文档 A1 表）
    expect(DUTY_COMPARE.meta?.displayName).toBe('保障责任对比')
    expect(DUTY_COMPARE.schemaVersion).toBe('1.2')
    const v = validateInstance(cloneInstance(DUTY_COMPARE))
    expect(v.ok).toBe(true)
    expect(v.ok ? v.value.schemaVersion : undefined).toBe('1.2')
    expect(v.ok ? v.value.meta?.templateType : undefined).toBe('matrix')
    const m = migrateInstance(cloneInstance(DUTY_COMPARE), listPresetTemplates())
    expect(m.ok).toBe(true)
    expect(m.ok ? m.value.schemaVersion : undefined).toBe(SCHEMA_VERSION_CURRENT)
    // templateId 含 compare 词根，migrate 兜底推断会落 compare——显式 matrix 迁移后不得被改写
    expect(m.ok ? m.value.meta?.templateType : undefined).toBe('matrix')
    expect(DUTY_COMPARE.meta?.origin).toBe('preset')
    expect(DUTY_COMPARE.themeId).toBe('T-A')
    expect(DUTY_COMPARE.zebraOn).toBe(true)
  })

  it('结构合法：18 行 × 8 列、headerLevels 3、frozenColCount 1、列宽与行列上限', () => {
    const grid = DUTY_COMPARE.layout.slotGrid ?? []
    expect(grid).toHaveLength(18)
    for (const row of grid) expect(row).toHaveLength(8)
    expect(DUTY_COMPARE.layout.rowCount).toBe(18)
    expect(DUTY_COMPARE.layout.colCount).toBe(8)
    expect(DUTY_COMPARE.layout.headerLevels).toBe(3)
    expect(DUTY_COMPARE.layout.frozenColCount).toBe(1)
    expect(DUTY_COMPARE.layout.style?.colWidths).toEqual([150, 100, 100, 116, 80, 120, 100, 64])
    // 行列上限不突破（layoutScales LIMITS：20 行 / 12 列）
    expect(DUTY_COMPARE.layout.rowCount).toBeLessThanOrEqual(LIMITS.maxRows)
    expect(DUTY_COMPARE.layout.colCount).toBeLessThanOrEqual(LIMITS.maxCols)
  })

  it('slotGrid / slotDefs 完整：格内引用无悬空槽位，slotDefs 键都有槽值，rowCount === slotGrid.length', () => {
    const ids = gridSlotIds(DUTY_COMPARE)
    expect(ids.size).toBeGreaterThan(0)
    for (const sid of ids) {
      expect(DUTY_COMPARE.slots[sid]).toBeDefined()
    }
    for (const sid of Object.keys(DUTY_COMPARE.slotDefs ?? {})) {
      expect(DUTY_COMPARE.slots[sid]).toBeDefined()
    }
    expect(DUTY_COMPARE.layout.rowCount).toBe((DUTY_COMPARE.layout.slotGrid ?? []).length)
  })

  it('标题 captionSlot + 7 条 structuralMerges 全锁定；不设用户合并、不设推荐列', () => {
    const grid = DUTY_COMPARE.layout.slotGrid ?? []
    // R0 满宽标题：覆盖格重复标题槽 id（pricing-v1 先例）
    expect(grid[0]).toEqual(Array(8).fill('duty.title'))
    expect(DUTY_COMPARE.layout.captionSlot).toBe('duty.title')
    // R1 组表头：②特殊门诊跨 3 子列（C3/C4 覆盖格 null），其余列纵向跨到 R2
    expect(grid[1]).toEqual([
      'duty.h.name',
      'duty.h.inpatient',
      'duty.h.special',
      null,
      null,
      'duty.h.ed',
      'duty.h.op',
      'duty.h.score',
    ])
    // R2 子表头：纵向合并覆盖格 null
    expect(grid[2]).toEqual([
      null,
      null,
      'duty.h.onco',
      'duty.h.transplant',
      'duty.h.dialysis',
      null,
      null,
      null,
    ])
    const sm = DUTY_COMPARE.layout.structuralMerges ?? []
    expect(sm).toContainEqual({ start: [0, 0], end: [0, 7] })
    expect(sm).toContainEqual({ start: [1, 2], end: [1, 4] })
    for (const c of [0, 1, 5, 6, 7]) {
      expect(sm).toContainEqual({ start: [1, c], end: [2, c] })
    }
    expect(sm).toHaveLength(7)
    // 成品语义表：骨架全在 structuralMerges，用户合并区缺省（全禁），无推荐列
    expect(DUTY_COMPARE.layout.merges).toBeUndefined()
    expect(DUTY_COMPARE.layout.allowedMerges).toBeUndefined()
    expect(DUTY_COMPARE.layout.recommendableCols).toEqual([])
    expect(DUTY_COMPARE.highlight?.recommendCol).toBeNull()
  })

  it('体积压缩杠杆（设计 A5 预案 A 杠杆 1）：无 mark defs，69 勾格为字面 √ 文本槽（C1 15 + C6 15 + C2–C4 各 13）', () => {
    // 69 个 mark slotDefs 压缩为纯文本 '√'：放弃语义着色/粘贴识别，字形与样图一致
    expect(Object.keys(DUTY_COMPARE.slotDefs ?? {})).toHaveLength(0)
    const grid = DUTY_COMPARE.layout.slotGrid ?? []
    const tickCount = (col: number) => {
      let n = 0
      for (let r = 3; r < 18; r++) {
        const sid = grid[r]![col]!
        if (sid && DUTY_COMPARE.slots[sid] === '√') n++
      }
      return n
    }
    expect(tickCount(1)).toBe(15)
    expect(tickCount(6)).toBe(15)
    for (const c of [2, 3, 4]) {
      expect(tickCount(c)).toBe(13)
    }
    // r5 蓝医保长期医疗险 / r10 微医保·长期医疗险：「√（仅重疾医疗有）」长文本格，与字面 √ 同字形
    for (const n of [5, 10]) {
      expect(cell(n, 'onco')).toBe('√（仅重疾医疗有）')
      expect(cell(n, 'transplant')).toBe('√（仅重疾医疗有）')
      expect(cell(n, 'dialysis')).toBe('√（仅重疾医疗有）')
    }
  })

  it('得分列 15 格整格红粗：A+ ×2 / A ×12 / C ×1，emphasize=["red","bold"]', () => {
    const scores = Array.from({ length: 15 }, (_, i) => cell(i + 1, 'score') as { text: string; emphasize?: string[] })
    expect(scores.map((s) => s.text)).toEqual([
      'A+',
      'A+',
      'A',
      'A',
      'A',
      'A',
      'A',
      'A',
      'A',
      'A',
      'A',
      'A',
      'A',
      'A',
      'C',
    ])
    for (const s of scores) {
      expect(s.emphasize).toEqual(['red', 'bold'])
    }
  })

  it('15 行数据逐字（「同上/同」链已展开；〔同上展开〕为转写标注不入表）', () => {
    const names = Array.from({ length: 15 }, (_, i) => cell(i + 1, 'name'))
    expect(names).toEqual([
      '星相守2号',
      '超越保（长久版）',
      '蓝医保（好医好药0免赔）',
      '蓝医保（好医好药版）',
      '蓝医保长期医疗险',
      '金医保3号',
      '长相安2号',
      '好医保长期医疗险（旗舰版2026）',
      '长相安5号（免健告）',
      '微医保·长期医疗险',
      '微医保百万医疗险（1年期）',
      '微医保百万医疗险（普惠版）',
      '众民保·百万医疗险2026',
      '尊享e生2026',
      '惠享保（免健告）',
    ])
    // ③住院前后门急诊：r1/r2 前 45 后 45，r3–r14 前 30 后 30，r15 无此项 → 「/」
    const ed = Array.from({ length: 15 }, (_, i) => cell(i + 1, 'ed'))
    expect(ed).toEqual([
      '住院前45天，后45天',
      '住院前45天，后45天',
      ...Array(12).fill('住院前30天，后30天'),
      '/',
    ])
    // 表头逐字
    expect(DUTY_COMPARE.slots['duty.title']).toBe('15款百万医疗险·四大基础保障责任对比')
    expect(DUTY_COMPARE.slots['duty.h.name']).toBe('产品名称')
    expect(DUTY_COMPARE.slots['duty.h.inpatient']).toBe('①一般住院医疗')
    expect(DUTY_COMPARE.slots['duty.h.special']).toBe('②特殊门诊')
    expect(DUTY_COMPARE.slots['duty.h.onco']).toBe('癌症治疗')
    expect(DUTY_COMPARE.slots['duty.h.transplant']).toBe('器官移植抗排异')
    expect(DUTY_COMPARE.slots['duty.h.dialysis']).toBe('肾透析')
    expect(DUTY_COMPARE.slots['duty.h.ed']).toBe('③住院前后门急诊')
    expect(DUTY_COMPARE.slots['duty.h.op']).toBe('④门诊手术')
    expect(DUTY_COMPARE.slots['duty.h.score']).toBe('得分')
  })

  it('toOption 渲染：勾格字面 √、得分红粗、表头主色底白字、首列 label 白底加粗', () => {
    const { metas } = buildVisualRows(DUTY_COMPARE)
    // footer 槽空置不占行 → 可视行 = 逻辑行（18）
    expect(metas).toHaveLength(18)
    expect(metas[0]![0]!.text).toBe('15款百万医疗险·四大基础保障责任对比')
    expect(metas[1]![2]!.text).toBe('②特殊门诊')
    expect(metas[2]![2]!.text).toBe('癌症治疗')
    expect(metas[2]![4]!.text).toBe('肾透析')
    // 勾格：字面 √ 文本槽（压缩杠杆后放弃语义着色/居中，与 r5/r10 长文本格同字形）
    expect(metas[3]![1]!.text).toBe('√')
    // 首列数据格走 label 角色（白底加粗近似，A2-①）
    expect(metas[3]![0]!.role).toBe('label')

    const opt = toOption(cloneInstance(DUTY_COMPARE), { mode: 'preview' })
    const pa = PALETTES['T-A']
    // 表头主色底白字（标题行与组/子表头同）
    expect(cellStyle(opt, 1, 2).bgColor).toBe(pa.primary)
    expect(cellStyle(opt, 1, 2).color).toBe(pa.headerText)
    expect(cellStyle(opt, 2, 3).bgColor).toBe(pa.primary)
    // 得分红粗：色 = 主题 emphasis（无字面量）+ 粗
    expect(cellStyle(opt, 3, 7).color).toBe(pa.emphasis)
    expect(cellStyle(opt, 3, 7).fontWeight).toBe(700)
    // 首列 label：加粗、底色为斑马/纸色而非主色（蓝底白字近似的披露口径）
    expect(cellStyle(opt, 3, 0).fontWeight).toBe(600)
    expect(cellStyle(opt, 3, 0).bgColor).toBe(pa.zebra)
    // records 文本与渲染/导出同源
    const records = opt.records as Record<string, string>[]
    expect(records[3]!.c0).toBe('星相守2号')
    expect(records[3]!.c1).toBe('√')
    expect(records[3]!.c7).toBe('A+')
    expect(records[17]!.c5).toBe('/')
    expect(records[17]!.c7).toBe('C')
  })

  it('区块槽：footerSlot(17) 按约定空置；不发区块实例、不配 leftTag、无重复槽 id', () => {
    expect(DUTY_COMPARE.blocks).toEqual([])
    const slots = DUTY_COMPARE.layout.blockSlots
    const footer = slots.find((s) => s.region === 'footer')
    expect(footer).toBeDefined()
    expect(footer!.accept).toEqual(['emphFooter'])
    const lastRow = (DUTY_COMPARE.layout.slotGrid ?? []).length - 1
    expect(footer!.rowHint).toBe(`after-${lastRow}`)
    // 不配 leftTag（A2-①：首列为数据列，leftTag 会把文字搬进区块 props 遮蔽槽值）
    expect(slots.filter((s) => s.region === 'left-tag')).toHaveLength(0)
    const ids = slots.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
