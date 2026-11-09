import { describe, expect, it } from 'vitest'
import { PRODUCT_CATALOG } from './product-catalog'
import { listPresetTemplates } from './index'
import { validateInstance, cloneInstance } from '../schema/validate'
import { migrateInstance, SCHEMA_VERSION_CURRENT } from '../schema/migrate'
import { visibleRowCount } from '../theme/layoutScales'
import { toOption } from '../adapter/toOption'
import { exportHtml } from '../export/html'

// ── 保险模板套件 need_03 · product-catalog 六大险种产品精选（增量设计 A3-4 / TP04）──
// 文案权威 = 设计文档 A3-4 转写，逐字断言；库内注册（index.ts / templates.spec.ts 登记）
// 由集成任务 TP09 收口，本 spec 直连模板常量、不依赖注册时序。

/** 逐字底稿：6 分区 × 8 款（序号 / 承保公司 / 产品名称），startRow = 区块首逻辑行 */
const REGIONS: Array<{
  prefix: string
  startRow: number
  col: number
  rows: Array<[string, string, string]>
}> = [
  {
    prefix: 'ci',
    startRow: 2,
    col: 0,
    rows: [
      ['1', '复星联合健康', '达尔文12号、完美人生8号、医联联盟'],
      ['2', '海保人寿', '超级玛丽17号、哪吒2号'],
      ['3', '君龙人寿', '超级玛丽16号Pro'],
      ['4', '瑞华保险', '吉瑞保5.0、华佗1号（康泰版）'],
      ['5', '信泰人寿', '及时雨2026重大疾病保险'],
      ['6', '太平保险', '金生无忧2025、阿基米德2025'],
      ['7', '太平保险', '安佑倍全、守卫百分百26'],
      ['8', '新华保险', '健康多倍保庆典版'],
    ],
  },
  {
    prefix: 'md',
    startRow: 2,
    col: 3,
    rows: [
      ['1', '中国人保健康', '好医保长期医疗旗舰2026'],
      ['2', '太平洋健康', '蓝医保（好医好药版）'],
      ['3', '复星联合健康', '星相守2号、超越保0免赔、医联联盟'],
      ['4', '中国人保健康', '金医保3号、金医保少儿中高端'],
      ['5', '中国平安', '悦享逸家百万医疗险、平安e生保'],
      ['6', '中国人寿', '如意康悦享百万医疗险、组合保'],
      ['7', '中国人保', '康享版8号、人保康端医疗'],
      ['8', '众安在线财险', '尊享e生2026'],
    ],
  },
  {
    prefix: 'ac',
    startRow: 2,
    col: 6,
    rows: [
      ['1', '人保财险', '大护甲9号（旗舰版）'],
      ['2', '太平保险', '小金砖6号、青龙卫焕新版、孝心安6号'],
      ['3', '平安财险', '金钟罩3号、小顽童6号、小蜜蜂5号'],
      ['4', '众安保险', '金钟罩综合意外5.0、百万综合意外'],
      ['5', '华泰保险', '天天中老年人意外险'],
      ['6', '平安财险', '适意江湖少儿1号、1~5类职业意外险'],
      ['7', '众安保险', '小侠大保、小神童无忧1~6类职业'],
      ['8', '平安财险', '熊孩子险、小神童7号、幸福融2号'],
    ],
  },
  {
    prefix: 'tl',
    startRow: 10,
    col: 0,
    rows: [
      ['1', '中意人寿', '擎天柱12号——一生中高版'],
      ['2', '和泰人寿', '擎天柱12号挚爱一生版'],
      ['3', '华贵人寿', '大麦2026款'],
      ['4', '华贵人寿', '大麦甜蜜家2026款'],
      ['5', '华贵人寿', '大麦守护保2026'],
      ['6', '国富人寿', '定海神尺8号'],
      ['7', '中信保诚', '定海神针享享版'],
      ['8', '华贵人寿', '大麦旗舰版A款'],
    ],
  },
  {
    prefix: 'pa',
    startRow: 10,
    col: 3,
    rows: [
      ['1', '复星保德信', '星海赢家青鸾版、火凤凰'],
      ['2', '招商仁和', '和享年年5.0、恒爱嘉懿守护版'],
      ['3', '君龙人寿', '龙抬头5.0养老金'],
      ['4', '安联人寿', '安享至尊C（II）、安享丰盈C'],
      ['5', '华泰人寿', '乐享金生养老年金'],
      ['6', '大家养老', '大富之家（养鑫版）、大盈之家'],
      ['7', '中荷人寿', '金生有约2.0养老金'],
      ['8', '光大永明', '光明慧选（庆典版）'],
    ],
  },
  {
    prefix: 'iwl',
    startRow: 10,
    col: 6,
    rows: [
      ['1', '中英人寿', '福满佳C款、福满盈盛世'],
      ['2', '中意人寿', '一生中意（盛世版）、一生中意（辉煌版）'],
      ['3', '陆家嘴国泰', '泰嘉颖2026'],
      ['4', '复星保德信', '星福家天马版、星福家朱雀版'],
      ['5', '华贵人寿', '华贵金山升（2026）'],
      ['6', '新华人寿', '荣耀多10号、宏世世家悦悦、E增值'],
      ['7', '恒安标准人寿', '传世瑶益B款'],
      ['8', '太平人寿', '福临ace2025B款'],
    ],
  },
]

