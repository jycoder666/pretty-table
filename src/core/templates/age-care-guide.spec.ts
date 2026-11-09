import { describe, expect, it } from 'vitest'
import type { TemplateInstance } from '../types'
import { AGE_CARE_GUIDE } from './age-care-guide'
// 常量尚未注册进 index（TP09 集成收口），本 spec 直引模板文件本体；
// listPresetTemplates 仅作 migrateInstance 的 presets 实参（底稿借用表，本模板自带 slotGrid 用不到）。
import { listPresetTemplates } from './index'
import { validateInstance, cloneInstance } from '../schema/validate'
import { migrateInstance, SCHEMA_VERSION_CURRENT } from '../schema/migrate'
import { buildVisualRows, toOption } from '../adapter/toOption'

// ── need_00 · 各年龄段保障配置（保险模板套件 TP01，设计文档 A3-1 验收口径）──

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

describe('age-care-guide 各年龄段保障模板', () => {
  it('validate / migrate 通过，schemaVersion 1.2，templateType=detail', () => {
    expect(AGE_CARE_GUIDE.templateId).toBe('age-care-guide')
    const v = validateInstance(cloneInstance(AGE_CARE_GUIDE))
    expect(v.ok).toBe(true)
    expect(v.ok ? v.value.schemaVersion : undefined).toBe('1.2')
    expect(v.ok ? v.value.meta?.templateType : undefined).toBe('detail')
    const m = migrateInstance(cloneInstance(AGE_CARE_GUIDE), listPresetTemplates())
    expect(m.ok).toBe(true)
    expect(m.ok ? m.value.schemaVersion : undefined).toBe(SCHEMA_VERSION_CURRENT)
    expect(m.ok ? m.value.meta?.templateType : undefined).toBe('detail')
    // 库卡显示名（设计文档 A1 表）；副题「深蓝保 专注保险评测」移 description（A3-1 披露④）
    expect(AGE_CARE_GUIDE.meta?.displayName).toBe('各年龄段保障配置')
    expect(AGE_CARE_GUIDE.meta?.description).toBe('深蓝保 专注保险评测')
  })

  it('结构：10 行 × 4 列、headerLevels 2、captionSlot 指向标题槽、列宽走 style', () => {
    const grid = AGE_CARE_GUIDE.layout.slotGrid ?? []
    expect(grid).toHaveLength(10)
    for (const row of grid) expect(row).toHaveLength(4)
    expect(AGE_CARE_GUIDE.layout.rowCount).toBe(grid.length)
    expect(AGE_CARE_GUIDE.layout.colCount).toBe(4)
    expect(AGE_CARE_GUIDE.layout.headerLevels).toBe(2)
    expect(AGE_CARE_GUIDE.layout.captionSlot).toBe('age.title')
    expect(AGE_CARE_GUIDE.layout.style?.colWidths).toEqual([96, 150, 170, 330])
  })

  it('slotGrid 完整：格内引用无悬空槽位、slotDefs 键都有槽值、覆盖格填充符合约定', () => {
    const ids = gridSlotIds(AGE_CARE_GUIDE)
    expect(ids.size).toBeGreaterThan(0)
    for (const sid of ids) {
      expect(AGE_CARE_GUIDE.slots[sid]).toBeDefined()
    }
    for (const sid of Object.keys(AGE_CARE_GUIDE.slotDefs ?? {})) {
      expect(AGE_CARE_GUIDE.slots[sid]).toBeDefined()
    }
    // 标题行覆盖格重复标题槽 id（pricing-v1.ts:206 先例）
    const grid = AGE_CARE_GUIDE.layout.slotGrid ?? []
    expect(grid[0]).toEqual(['age.title', 'age.title', 'age.title', 'age.title'])
    // 4 组人群标签的纵向合并覆盖格填 null（compare-alpha-v1.ts:124 先例）
    expect(grid[3]![0]).toBeNull()
    expect(grid[5]![0]).toBeNull()
    expect(grid[7]![0]).toBeNull()
    expect(grid[9]![0]).toBeNull()
  })

  it('合并：5 条 structuralMerges（标题满宽 + 4 组各跨 2 行），无用户合并区', () => {
    expect(AGE_CARE_GUIDE.layout.structuralMerges).toEqual([
      { start: [0, 0], end: [0, 3] },
      { start: [2, 0], end: [3, 0] },
      { start: [4, 0], end: [5, 0] },
      { start: [6, 0], end: [7, 0] },
      { start: [8, 0], end: [9, 0] },
    ])
    expect(AGE_CARE_GUIDE.layout.merges).toEqual([])
    // 成品语义表：不设 allowedMerges（缺省 = 用户合并全禁，mergeGuard 拒绝）
    expect(AGE_CARE_GUIDE.layout.allowedMerges).toBeUndefined()
  })

  it('8 行文案与 A3-1 转写逐字一致；7 处清单红全部放弃（不落 emphasize）', () => {
    const s = AGE_CARE_GUIDE.slots
    expect(s['age.title']).toBe('0岁小孩-80岁各年龄段保障配置方案')
    expect(s['age.h.audience']).toBe('人群')
    expect(s['age.h.stage']).toBe('年龄段')
    expect(s['age.h.risk']).toBe('主要防范风险')
    expect(s['age.h.plan']).toBe('配置方案建议')
    // [年龄段, 主要防范风险, 配置方案建议]（R2–R9；首列组标签单独断言）
    const rows: Array<[string, string, string]> = [
      ['0~5岁 新生儿、婴幼儿', '小病小痛、重大疾病', '①少儿医保 ②少儿重疾险 ③小额医疗险 ④百万医疗险'],
      ['6~17岁 青少年、学生群体', '小病小痛、重大疾病、意外伤害', '①少儿医保 ②少儿重疾险 ③百万医疗险 ④学平险或小额医疗险 ⑤少儿意外险'],
      ['18~25岁 大学生群体、初入社会', '重大疾病、意外伤害', '①大学生医保 ②一年期/短期重疾险（过渡） ③百万医疗险 ④成人综合意外险'],
      ['26~35岁 新晋家庭顶梁柱 成家立业', '重大疾病、意外伤害、早逝', '①保长期/终身重疾险 ②百万医疗险 ③成人综合意外险 ④定期寿险'],
      ['36~50岁 家庭稳定、事业成熟期', '重大疾病、意外伤害、早逝、养老风险', '①保长期/终身重疾险 ②长期百万医疗险 ③成人综合意外险 ④高额额定寿 ⑤增额终身寿、或养老年金'],
      ['51~60岁 中老年疾病高发期 健康隐患增多', '重大疾病、意外事故、死亡、养老风险', '必备保障：①保证续保的长期医疗险 百万医疗险、或防癌医疗险 ②成人综合意外险 根据预算考虑：③防癌险 ④定期寿险'],
      ['61~70岁 退休养老、卸去家庭责任重担', '意外伤害、重大疾病', '①百万医疗险/防癌医疗险/惠民保，视情况选择 ②老人意外险 根据预算考虑：③防癌险'],
      ['71~80岁 高龄老人', '意外伤害、重大疾病', '①惠民保 ②老人意外险 根据预算考虑：③防癌险'],
    ]
    rows.forEach(([stage, risk, plan], i) => {
      const r = i + 2
      expect(s[`age.r${r}.stage`]).toBe(stage)
      expect(s[`age.r${r}.risk`]).toBe(risk)
      expect(s[`age.r${r}.plan`]).toBe(plan)
    })
    expect(s['age.r2.audience']).toBe('未成年人')
    expect(s['age.r4.audience']).toBe('青年阶段')
    expect(s['age.r6.audience']).toBe('中年阶段')
    expect(s['age.r8.audience']).toBe('老年阶段')
    // 红字放弃（A2-③/A3-1）：全部槽值零 emphasize，任何格不带 red/bold
    //（收集式断言：不经 if 分支 expect，规避 vitest/no-conditional-expect）
    const withEmphasis = Object.values(s).filter(
      (v) => v && typeof v === 'object' && (v as { emphasize?: unknown }).emphasize !== undefined,
    )
    expect(withEmphasis).toEqual([])
  })

  it('blockSlots：仅 footerSlot(9)，无 leftTag / 区块带槽，不发区块实例', () => {
    const slots = AGE_CARE_GUIDE.layout.blockSlots
    expect(slots.map((x) => x.id)).toEqual(['footer-1'])
    const footer = slots.find((x) => x.region === 'footer')!
    expect(footer.accept).toEqual(['emphFooter'])
    expect(footer.rowHint).toBe('after-9')
    expect(slots.filter((x) => x.region === 'left-tag')).toHaveLength(0)
    expect(slots.filter((x) => x.region === 'between-rows')).toHaveLength(0)
    expect(AGE_CARE_GUIDE.blocks).toEqual([])
  })

  it('detail 表头回填不触发：R1 有槽 id，迁移后原槽原值（migrate.ts:137-151 不进入）', () => {
    const m = migrateInstance(cloneInstance(AGE_CARE_GUIDE), listPresetTemplates())
    expect(m.ok).toBe(true)
    if (!m.ok) return
    const grid1 = m.value.layout.slotGrid?.[1] ?? []
    expect(grid1).toEqual(['age.h.audience', 'age.h.stage', 'age.h.risk', 'age.h.plan'])
    expect(m.value.slots['age.h.audience']).toBe('人群')
    // 回填若触发会写入 head.c0='项目'——本模板 R1 全槽位，回填分支不触发
    expect(m.value.slots['head.c0']).toBeUndefined()
  })

  it('toOption 关键断言：标题可达（无 compare 角格）、表头/组标签角色、5 条合并进渲染', () => {
    const { metas } = buildVisualRows(AGE_CARE_GUIDE)
    // footer 槽空置不占可视行 → 可视行 = 逻辑行 10（toOption.ts:247 注释口径）
    expect(metas).toHaveLength(10)
    // detail 类不触发 compare 型 [0,0]「项目」角格硬编码（toOption.ts:185-188）
    expect(metas[0]![0]!.text).toBe('0岁小孩-80岁各年龄段保障配置方案')
    expect(metas[0]![0]!.role).toBe('header')
    expect(metas[1]!.map((c) => c.text)).toEqual(['人群', '年龄段', '主要防范风险', '配置方案建议'])
    expect(metas[1]!.every((c) => c.role === 'header')).toBe(true)
    // 首列组标签锚点 = label 角色（c===0 自动 label，白底加粗近似口径）；覆盖格无槽
    expect(metas[2]![0]!.role).toBe('label')
    expect(metas[2]![0]!.text).toBe('未成年人')
    expect(metas[3]![0]!.slotId).toBeNull()
    const opt = toOption(AGE_CARE_GUIDE, { mode: 'preview' })
    // 渲染合并 = merges(空) + structuralMerges(5)；本表无区块行 → 视觉行号 = 逻辑行号
    const pt = opt.__pt as { merges: Array<{ start: number[]; end: number[] }> }
    expect(pt.merges).toEqual(AGE_CARE_GUIDE.layout.structuralMerges)
    const records = opt.records as Record<string, string>[]
    expect(records).toHaveLength(10)
    expect(records[0]!.c0).toBe('0岁小孩-80岁各年龄段保障配置方案')
    // R3 配置方案含「学平险或小额医疗险」（TP10 e2e 关键格断言点）
    expect(records[3]!.c3).toContain('学平险或小额医疗险')
  })
})
