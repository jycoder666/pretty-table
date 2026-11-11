import { describe, expect, it } from 'vitest'
import type { TemplateInstance } from '../types'
import { CARE_TIER_COMPARE } from './care-tier-compare'
// 常量尚未注册进 index（TP09 集成收口），本 spec 直引模板文件本体；
// listPresetTemplates 仅作 migrateInstance 的 presets 实参（底稿借用表，本模板自带 slotGrid 用不到）。
import { listPresetTemplates } from './index'
import { validateInstance, cloneInstance } from '../schema/validate'
import { migrateInstance, SCHEMA_VERSION_CURRENT } from '../schema/migrate'
import { buildVisualRows, toOption } from '../adapter/toOption'

// ── need_04 · 医疗层级对比（保险模板套件 TP05，设计文档 A3-5 验收口径）──

/** 收集 slotGrid 里所有非空槽位 id（对齐 templates.spec.ts 既有写法） */
function gridSlotIds(tpl: TemplateInstance): Set<string> {
  const ids = new Set<string>()
  for (const row of tpl.layout.slotGrid ?? []) {
    for (const sid of row) {
      if (sid) ids.add(sid)
    }
  }
  return ids
}

describe('care-tier-compare 医疗层级对比模板', () => {
  it('validate / migrate 通过，schemaVersion 1.3，templateType=detail', () => {
    expect(CARE_TIER_COMPARE.templateId).toBe('care-tier-compare')
    const v = validateInstance(cloneInstance(CARE_TIER_COMPARE))
    expect(v.ok).toBe(true)
    expect(v.ok ? v.value.schemaVersion : undefined).toBe('1.2')
    expect(v.ok ? v.value.meta?.templateType : undefined).toBe('detail')
    const m = migrateInstance(cloneInstance(CARE_TIER_COMPARE), listPresetTemplates())
    expect(m.ok).toBe(true)
    expect(m.ok ? m.value.schemaVersion : undefined).toBe(SCHEMA_VERSION_CURRENT)
    expect(m.ok ? m.value.meta?.templateType : undefined).toBe('detail')
    // 库卡显示名（设计文档 A1 表）
    expect(CARE_TIER_COMPARE.meta?.displayName).toBe('医疗层级对比')
  })

  it('结构：9 行 × 4 列、headerLevels 2、captionSlot 指向标题槽、列宽走 style', () => {
    const grid = CARE_TIER_COMPARE.layout.slotGrid ?? []
    expect(grid).toHaveLength(9)
    for (const row of grid) expect(row).toHaveLength(4)
    expect(CARE_TIER_COMPARE.layout.rowCount).toBe(grid.length)
    expect(CARE_TIER_COMPARE.layout.colCount).toBe(4)
    expect(CARE_TIER_COMPARE.layout.headerLevels).toBe(2)
    expect(CARE_TIER_COMPARE.layout.captionSlot).toBe('tier.title')
    expect(CARE_TIER_COMPARE.layout.style?.colWidths).toEqual([110, 190, 190, 190])
  })

  it('slotGrid 完整：格内引用无悬空槽位、slotDefs 键都有槽值、覆盖格填充符合约定', () => {
    const ids = gridSlotIds(CARE_TIER_COMPARE)
    expect(ids.size).toBeGreaterThan(0)
    for (const sid of ids) {
      expect(CARE_TIER_COMPARE.slots[sid]).toBeDefined()
    }
    for (const sid of Object.keys(CARE_TIER_COMPARE.slotDefs ?? {})) {
      expect(CARE_TIER_COMPARE.slots[sid]).toBeDefined()
    }
    // 标题行覆盖格重复标题槽 id（pricing-v1.ts:206 先例）；本表无纵向合并，其余 8 行全槽位
    const grid = CARE_TIER_COMPARE.layout.slotGrid ?? []
    expect(grid[0]).toEqual(['tier.title', 'tier.title', 'tier.title', 'tier.title'])
    for (let r = 1; r < 9; r++) {
      expect(grid[r]!.every((sid) => sid !== null)).toBe(true)
    }
  })

  it('合并：1 条 structuralMerges（标题满宽），无用户合并区', () => {
    expect(CARE_TIER_COMPARE.layout.structuralMerges).toEqual([{ start: [0, 0], end: [0, 3] }])
    expect(CARE_TIER_COMPARE.layout.merges).toEqual([])
    // 成品语义表：不设 allowedMerges（缺省 = 用户合并全禁，mergeGuard 拒绝）
    expect(CARE_TIER_COMPARE.layout.allowedMerges).toBeUndefined()
  })

  it('7 行文案与 A3-5 转写逐字一致', () => {
    const s = CARE_TIER_COMPARE.slots
    expect(s['tier.title']).toBe('百万医疗 vs 小额医疗 vs 中高端医疗')
    expect(s['tier.h.dim']).toBe('对比维度')
    expect(s['tier.h.a']).toBe('百万医疗险')
    expect(s['tier.h.b']).toBe('小额医疗险')
    expect(s['tier.h.c']).toBe('中高端医疗险')
    // [对比维度, 百万医疗险, 小额医疗险, 中高端医疗险]（R2–R8）
    const rows: Array<[string, string, string, string]> = [
      ['30岁价格', '300元左右/年', '100-300元/年', '3000-几万元/年'],
      ['核心作用', '报销大病大额医疗费，解决"因病致贫"', '报销小病小额医疗费，覆盖百万医疗1万免赔额', '享受优质医疗服务，解决"看病难、体验差"'],
      ['免赔额', '1万/年', '0-100元/年', '0-1万/年'],
      ['报销范围', '社保内+社保外，含外购药', '一般仅限社保内，部分含社保外', '社保内外全覆盖，含特需/私立/海外就医'],
      ['医院范围', '二级及以上公立医院普通部', '二级及以上公立医院普通部', '公立医院特需/国际部、私立医院、海外医院'],
      ['适合人群', '所有人，人手一份的刚需', '小孩、老人等经常生小病住院的人群', '年收入50万以上，对就医体验有要求的中产家庭'],
      ['一句话总结', '普通人首选，花小钱扛大风险', '百万医疗的补充，可买可不买', '有钱了再升级，不是刚需'],
    ]
    // 红格槽值为对象 {text, emphasize:['red']}，其余为纯字符串 → 统一取 text 断言逐字
    const textOf = (v: unknown): string =>
      typeof v === 'object' && v !== null ? String((v as { text: unknown }).text) : String(v)
    rows.forEach(([dim, a, b, c], i) => {
      const r = i + 2
      expect(s[`tier.r${r}.dim`]).toBe(dim)
      expect(textOf(s[`tier.r${r}.a`])).toBe(a)
      expect(textOf(s[`tier.r${r}.b`])).toBe(b)
      expect(textOf(s[`tier.r${r}.c`])).toBe(c)
    })
  })

  it('5 处整格红：恰好 r3.a/r3.c/r7.a/r7.c/r8.c 带 emphasize:["red"]（A2-③/A3-5 逐格），其余零 emphasize', () => {
    const s = CARE_TIER_COMPARE.slots
    const redIds = ['tier.r3.a', 'tier.r3.c', 'tier.r7.a', 'tier.r7.c', 'tier.r8.c']
    for (const sid of redIds) {
      const v = s[sid] as { text: string; emphasize?: string[] }
      expect(v.emphasize).toEqual(['red'])
    }
    for (const [sid, v] of Object.entries(s)) {
      if (!v || typeof v !== 'object') continue
      if (redIds.includes(sid)) continue
      expect((v as { emphasize?: unknown }).emphasize).toBeUndefined()
    }
  })

  it('blockSlots：仅 footerSlot(8)，无 leftTag / 区块带槽，不发区块实例', () => {
    const slots = CARE_TIER_COMPARE.layout.blockSlots
    expect(slots.map((x) => x.id)).toEqual(['footer-1'])
    const footer = slots.find((x) => x.region === 'footer')!
    expect(footer.accept).toEqual(['emphFooter'])
    expect(footer.rowHint).toBe('after-8')
    expect(slots.filter((x) => x.region === 'left-tag')).toHaveLength(0)
    expect(slots.filter((x) => x.region === 'between-rows')).toHaveLength(0)
    expect(CARE_TIER_COMPARE.blocks).toEqual([])
  })

  it('detail 表头回填不触发：R1 有槽 id，迁移后原槽原值（migrate.ts:137-151 不进入）', () => {
    const m = migrateInstance(cloneInstance(CARE_TIER_COMPARE), listPresetTemplates())
    expect(m.ok).toBe(true)
    if (!m.ok) return
    const grid1 = m.value.layout.slotGrid?.[1] ?? []
    expect(grid1).toEqual(['tier.h.dim', 'tier.h.a', 'tier.h.b', 'tier.h.c'])
    expect(m.value.slots['tier.h.dim']).toBe('对比维度')
    // 回填若触发会写入 head.c0='项目'——本模板 R1 全槽位，回填分支不触发
    expect(m.value.slots['head.c0']).toBeUndefined()
  })

  it('toOption 关键断言：标题可达（无 compare 角格）、表头/对比维度角色、标题合并进渲染、5 红格到达 metas', () => {
    const { metas } = buildVisualRows(CARE_TIER_COMPARE)
    // footer 槽空置不占可视行 → 可视行 = 逻辑行 9（toOption.ts:247 注释口径）
    expect(metas).toHaveLength(9)
    // detail 类不触发 compare 型 [0,0]「项目」角格硬编码（toOption.ts:185-188）
    expect(metas[0]![0]!.text).toBe('百万医疗 vs 小额医疗 vs 中高端医疗')
    expect(metas[0]![0]!.role).toBe('header')
    expect(metas[1]!.map((c) => c.text)).toEqual(['对比维度', '百万医疗险', '小额医疗险', '中高端医疗险'])
    expect(metas[1]!.every((c) => c.role === 'header')).toBe(true)
    // 首列对比维度 = label 角色（c===0 自动 label，白底加粗近似口径）；数据列 = body
    expect(metas[2]![0]!.role).toBe('label')
    expect(metas[2]![0]!.text).toBe('30岁价格')
    expect(metas[2]![1]!.role).toBe('body')
    // 5 处整格红逐格到达 metas（R3/R7 百万+中高端、R8 中高端）
    expect(metas[3]![1]!.emphasize).toEqual(['red'])
    expect(metas[3]![3]!.emphasize).toEqual(['red'])
    expect(metas[7]![1]!.emphasize).toEqual(['red'])
    expect(metas[7]![3]!.emphasize).toEqual(['red'])
    expect(metas[8]![3]!.emphasize).toEqual(['red'])
    // 并列未强调格不受染红（A2-③ 整格红的边界：本表红格都是独立格）
    expect(metas[3]![2]!.emphasize).toBeUndefined()
    const opt = toOption(CARE_TIER_COMPARE, { mode: 'preview' })
    // 渲染合并 = merges(空) + structuralMerges(1)；本表无区块行 → 视觉行号 = 逻辑行号
    const pt = opt.__pt as { merges: Array<{ start: number[]; end: number[] }> }
    expect(pt.merges).toEqual(CARE_TIER_COMPARE.layout.structuralMerges)
    const records = opt.records as Record<string, string>[]
    expect(records).toHaveLength(9)
    expect(records[0]!.c0).toBe('百万医疗 vs 小额医疗 vs 中高端医疗')
    expect(records[3]!.c1).toBe('报销大病大额医疗费，解决"因病致贫"')
    expect(records[7]!.c3).toBe('年收入50万以上，对就医体验有要求的中产家庭')
  })
})