const BAND1_TEXT = '重疾险 32款 · 百万医疗险 31款 · 意外险 34款'
const BAND2_TEXT = '定期寿险 24款 · 养老年金险 45款 · 增额终身寿险 42款'
const TITLE_TEXT = '六大险种在售产品精选'

describe('product-catalog 六大险种产品精选（保险模板套件 need_03 · TP04）', () => {
  it('validate / migrate 通过，schemaVersion 1.2，templateType detail；detail 旧表头回填不触发', () => {
    expect(PRODUCT_CATALOG.templateId).toBe('product-catalog')
    const v = validateInstance(cloneInstance(PRODUCT_CATALOG))
    expect(v.ok).toBe(true)
    expect(v.ok ? v.value.schemaVersion : undefined).toBe('1.2')
    expect(v.ok ? v.value.meta?.templateType : undefined).toBe('detail')
    expect(PRODUCT_CATALOG.meta?.displayName).toBe('六大险种产品精选')
    // 原大标题不入表 → description 承载（A3-4 转写 / B5-5 全体系口径，critical-list-50 同型先例）
    expect(PRODUCT_CATALOG.meta?.description).toBe('2026六大险种在售产品大全·共208款')
    const m = migrateInstance(cloneInstance(PRODUCT_CATALOG), listPresetTemplates())
    expect(m.ok).toBe(true)
    expect(m.ok ? m.value.schemaVersion : undefined).toBe(SCHEMA_VERSION_CURRENT)
    expect(m.ok ? m.value.meta?.templateType : undefined).toBe('detail')
    // detail 旧文档表头第二行回填（migrate.ts）不触发：R1 带1 行有槽 id，不补 head.c*
    expect(m.ok ? m.value.layout.slotGrid?.[1]?.[0] : undefined).toBe('catalog.band1')
    expect(m.ok ? m.value.slots['head.c0'] : undefined).toBeUndefined()
  })

  it('结构合法：18 逻辑行 × 9 列、可见行 19（带2 区块行 after-9 占 1）；格内引用无悬空槽位', () => {
    const grid = PRODUCT_CATALOG.layout.slotGrid ?? []
    expect(grid).toHaveLength(18)
    for (const row of grid) expect(row).toHaveLength(9)
    expect(PRODUCT_CATALOG.layout.rowCount).toBe(18)
    expect(PRODUCT_CATALOG.layout.colCount).toBe(9)
    expect(PRODUCT_CATALOG.layout.headerLevels).toBe(2)
    // 可见行 = 18 逻辑 + 1 已占用 between-rows 锚点（layoutScales.visibleRowCount 口径）
    expect(visibleRowCount(PRODUCT_CATALOG)).toBe(19)
    // gridSlotIds 无悬空：格内引用的槽 id 都有槽值
    const ids = new Set(grid.flat().filter((x): x is string => !!x))
    expect(ids.size).toBe(146)
    for (const sid of ids) expect(PRODUCT_CATALOG.slots[sid]).toBeDefined()
    // 全纯文本槽（A3-4 无 defs 面）：slotDefs 空且键都有槽值
    expect(Object.keys(PRODUCT_CATALOG.slotDefs ?? {})).toHaveLength(0)
    for (const sid of Object.keys(PRODUCT_CATALOG.slotDefs ?? {})) {
      expect(PRODUCT_CATALOG.slots[sid]).toBeDefined()
    }
    expect(Object.keys(PRODUCT_CATALOG.slots)).toHaveLength(146)
    // 列宽 [64,136,188]×3（A3-4 建议值，经 validate 钳制带内）
    expect(PRODUCT_CATALOG.layout.style?.colWidths).toEqual([
      64, 136, 188, 64, 136, 188, 64, 136, 188,
    ])
  })

  it('标题与带1：captionSlot 指向 + 2 条满宽锁定合并；带2 sectionBar 文案逐字', () => {
    const grid = PRODUCT_CATALOG.layout.slotGrid ?? []
    expect(PRODUCT_CATALOG.layout.captionSlot).toBe('catalog.title')
    expect(PRODUCT_CATALOG.slots['catalog.title']).toBe(TITLE_TEXT)
    expect((grid[0] ?? []).every((id) => id === 'catalog.title')).toBe(true)
    expect(PRODUCT_CATALOG.slots['catalog.band1']).toBe(BAND1_TEXT)
    expect((grid[1] ?? []).every((id) => id === 'catalog.band1')).toBe(true)
    // structuralMerges 2 条（标题 + 带1），骨架锁定
    expect(PRODUCT_CATALOG.layout.structuralMerges).toEqual([
      { start: [0, 0], end: [0, 8] },
      { start: [1, 0], end: [1, 8] },
    ])
    // 不设 merges / allowedMerges（B4 约定：8 张全不设，骨架合并全放 structuralMerges，
    // 缺省 = 用户合并全禁，mergeGuard inside 恒 false）
    expect(PRODUCT_CATALOG.layout.merges).toBeUndefined()
    expect(PRODUCT_CATALOG.layout.allowedMerges).toBeUndefined()
    // 带2 = 区块行 after-9（sectionBar），label 逐字
    expect(PRODUCT_CATALOG.blocks).toHaveLength(1)
    const band2 = PRODUCT_CATALOG.blocks[0]!
    expect(band2.type).toBe('sectionBar')
    expect(band2.slotId).toBe('gap-band2')
    expect(band2.props?.label).toBe(BAND2_TEXT)
    const def = PRODUCT_CATALOG.layout.blockSlots.find((s) => s.id === 'gap-band2')
    expect(def!.accept).toEqual(['sectionBar', 'groupHeader'])
    expect(def!.region).toBe('between-rows')
    expect(def!.rowHint).toBe('after-9')
    // blockSlots：带2 槽 + footer 槽（不发 footer 区块实例，空置不占行）
    expect(PRODUCT_CATALOG.layout.blockSlots.map((s) => s.id)).toEqual(['gap-band2', 'footer-1'])
    const footer = PRODUCT_CATALOG.layout.blockSlots.find((s) => s.region === 'footer')
    expect(footer!.accept).toEqual(['emphFooter'])
    expect(footer!.rowHint).toBe('after-17')
    // 不配 leftTag 槽（A2-①：首列为数据列，leftTag 会遮蔽槽值）
    expect(PRODUCT_CATALOG.layout.blockSlots.filter((s) => s.region === 'left-tag')).toHaveLength(0)
    // blockSlots 无重复 id
    const slotIds = PRODUCT_CATALOG.layout.blockSlots.map((s) => s.id)
    expect(new Set(slotIds).size).toBe(slotIds.length)
  })

  it('6 区 × 8 款 = 48 款文案逐字；槽位接线（序号/承保公司/产品名称 × 3 区并排）双断言', () => {
    const grid = PRODUCT_CATALOG.layout.slotGrid ?? []
    const cellAt = (r: number, c: number): string => grid[r]?.[c] ?? ''
    for (const region of REGIONS) {
      region.rows.forEach(([no, co, prod], i) => {
        const r = region.startRow + i
        const n = i + 1
        const cells: Array<[string, string]> = [
          [`${region.prefix}.${n}.no`, no],
          [`${region.prefix}.${n}.co`, co],
          [`${region.prefix}.${n}.prod`, prod],
        ]
        cells.forEach(([sid, expected], suffix) => {
          // 接线：格内引用指向正确槽位（no/co/prod 三列并排）
          expect(cellAt(r, region.col + suffix)).toBe(sid)
          // 内容：槽值与 A3-4 转写逐字一致
          expect(PRODUCT_CATALOG.slots[sid]).toBe(expected)
        })
      })
    }
    // 数据槽共 144（48 款 × 3 列），加标题/带1 共 146
    const dataIds = new Set(
      (grid.flat().filter((x): x is string => !!x) as string[]).filter(
        (id) => id !== 'catalog.title' && id !== 'catalog.band1',
      ),
    )
    expect(dataIds.size).toBe(144)
  })

  it('toOption 关键断言：可见 19 行（带2 区块行 after-9 → 视觉行 10）、表头/区块角色、3 条渲染合并', () => {
    const opt = toOption(cloneInstance(PRODUCT_CATALOG), { mode: 'preview' })
    const pt = opt.__pt as {
      metas: Array<
        Array<{
          text: string
          role: string
          slotId: string | null
          blockType?: string
          isPlaceholder?: boolean
        }>
      >
      merges: Array<{ start: number[]; end: number[] }>
      blockRowIndexes: Record<string, string>
    }
    // 可见行 = 18 逻辑 + 1 区块行（after-9 占 1；footer 槽空置不占行，TP04 验收②）
    expect(pt.metas).toHaveLength(19)
    // R0 标题 / R1 带1 = header 角色（带1 header 行近似，A2-⑤；detail 类无 compare 角格硬编码）
    expect(pt.metas[0]![0]!.text).toBe(TITLE_TEXT)
    expect(pt.metas[0]![0]!.role).toBe('header')
    expect(pt.metas[1]![0]!.text).toBe(BAND1_TEXT)
    expect(pt.metas[1]![0]!.role).toBe('header')
    // 数据区首列 label（c===0 自动 label，白底加粗近似）、承保公司列 body
    expect(pt.metas[2]![0]!.role).toBe('label')
    expect(pt.metas[2]![0]!.text).toBe('1')
    expect(pt.metas[2]![1]!.role).toBe('body')
    expect(pt.metas[2]![1]!.text).toBe('复星联合健康')
    // 带2 区块行：after-9 → 视觉行 10（R9 之后、R10 之前），sectionBar label 逐字、整行占位
    expect(pt.metas[10]![0]!.role).toBe('block')
    expect(pt.metas[10]![0]!.blockType).toBe('sectionBar')
    expect(pt.metas[10]![0]!.text).toBe(BAND2_TEXT)
    expect(pt.metas[10]!.every((c) => c.slotId === null || c.slotId === 'gap-band2')).toBe(true)
    expect(pt.blockRowIndexes).toEqual({ '10': 'gap-band2' })
    // R10 数据在视觉行 11（区块行偏移 +1）：C0=tl 序号、C3=pa 序号、C4=pa 承保公司；末行末列 = iwl.8.prod
    expect(pt.metas[11]![0]!.text).toBe('1')
    expect(pt.metas[11]![3]!.text).toBe('1')
    expect(pt.metas[11]![4]!.text).toBe('复星保德信')
    expect(pt.metas[18]![8]!.text).toBe('福临ace2025B款')
    // 渲染合并 = structural 2 条满宽（映射后不变，均在 after-9 之前）+ 区块行整行 merge
    expect(pt.merges).toEqual([
      { start: [0, 0], end: [0, 8] },
      { start: [1, 0], end: [1, 8] },
      { start: [10, 0], end: [10, 8] },
    ])
    // 合并影子格取锚点文本：标题行 / 带2 区块行
    const mergeAt = opt.customMergeCell as (
      col: number,
      row: number,
    ) => {
      text: string
      range: { start: { col: number; row: number }; end: { col: number; row: number } }
    } | undefined
    expect(mergeAt(4, 0)?.text).toBe(TITLE_TEXT)
    expect(mergeAt(3, 10)?.text).toBe(BAND2_TEXT)
    // VTable 喂数：19 条记录；标题/带2/上下两半数据行抽查
    const records = opt.records as Array<Record<string, string>>
    expect(records).toHaveLength(19)
    expect(records[0]!.c0).toBe(TITLE_TEXT)
    expect(records[9]!.c8).toBe('熊孩子险、小神童7号、幸福融2号')
    expect(records[10]!.c0).toBe(BAND2_TEXT)
    expect(records[11]!.c1).toBe('中意人寿')
    expect(records[18]!.c8).toBe('福临ace2025B款')
  })

  it('导出 HTML：标题 / 带1 / 带2 与产品文案可达', () => {
    const r = exportHtml(cloneInstance(PRODUCT_CATALOG))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toContain(TITLE_TEXT)
    expect(r.value).toContain(BAND1_TEXT)
    expect(r.value).toContain(BAND2_TEXT)
    expect(r.value).toContain('达尔文12号、完美人生8号、医联联盟')
    expect(r.value).toContain('定海神尺8号')
    expect(r.value).toContain('光明慧选（庆典版）')
  })
})
