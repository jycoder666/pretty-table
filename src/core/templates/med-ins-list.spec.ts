import { describe, expect, it } from 'vitest'
import { MED_INS_LIST } from './med-ins-list'
import { listPresetTemplates } from './index'
import { validateInstance, cloneInstance } from '../schema/validate'
import { migrateInstance, SCHEMA_VERSION_CURRENT } from '../schema/migrate'
import { toOption } from '../adapter/toOption'
import { exportHtml } from '../export/html'

// ── 保险模板套件 TP02：med-ins-list 百万医疗险热门清单（detail · schema 1.2）──
// 内容源 = 增量设计-保险模板套件-2026-11-06.md A3-2 逐字转写。本 spec 不依赖注册
//（TP09 统一入列后由共享 templates.spec.ts 收口），断言全部直接作用在模板常量上。

/** A3-2 转写：15 行「保险公司 / 产品名称」逐字 */
const LIST_ROWS: Array<[string, string]> = [
  ['太平洋健康险', '蓝医保（好医好药0免赔）'],
  ['太平洋健康险', '蓝医保（好医好药版）'],
  ['太平洋健康险', '蓝医保长期医疗险'],
  ['人保寿险', '金医保3号'],
  ['复星联合健康', '星相守2号'],
  ['复星联合健康', '超越保（长久版）'],
  ['平安健康', '长相安2号'],
  ['人保健康', '好医保长期医疗险（旗舰版2026）'],
  ['人保财险', '长相安5号（免健告）'],
  ['太平洋健康险', '微医保·长期医疗险'],
  ['泰康在线', '微医保·百万医疗险（1年期）'],
  ['泰康在线', '微医保·百万医疗险（普惠版）'],
  ['众安在线财险', '众民保·百万医疗险2026'],
  ['众安在线财险', '尊享e生2026'],
  ['中国人寿财险', '惠享保（免健告）'],
]

