import { describe, expect, it } from 'vitest'
import { CRITICAL_LIST_50 } from './critical-list-50'
import { listPresetTemplates } from './index'
import { validateInstance, cloneInstance } from '../schema/validate'
import { migrateInstance, SCHEMA_VERSION_CURRENT } from '../schema/migrate'
import { buildVisualRows, toOption } from '../adapter/toOption'
import { PALETTES } from '../theme/palettes'
import { LIMITS, MERGE_MAX_SPAN_ROWS, visibleRowCount } from '../theme/layoutScales'
import type { TemplateInstance } from '../types'

// ── need_06 · critical-list-50 重疾险产品汇总（保险模板套件 · 增量设计 A3-7 / TP07）──
// 登记进模板库（listPresetTemplates/getPresetTemplate、templates.spec.ts 登记断言）由
// 集成注册收口（TP09）统一处理；本文件只测模板本体，不预写注册断言。

/** 收集 slotGrid 里所有非空槽位 id（与 templates.spec.ts 同口径） */
function gridSlotIds(tpl: TemplateInstance): Set<string> {
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

/** 数据行（R1–R19）某列的槽值 */
function cell(n: number, key: 'co' | 'prod'): unknown {
  return CRITICAL_LIST_50.slots[`crit.r${n}.${key}`]
}

/** A3-7 转写逐字：19 行 [保险公司, 产品名称]（R1–R12 成人、R13–R19 少儿） */
const ROWS: Array<[string, string]> = [
  ['复星联合健康', '达尔文12号、医联联盟、完美人生8号、康乐福、康乐一生2026'],
  ['君龙人寿', '超级玛丽16号Pro'],
  ['海保人寿', '哪吒2号'],
  ['瑞华保险', '达尔文超越版12号、吉祥瑞5.0、华佗1号（康泰版）'],
  ['信泰人寿', '及时雨2026重大疾病保险'],
  ['众安保险', '众民保重疾险、尊享e生重疾险'],
  ['中华保险', '蓝海2号重疾险'],
  ['平安保险', '安佑福全能、守卫百分百26、爱满分26'],
  ['太平洋保险', '金生无忧2025、阿基米德2025'],
  ['新华保险', '健康多倍保庆典版'],
  ['泰康人寿', '乐享健康2026'],
  ['太平人寿', '福禄嘉禧'],
  ['复星联合健康', '妈咪保贝爱善B款、妈咪保贝哪吒守护'],
  ['复星保德信', '大黄蜂16号（旗舰版）'],
  ['君龙人寿', '小青龙6号D款、完美宝贝8号'],
  ['招商仁和', '青云卫6号'],
  ['信美相互', '达尔文宝贝计划15号'],
  ['人保寿险', '无忧宝贝2.0'],
  ['华贵人寿', '麦兜兜2026'],
]

describe('critical-list-50 重疾险产品汇总模板（保险模板套件 A3-7）', () => {
  it('validate / migrate 通过，schemaVersion 1.2，templateType 显式 detail（词根推断兜底会落 compare，不得被改写）', () => {
    expect(CRITICAL_LIST_50.templateId).toBe('critical-list-50')
    expect(CRITICAL_LIST_50.schemaVersion).toBe('1.2')
    const v = validateInstance(cloneInstance(CRITICAL_LIST_50))
    expect(v.ok).toBe(true)
    expect(v.ok ? v.value.schemaVersion : undefined).toBe('1.2')
    expect(v.ok ? v.value.meta?.templateType : undefined).toBe('detail')
    const m = migrateInstance(cloneInstance(CRITICAL_LIST_50), listPresetTemplates())
    expect(m.ok).toBe(true)
    expect(m.ok ? m.value.schemaVersion : undefined).toBe(SCHEMA_VERSION_CURRENT)
    // templateId 不含 pricing/matrix/detail 词根，migrate 兜底推断会落 compare——显式 detail 迁移后不得被改写
    expect(m.ok ? m.value.meta?.templateType : undefined).toBe('detail')
    expect(CRITICAL_LIST_50.meta?.origin).toBe('preset')
    expect(CRITICAL_LIST_50.themeId).toBe('T-A')
    expect(CRITICAL_LIST_50.zebraOn).toBe(true)
    // 库卡承载标题（A3-7 披露②）：displayName = 压缩名，description = 原标题逐字
    expect(CRITICAL_LIST_50.meta?.displayName).toBe('重疾险产品汇总')
    expect(CRITICAL_LIST_50.meta?.description).toBe('2026年·最新50款重疾险产品汇总')
  })

  it('结构合法：20 行 × 3 列满载、headerLevels 1、列宽；行列上限与可见行口径', () => {
    const grid = CRITICAL_LIST_50.layout.slotGrid ?? []
    expect(grid).toHaveLength(20)
    for (const row of grid) expect(row).toHaveLength(3)
    expect(CRITICAL_LIST_50.layout.rowCount).toBe(20)
    expect(CRITICAL_LIST_50.layout.colCount).toBe(3)
    expect(CRITICAL_LIST_50.layout.headerLevels).toBe(1)
    expect(CRITICAL_LIST_50.layout.style?.colWidths).toEqual([110, 150, 220])
    // 行列上限不突破（layoutScales LIMITS：20 行 / 12 列）
    expect(CRITICAL_LIST_50.layout.rowCount).toBeLessThanOrEqual(LIMITS.maxRows)
    expect(CRITICAL_LIST_50.layout.colCount).toBeLessThanOrEqual(LIMITS.maxCols)
    // 20 行满载（A3-7 披露③）：可见行 = 逻辑行（无区块行占用）= maxRows → 编辑台 canAddRow 置灰
    expect(CRITICAL_LIST_50.layout.rowCount).toBe(LIMITS.maxRows)
    expect(visibleRowCount(cloneInstance(CRITICAL_LIST_50))).toBe(LIMITS.maxRows)
  })

  it('slotGrid / slotDefs 完整：无悬空槽位、slotDefs 键都有槽值、rowCount === slotGrid.length；覆盖格 null', () => {
    const ids = gridSlotIds(CRITICAL_LIST_50)
    expect(ids.size).toBeGreaterThan(0)
    for (const sid of ids) {
      expect(CRITICAL_LIST_50.slots[sid]).toBeDefined()
    }
    for (const sid of Object.keys(CRITICAL_LIST_50.slotDefs ?? {})) {
      expect(CRITICAL_LIST_50.slots[sid]).toBeDefined()
    }
    expect(CRITICAL_LIST_50.layout.rowCount).toBe((CRITICAL_LIST_50.layout.slotGrid ?? []).length)
    const grid = CRITICAL_LIST_50.layout.slotGrid ?? []
    // R0 表头全槽位（无标题行，A3-7 披露②）
    expect(grid[0]).toEqual(['crit.h.cat', 'crit.h.co', 'crit.h.prod'])
    // 两组纵向合并的覆盖格填 null（compare-alpha-v1.ts:124 先例），锚点在组首行 C0
    expect(grid[1]![0]).toBe('crit.r1.cat')
    expect(grid[13]![0]).toBe('crit.r13.cat')
    for (let r = 2; r <= 12; r++) expect(grid[r]![0]).toBeNull()
    for (let r = 14; r <= 19; r++) expect(grid[r]![0]).toBeNull()
    expect(grid[12]![0]).toBeNull()
  })

  it('合并：2 条 structuralMerges 跨 12/7 行；模板数据免检 6/8/30 用户闸（validateInstance 通过即证）', () => {
    const sm = CRITICAL_LIST_50.layout.structuralMerges ?? []
    expect(sm).toEqual([
      { start: [1, 0], end: [12, 0] },
      { start: [13, 0], end: [19, 0] },
    ])
    // 跨度 12/7 行 > 用户合并闸 6（layoutScales MERGE_MAX_SPAN_ROWS）——canMerge 只闸用户意图
    expect(sm[0]!.end[0] - sm[0]!.start[0] + 1).toBe(12)
    expect(sm[1]!.end[0] - sm[1]!.start[0] + 1).toBe(7)
    expect(sm[0]!.end[0] - sm[0]!.start[0] + 1).toBeGreaterThan(MERGE_MAX_SPAN_ROWS)
    expect(sm[1]!.end[0] - sm[1]!.start[0] + 1).toBeGreaterThan(MERGE_MAX_SPAN_ROWS)
    // 免检实证：大跨度模板数据 validateInstance 通过（validate/migrate 不校验 merges）
    expect(validateInstance(cloneInstance(CRITICAL_LIST_50)).ok).toBe(true)
    // 成品语义表：骨架全在 structuralMerges，不设 merges/allowedMerges（缺省 = 用户合并全禁）
    expect(CRITICAL_LIST_50.layout.merges).toBeUndefined()
    expect(CRITICAL_LIST_50.layout.allowedMerges).toBeUndefined()
    expect(CRITICAL_LIST_50.highlight?.recommendCol).toBeNull()
  })

  it('31 款文案逐字（成人 22 + 少儿 9）：表头 + 19 行公司/产品、首列两组锚点；第二列 19 格 bold，全表无 red', () => {
    const s = CRITICAL_LIST_50.slots
    expect(s['crit.h.cat']).toBe('产品类别')
    expect(s['crit.h.co']).toBe('保险公司')
    expect(s['crit.h.prod']).toBe('产品名称')
    // 19 行逐字（R1–R19）
    ROWS.forEach(([co, prod], i) => {
      const r = i + 1
      expect(s[`crit.r${r}.co`]).toEqual({ text: co, emphasize: ['bold'] })
      expect(s[`crit.r${r}.prod`]).toBe(prod)
    })
    // 首列锚点仅两组（A3-7：成人 12 行 + 少儿 7 行）
    expect(s['crit.r1.cat']).toBe('成人重疾险')
    expect(s['crit.r13.cat']).toBe('少儿重疾险')
    expect(Object.keys(s).filter((k) => k.endsWith('.cat'))).toEqual([
      'crit.h.cat',
      'crit.r1.cat',
      'crit.r13.cat',
    ])
    // 款数口径（TP07 ④）：成人 22 款 + 少儿 9 款 = 31 款（按「、」计）
    const count = (from: number, to: number) => {
      let n = 0
      for (let r = from; r <= to; r++) n += (cell(r, 'prod') as string).split('、').length
      return n
    }
    expect(count(1, 12)).toBe(22)
    expect(count(13, 19)).toBe(9)
    expect(count(1, 19)).toBe(31)
    // 第二列每格 bold（芯片近似，A3-7）：19 格全部 emphasize:['bold']
    for (let r = 1; r <= 19; r++) {
      expect((cell(r, 'co') as { emphasize?: string[] }).emphasize).toEqual(['bold'])
    }
    // 全表零 red（本表无红标注；收集式断言不经 if 分支 expect，规避 vitest/no-conditional-expect）
    const redSlots = Object.values(s).filter(
      (val) =>
        val && typeof val === 'object' && ((val as { emphasize?: string[] }).emphasize ?? []).includes('red'),
    )
    expect(redSlots).toEqual([])
  })

  it('blockSlots：仅 footerSlot(19) 按约定空置；不发区块实例、不配 leftTag、无重复槽 id', () => {
    expect(CRITICAL_LIST_50.blocks).toEqual([])
    const slots = CRITICAL_LIST_50.layout.blockSlots
    expect(slots.map((x) => x.id)).toEqual(['footer-1'])
    const footer = slots.find((x) => x.region === 'footer')!
    expect(footer.accept).toEqual(['emphFooter'])
    const lastRow = (CRITICAL_LIST_50.layout.slotGrid ?? []).length - 1
    expect(footer.rowHint).toBe(`after-${lastRow}`)
    expect(footer.rowHint).toBe('after-19')
    // 不配 leftTag（A2-①：首列为合并组标签 + 数据列，leftTag 会把文字搬进区块 props 遮蔽槽值）
    expect(slots.filter((x) => x.region === 'left-tag')).toHaveLength(0)
    expect(slots.filter((x) => x.region === 'between-rows')).toHaveLength(0)
    const ids = slots.map((x) => x.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('detail 表头回填不触发：headerLevels 1（回填分支要求 ≥2），迁移后 R0 原槽原值', () => {
    const m = migrateInstance(cloneInstance(CRITICAL_LIST_50), listPresetTemplates())
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.value.layout.headerLevels).toBe(1)
    expect(m.value.layout.slotGrid?.[0]).toEqual(['crit.h.cat', 'crit.h.co', 'crit.h.prod'])
    expect(m.value.slots['crit.h.cat']).toBe('产品类别')
    // 回填若触发会写入 head.c0='项目'——本表 headerLevels 1 且 R0 全槽位，分支不进入
    expect(m.value.slots['head.c0']).toBeUndefined()
  })

  it('toOption 关键断言：表头主色底白字、首列组标签 label 白底加粗、第二列 bold、2 条合并进渲染', () => {
    const { metas } = buildVisualRows(CRITICAL_LIST_50)
    // footer 槽空置不占行 → 可视行 = 逻辑行（20）
    expect(metas).toHaveLength(20)
    // R0 表头（headerLevels 1）：角色 header，无标题行
    expect(metas[0]!.map((c) => c.text)).toEqual(['产品类别', '保险公司', '产品名称'])
    expect(metas[0]!.every((c) => c.role === 'header')).toBe(true)
    // 首列组标签锚点 = label 角色（c===0 自动 label，白底加粗近似）；覆盖格无槽
    expect(metas[1]![0]!.role).toBe('label')
    expect(metas[1]![0]!.text).toBe('成人重疾险')
    expect(metas[13]![0]!.role).toBe('label')
    expect(metas[13]![0]!.text).toBe('少儿重疾险')
    expect(metas[2]![0]!.slotId).toBeNull()
    expect(metas[12]![0]!.slotId).toBeNull()
    expect(metas[14]![0]!.slotId).toBeNull()
    // 第二列数据格 emphasize bold 进 metas
    expect(metas[1]![1]!.emphasize).toEqual(['bold'])
    expect(metas[1]![1]!.text).toBe('复星联合健康')

    const opt = toOption(cloneInstance(CRITICAL_LIST_50), { mode: 'preview' })
    const pa = PALETTES['T-A']
    // 表头主色底白字（toOption.ts:326-329）
    expect(cellStyle(opt, 0, 0).bgColor).toBe(pa.primary)
    expect(cellStyle(opt, 0, 0).color).toBe(pa.headerText)
    expect(cellStyle(opt, 0, 0).fontWeight).toBe('bold')
    // 第二列 bold：fontWeight 700（toOption.ts:371）
    expect(cellStyle(opt, 1, 1).fontWeight).toBe(700)
    expect(cellStyle(opt, 2, 1).fontWeight).toBe(700)
    // 首列 label：加粗、底色斑马/纸色而非主色（蓝底白字近似的披露口径）；偶数行纸色
    expect(cellStyle(opt, 1, 0).fontWeight).toBe(600)
    expect(cellStyle(opt, 1, 0).bgColor).toBe(pa.zebra)
    expect(cellStyle(opt, 2, 1).bgColor).toBe(pa.paper)
    // 渲染合并 = merges(缺省空) + structuralMerges(2)；无区块行 → 视觉行号 = 逻辑行号
    const pt = opt.__pt as { merges: Array<{ start: number[]; end: number[] }> }
    expect(pt.merges).toEqual(CRITICAL_LIST_50.layout.structuralMerges)
    // records 文本与渲染/导出同源
    const records = opt.records as Record<string, string>[]
    expect(records).toHaveLength(20)
    expect(records[0]!.c0).toBe('产品类别')
    expect(records[1]!.c0).toBe('成人重疾险')
    expect(records[1]!.c1).toBe('复星联合健康')
    expect(records[1]!.c2).toBe('达尔文12号、医联联盟、完美人生8号、康乐福、康乐一生2026')
    expect(records[12]!.c1).toBe('太平人寿')
    expect(records[13]!.c0).toBe('少儿重疾险')
    expect(records[19]!.c1).toBe('华贵人寿')
    expect(records[19]!.c2).toBe('麦兜兜2026')
  })
})