describe('med-ins-list 百万医疗险热门清单模板', () => {
  it('validate / migrate 通过：schemaVersion 1.2、templateType=detail、登记字段齐备', () => {
    expect(MED_INS_LIST.templateId).toBe('med-ins-list')
    const v = validateInstance(cloneInstance(MED_INS_LIST))
    expect(v.ok).toBe(true)
    expect(v.ok ? v.value.schemaVersion : undefined).toBe('1.2')
    expect(v.ok ? v.value.meta?.templateType : undefined).toBe('detail')
    const m = migrateInstance(cloneInstance(MED_INS_LIST), listPresetTemplates())
    expect(m.ok).toBe(true)
    expect(m.ok ? m.value.schemaVersion : undefined).toBe(SCHEMA_VERSION_CURRENT)
    expect(SCHEMA_VERSION_CURRENT).toBe('1.3')
    expect(MED_INS_LIST.meta?.templateType).toBe('detail')
    expect(MED_INS_LIST.meta?.displayName).toBe('百万医疗险热门清单')
    expect(MED_INS_LIST.meta?.origin).toBe('preset')
    expect(MED_INS_LIST.themeId).toBe('T-A')
    expect(MED_INS_LIST.zebraOn).toBe(true)
  })

  it('结构合法：17 行 × 2 列、headerLevels 2、colWidths [150,210]、slotGrid 无悬空槽位', () => {
    const grid = MED_INS_LIST.layout.slotGrid ?? []
    expect(grid).toHaveLength(17)
    for (const row of grid) expect(row).toHaveLength(2)
    const ids = new Set(grid.flat().filter((x): x is string => !!x))
    // 1 标题槽 + 2 列头槽 + 15×2 数据槽（R0 覆盖格重复标题槽 id，不去重计数之外）
    expect(ids.size).toBe(33)
    for (const sid of ids) expect(MED_INS_LIST.slots[sid]).toBeDefined()
    expect(MED_INS_LIST.layout.rowCount).toBe(17)
    expect(MED_INS_LIST.layout.rowCount).toBe(grid.length)
    expect(MED_INS_LIST.layout.colCount).toBe(2)
    expect(MED_INS_LIST.layout.headerLevels).toBe(2)
    expect(MED_INS_LIST.layout.style?.colWidths).toEqual([150, 210])
  })

  it('标题行：captionSlot 指向标题槽、structural merge [0,0]-[0,1]、覆盖格重复标题槽 id', () => {
    expect(MED_INS_LIST.layout.captionSlot).toBe('med.title')
    expect(MED_INS_LIST.slots['med.title']).toBe('2026最新15款百万医疗险热门清单')
    expect(MED_INS_LIST.layout.structuralMerges).toContainEqual({ start: [0, 0], end: [0, 1] })
    expect((MED_INS_LIST.layout.slotGrid ?? [])[0]).toEqual(['med.title', 'med.title'])
    // 成品语义表：不设 merges / allowedMerges（B4 约定，缺省 = 用户合并全禁）
    expect(MED_INS_LIST.layout.merges).toBeUndefined()
    expect(MED_INS_LIST.layout.allowedMerges).toBeUndefined()
  })

  it('表头行槽位化：R1 有槽 id，migrate 的 detail 表头回填不触发，列头文案逐字', () => {
    expect((MED_INS_LIST.layout.slotGrid ?? [])[1]).toEqual(['med.h.company', 'med.h.product'])
    expect(MED_INS_LIST.slots['med.h.company']).toBe('保险公司')
    expect(MED_INS_LIST.slots['med.h.product']).toBe('产品名称')
    const m = migrateInstance(cloneInstance(MED_INS_LIST), listPresetTemplates())
    expect(m.ok).toBe(true)
    if (!m.ok) return
    // 回填触发会把 R1 改写为 head.c0..「项目/说明/备注」；本表 R1 有槽 id，天然规避
    expect(m.value.layout.slotGrid?.[1]).toEqual(['med.h.company', 'med.h.product'])
    expect(m.value.slots['head.c0']).toBeUndefined()
  })

  it('15 行公司/产品逐字（A3-2 转写），槽位与 slotGrid 数据行一一对应', () => {
    const grid = MED_INS_LIST.layout.slotGrid ?? []
    expect(grid.length - 2).toBe(LIST_ROWS.length)
    LIST_ROWS.forEach(([company, product], i) => {
      const r = i + 2
      expect(MED_INS_LIST.slots[`med.r${r}.company`]).toBe(company)
      expect(MED_INS_LIST.slots[`med.r${r}.product`]).toBe(product)
      expect(grid[r]).toEqual([`med.r${r}.company`, `med.r${r}.product`])
    })
  })

  it('区块带约定：仅 footerSlot(16)（accept 仅 emphFooter、rowHint after-16），无 leftTag、无重复 id、不发区块实例', () => {
    const blockSlots = MED_INS_LIST.layout.blockSlots
    expect(blockSlots.map((s) => s.id)).toEqual(['footer-1'])
    const footer = blockSlots.find((s) => s.region === 'footer')
    expect(footer).toBeDefined()
    expect(footer!.accept).toEqual(['emphFooter'])
    expect(footer!.rowHint).toBe('after-16')
    expect(blockSlots.filter((s) => s.region === 'left-tag')).toHaveLength(0)
    // 不发 footer 区块实例：空置不占行（toOption 空槽不渲染）
    expect(MED_INS_LIST.blocks).toEqual([])
  })

  it('toOption 关键断言：标题满宽渲染（detail 无角格硬编码）、表头/数据文本、角色与斑马、合并区', () => {
    const opt = toOption(cloneInstance(MED_INS_LIST), { mode: 'preview' })
    const pt = opt.__pt as {
      metas: Array<Array<{ text: string; role: string }>>
      merges: Array<{ start: [number, number]; end: [number, number] }>
    }
    // 无区块实例 → 可视行 = 17 逻辑行
    expect(pt.metas).toHaveLength(17)
    // detail 类不做 compare 角格硬编码：R0 渲染标题本身
    expect(pt.metas[0]![0]!.text).toBe('2026最新15款百万医疗险热门清单')
    expect(pt.metas[0]![0]!.text).not.toBe('项目')
    expect(pt.metas[1]![0]!.text).toBe('保险公司')
    expect(pt.metas[1]![1]!.text).toBe('产品名称')
    expect(pt.metas[2]![0]!.text).toBe('太平洋健康险')
    expect(pt.metas[16]![0]!.text).toBe('中国人寿财险')
    expect(pt.metas[16]![1]!.text).toBe('惠享保（免健告）')
    // 角色：R0/R1 表头；数据首列 c===0 自动 label（白底加粗近似）；次列 body
    expect(pt.metas[0]![0]!.role).toBe('header')
    expect(pt.metas[1]![0]!.role).toBe('header')
    expect(pt.metas[2]![0]!.role).toBe('label')
    expect(pt.metas[2]![1]!.role).toBe('body')
    // 合并区进渲染链（merges = merges + structuralMerges，toOption.ts:301）
    expect(pt.merges).toContainEqual({ start: [0, 0], end: [0, 1] })
    // 合并影子格（覆盖格）取锚点文本，range 为 [0,0]-[0,1]
    // customMergeCell 实参序为 (col, row)（toOption.ts 定义处），影子格 = R0 的 C1 覆盖格
    const mergeAt = opt.customMergeCell as (
      col: number,
      row: number,
    ) => {
      text: string
      range: { start: { col: number; row: number }; end: { col: number; row: number } }
    } | undefined
    expect(mergeAt(1, 0)?.text).toBe('2026最新15款百万医疗险热门清单')
    expect(mergeAt(1, 0)?.range).toEqual({ start: { col: 0, row: 0 }, end: { col: 1, row: 0 } })
    // 样式链：首列 label 加粗（label 角色 fontWeight 600）；斑马奇偶数据行底色交替
    //（只断言差异与存在，不硬编码色值字面量）
    const cols = opt.columns as Array<{
      style: (args: { row: number; col: number }) => Record<string, unknown>
    }>
    expect(cols[0]!.style({ row: 2, col: 0 }).fontWeight).toBe(600)
    const evenBg = cols[1]!.style({ row: 2, col: 1 }).bgColor
    const oddBg = cols[1]!.style({ row: 3, col: 1 }).bgColor
    expect(typeof evenBg).toBe('string')
    expect(typeof oddBg).toBe('string')
    expect(oddBg).not.toBe(evenBg)
    // VTable 喂数：首条数据记录逐字
    const records = opt.records as Array<Record<string, string>>
    expect(records[2]).toEqual({ c0: '太平洋健康险', c1: '蓝医保（好医好药0免赔）' })
  })

  it('HTML 导出可达：caption 取标题槽，表头与数据文案逐字入表', () => {
    const r = exportHtml(cloneInstance(MED_INS_LIST))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toContain('2026最新15款百万医疗险热门清单')
    expect(r.value).toContain('<table')
    expect(r.value).toContain('保险公司')
    expect(r.value).toContain('产品名称')
    expect(r.value).toContain('好医保长期医疗险（旗舰版2026）')
    expect(r.value).toContain('众民保·百万医疗险2026')
    expect(r.value).toContain('惠享保（免健告）')
  })
})
