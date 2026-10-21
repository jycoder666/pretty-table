import { describe, expect, it } from 'vitest'
import {
  applyStructuralIntent,
  canAddCol,
  canAddRow,
  hasContentInCol,
  hasContentInRow,
  type StructuralIntent,
} from './structure'
import { applyEditIntent } from './intent'
import { LIMITS } from '../theme/layoutScales'
import { BLANK_V1, COMPARE_ALPHA_V1, cloneInstance } from '../index'
import type { TemplateInstance } from '../types'

function blank(): TemplateInstance {
  return cloneInstance(BLANK_V1)
}

function run(inst: TemplateInstance, intent: StructuralIntent) {
  return applyStructuralIntent(inst, intent)
}

function custom5x4(): TemplateInstance {
  // 5 行 3 列单层表头：便于精确断言 remap
  return {
    schemaVersion: '1.2',
    templateId: 'spec-5x4',
    themeId: 'T-A',
    slots: { a: 'A0', b: '', c: '', d: '', e: 'E', f: '', g: '', h: '', i: '' },
    blocks: [],
    layout: {
      rowCount: 3,
      colCount: 3,
      headerLevels: 1,
      blockSlots: [],
      slotGrid: [
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
        ['g', 'h', 'i'],
      ],
    },
  } as TemplateInstance
}

describe('structure · addRow', () => {
  it('缺省插到最后：新行全部为可写槽位（空值 + text def），rowCount+1', () => {
    const r = run(blank(), { kind: 'addRow' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.rowCount).toBe(6)
    const newRow = (r.value.layout.slotGrid![5] ?? []).filter((x): x is string => !!x)
    expect(newRow).toHaveLength(4)
    for (const id of newRow) {
      expect(r.value.slots[id]).toBe('')
      expect(r.value.slotDefs?.[id]).toEqual({ kind: 'text' })
    }
  })

  it('afterRow 指定插入位：addRow(1) → 新行落在 index 2', () => {
    const r = run(custom5x4(), { kind: 'addRow', afterRow: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const grid = r.value.layout.slotGrid!
    expect(grid[2]!.every((id) => !!id && /^u\d+$/.test(id))).toBe(true)
    expect(grid[2]!.every((id) => !id || !['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].includes(id))).toBe(true)
    expect(grid[1]).toEqual(['d', 'e', 'f'])
    expect(grid[3]).toEqual(['g', 'h', 'i'])
  })

  it('插入点落在 merge 区间内部 → 区间拉长一格；之后平移', () => {
    const inst = custom5x4()
    inst.layout.merges = [
      { start: [1, 0], end: [2, 0] }, // 跨插入位（insertAt=2）
      { start: [2, 1], end: [2, 2] }, // 在插入位之后 → 平移
      { start: [0, 1], end: [0, 2] }, // 之前 → 不动
    ]
    const r = run(inst, { kind: 'addRow', afterRow: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.merges).toContainEqual({ start: [1, 0], end: [3, 0] })
    expect(r.value.layout.merges).toContainEqual({ start: [3, 1], end: [3, 2] })
    expect(r.value.layout.merges).toContainEqual({ start: [0, 1], end: [0, 2] })
  })

  it('rowHint 平移：after-N（N ≥ 插入位）→ N+1；blockSlots 定义同步', () => {
    const inst = custom5x4()
    inst.layout.blockSlots = [
      { id: 'gap1', accept: ['groupHeader'], rowHint: 'after-1' },
      { id: 'gap2', accept: ['groupHeader'], rowHint: 'after-2' },
    ]
    inst.blocks = [{ id: 'b1', type: 'groupHeader', slotId: 'gap2' }]
    const r = run(inst, { kind: 'addRow', afterRow: 1 }) // insertAt=2
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const hints = Object.fromEntries(r.value.layout.blockSlots.map((s) => [s.id, s.rowHint]))
    expect(hints['gap1']).toBe('after-1') // N=1 < 2 → 不动
    expect(hints['gap2']).toBe('after-3') // N=2 ≥ 2 → +1
  })

  it('readonlyCells 行号平移；不插进表头区', () => {
    const inst = custom5x4()
    inst.layout.readonlyCells = [[2, 0]]
    const r = run(inst, { kind: 'addRow', afterRow: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.readonlyCells).toEqual([[3, 0]])
    // 表头 1 层时 afterRow=0 → 钳制到表头之后（index ≥ 1）
    const r2 = run(custom5x4(), { kind: 'addRow', afterRow: 0 })
    expect(r2.ok && r2.value.layout.slotGrid![1]!.every((id) => !!id && /^u\d+$/.test(id))).toBe(true)
  })

  it('u 序号不重用：从实例现有最大 u 序号 +1 续号', () => {
    const inst = custom5x4()
    inst.slots['u10'] = ''
    const r = run(inst, { kind: 'addRow' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const newIds = r.value.layout.slotGrid![3]!
    expect(newIds).toEqual(['u11', 'u12', 'u13'])
  })

  it('可见行数（含区块行）达 20 → LIMIT_ROWS', () => {
    const inst = blank() // 5 逻辑行
    inst.layout.blockSlots = [{ id: 'gap1', accept: ['groupHeader'], rowHint: 'after-1' }]
    inst.blocks = [{ id: 'b1', type: 'groupHeader', slotId: 'gap1' }]
    // visible = 6；加到 20 需 14 行
    let cur = inst
    for (let i = 0; i < 14; i++) {
      const r = run(cur, { kind: 'addRow' })
      expect(r.ok).toBe(true)
      if (r.ok) cur = r.value
    }
    expect(canAddRow(cur)).toBe(false)
    const r = run(cur, { kind: 'addRow' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('LIMIT_ROWS')
  })
})

describe('structure · removeRow（Q-9 策略 A：连带删）', () => {
  it('删非空行：行内槽位与 slotDefs 连带删除', () => {
    const inst = custom5x4() // row1 有 'E'
    const r = run(inst, { kind: 'removeRow', row: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.rowCount).toBe(2)
    expect(r.value.slots['e']).toBeUndefined()
    expect(r.value.slotDefs?.['e']).toBeUndefined()
    expect(r.value.layout.slotGrid).toEqual([
      ['a', 'b', 'c'],
      ['g', 'h', 'i'],
    ])
  })

  it('锚定删行的区块连带删除 + warn STRUCT_LOSS；锚点之后的区块平移', () => {
    const inst = custom5x4()
    inst.layout.blockSlots = [
      { id: 'gap1', accept: ['groupHeader'], rowHint: 'after-1' },
      { id: 'gap2', accept: ['groupHeader'], rowHint: 'after-2' },
    ]
    inst.blocks = [
      { id: 'b1', type: 'groupHeader', slotId: 'gap1' },
      { id: 'b2', type: 'groupHeader', slotId: 'gap2' },
    ]
    const r = run(inst, { kind: 'removeRow', row: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.blocks.map((b) => b.id)).toEqual(['b2'])
    expect(r.value.layout.blockSlots.find((s) => s.id === 'gap2')?.rowHint).toBe('after-1')
    expect(r.warnings?.some((w) => w.code === 'STRUCT_LOSS')).toBe(true)
  })

  it('merges 收缩：跨删行收缩；收缩成单格删除；完全在删行内删除', () => {
    const inst = custom5x4()
    inst.layout.merges = [
      { start: [1, 0], end: [2, 0] }, // 跨删行 1 → [1,0]-[1,0] 单格 → 删
      { start: [0, 1], end: [0, 2] }, // 不相交 → 不动
    ]
    const r = run(inst, { kind: 'removeRow', row: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.merges).toEqual([{ start: [0, 1], end: [0, 2] }])
  })

  it('structuralMerges 被拆没 → warn STRUCT_LOSS', () => {
    const inst = custom5x4()
    inst.layout.headerLevels = 2
    inst.layout.slotGrid = [
      ['h1', 'h2', 'h3'],
      ['d1', 'd2', 'd3'],
      ['a', 'b', 'c'],
    ]
    inst.slots = { h1: 'H1', h2: 'H2', h3: 'H3', d1: '', d2: '', d3: '', a: 'A', b: 'B', c: 'C' }
    inst.layout.structuralMerges = [{ start: [1, 0], end: [2, 0] }]
    const r = run(inst, { kind: 'removeRow', row: 2 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.structuralMerges).toEqual([])
    expect(r.warnings?.some((w) => w.code === 'STRUCT_LOSS')).toBe(true)
  })

  it('表头行不可删（须走 setHeaderLevel 下调）', () => {
    const inst = custom5x4()
    const r = run(inst, { kind: 'removeRow', row: 0 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('TEMPLATE_INVALID')
  })

  it('行号越界 → 拒绝', () => {
    expect(run(custom5x4(), { kind: 'removeRow', row: 5 }).ok).toBe(false)
    expect(run(custom5x4(), { kind: 'removeRow', row: -1 }).ok).toBe(false)
  })
})

describe('structure · addCol / removeCol', () => {
  it('加列：每行插新槽位、colWidths 补 null、colCount+1', () => {
    const inst = custom5x4()
    inst.layout.style = { colWidths: [100, null, null] }
    const r = run(inst, { kind: 'addCol', afterCol: 0 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.colCount).toBe(4)
    expect(r.value.layout.style?.colWidths).toEqual([100, null, null, null])
    expect(r.value.layout.slotGrid![1]!.length).toBe(4)
  })

  it('达 12 列 → LIMIT_COLS', () => {
    const inst = custom5x4()
    inst.layout.colCount = LIMITS.maxCols
    inst.layout.slotGrid = inst.layout.slotGrid!.map((row) => [...row, ...Array(9).fill(null)])
    expect(canAddCol(inst)).toBe(false)
    const r = run(inst, { kind: 'addCol' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('LIMIT_COLS')
  })

  it('删列：列内槽位连带删、colWidths 删位、frozenColCount 联动、区块不联动', () => {
    const inst = custom5x4()
    inst.layout.frozenColCount = 1
    inst.layout.style = { colWidths: [100, 120, 140] }
    inst.layout.blockSlots = [{ id: 'gap1', accept: ['groupHeader'], rowHint: 'after-1' }]
    inst.blocks = [{ id: 'b1', type: 'groupHeader', slotId: 'gap1' }]
    const r = run(inst, { kind: 'removeCol', col: 0 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.colCount).toBe(2)
    expect(r.value.slots['a']).toBeUndefined()
    expect(r.value.layout.frozenColCount).toBe(0)
    expect(r.value.layout.style?.colWidths).toEqual([120, 140])
    expect(r.value.blocks).toHaveLength(1) // 区块行整行，列无关
  })

  it('删非冻结列：frozenColCount 不动', () => {
    const inst = custom5x4()
    inst.layout.frozenColCount = 1
    const r = run(inst, { kind: 'removeCol', col: 2 })
    expect(r.ok && r.value.layout.frozenColCount).toBe(1)
  })
})

describe('structure · setHeaderLevel', () => {
  it('上调 1→2：顶部插表头行、既有内容整体下移、merges 平移', () => {
    const inst = custom5x4()
    inst.layout.merges = [{ start: [0, 1], end: [0, 2] }]
    const r = run(inst, { kind: 'setHeaderLevel', levels: 2 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.headerLevels).toBe(2)
    expect(r.value.layout.rowCount).toBe(4)
    const grid = r.value.layout.slotGrid!
    expect(grid[0]!.every((id) => !!id && /^u\d+$/.test(id) && r.value.slots[id] === '')).toBe(true)
    expect(grid[1]).toEqual(['a', 'b', 'c'])
    expect(r.value.layout.merges).toEqual([{ start: [1, 1], end: [1, 2] }])
  })

  it('上调受 20 行上限钳制 → LIMIT_ROWS', () => {
    const inst = blank()
    let cur = inst
    for (let i = 0; i < 15; i++) {
      const r = run(cur, { kind: 'addRow' })
      if (r.ok) cur = r.value
    }
    expect(cur.layout.rowCount).toBe(20)
    const r = run(cur, { kind: 'setHeaderLevel', levels: 2 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('LIMIT_ROWS')
  })

  it('下调 2→1：空的上层格并入最底层保留表头行（Q-11）', () => {
    const inst: TemplateInstance = {
      schemaVersion: '1.2',
      templateId: 'spec-h',
      themeId: 'T-A',
      slots: { a: '指标', b: '', c: '', d: '分类', e: '', f: '' },
      blocks: [],
      layout: {
        rowCount: 3,
        colCount: 2,
        headerLevels: 2,
        blockSlots: [],
        slotGrid: [
          ['a', 'b'],
          ['c', 'd'],
          ['e', 'f'],
        ],
      },
    }
    const r = run(inst, { kind: 'setHeaderLevel', levels: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.headerLevels).toBe(1)
    expect(r.value.layout.rowCount).toBe(2)
    expect(r.value.slots['b']).toEqual({ text: '分类' }) // d 的内容并入 b
    expect(r.value.slots['c']).toBeUndefined() // 空源行删除
    expect(r.value.layout.slotGrid).toEqual([
      ['a', 'b'],
      ['e', 'f'],
    ])
  })

  it('下调：放不下的格子内容清除 + warn STRUCT_LOSS（N 处计数）', () => {
    const inst: TemplateInstance = {
      schemaVersion: '1.2',
      templateId: 'spec-h2',
      themeId: 'T-A',
      slots: { a: '指标', b: '已占', c: '深1', d: '深2', e: '', f: '' },
      blocks: [],
      layout: {
        rowCount: 4,
        colCount: 2,
        headerLevels: 3,
        blockSlots: [],
        slotGrid: [
          ['a', 'b'],
          ['c', 'd'],
          ['e', 'f'],
          ['g' as string, 'h' as string],
        ],
      },
    }
    inst.slots['g'] = ''
    inst.slots['h'] = ''
    const r = run(inst, { kind: 'setHeaderLevel', levels: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // c='深1' 目标 a 非空 → 放不下；d='深2' 目标 b 非空 → 放不下
    expect(r.warnings?.some((w) => w.code === 'STRUCT_LOSS' && (w.details as { count: number }).count === 2)).toBe(true)
    expect(r.value.layout.headerLevels).toBe(1)
    expect(r.value.layout.rowCount).toBe(2)
  })

  it('下调：mark/num 源按显示文字并入纯文本 + 一次性 warn', () => {
    const inst: TemplateInstance = {
      schemaVersion: '1.2',
      templateId: 'spec-h3',
      themeId: 'T-A',
      slots: { a: '', b: '', c: { mark: 'yes' }, d: '', e: '', f: '' },
      blocks: [],
      layout: {
        rowCount: 3,
        colCount: 2,
        headerLevels: 2,
        blockSlots: [],
        slotGrid: [
          ['a', 'b'],
          ['c', 'd'],
          ['e', 'f'],
        ],
      },
    }
    const r = run(inst, { kind: 'setHeaderLevel', levels: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.slots['a']).toEqual({ text: '支持' }) // MARK_LABEL.yes
    expect(r.warnings?.some((w) => w.code === 'UNKNOWN_FIELD')).toBe(true)
  })

  it('levels 不变 → 原样返回', () => {
    const inst = custom5x4()
    const r = run(inst, { kind: 'setHeaderLevel', levels: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.rowCount).toBe(3)
    expect(r.value.layout.headerLevels).toBe(1)
  })
})

describe('structure · 5×4 全路径（T02 测试要点）', () => {
  it('blank：加 2 行 → 删 1 列 → 表头 1→2 → 合并 → 拆分', () => {
    let cur = blank()
    // 加 2 行
    for (let i = 0; i < 2; i++) {
      const r = run(cur, { kind: 'addRow' })
      expect(r.ok).toBe(true)
      if (r.ok) cur = r.value
    }
    expect(cur.layout.rowCount).toBe(7)
    // 删 1 列（第 0 列，全空）
    const rc = run(cur, { kind: 'removeCol', col: 0 })
    expect(rc.ok).toBe(true)
    if (rc.ok) cur = rc.value
    expect(cur.layout.colCount).toBe(3)
    // 表头 1→2
    const rh = run(cur, { kind: 'setHeaderLevel', levels: 2 })
    expect(rh.ok).toBe(true)
    if (rh.ok) cur = rh.value
    expect(cur.layout.headerLevels).toBe(2)
    // 合并表头 [0,1]-[0,2]（merge/split 走 applyEditIntent，结构意图走 structure）
    const rm = applyEditIntent(cur, { kind: 'merge', range: { start: [0, 1], end: [0, 2] } })
    expect(rm.ok).toBe(true)
    if (rm.ok) cur = rm.value
    expect(cur.layout.merges).toContainEqual({ start: [0, 1], end: [0, 2] })
    // 拆分
    const rs = applyEditIntent(cur, { kind: 'split', range: { start: [0, 1], end: [0, 2] } })
    expect(rs.ok).toBe(true)
    if (rs.ok) cur = rs.value
    expect(cur.layout.merges ?? []).toHaveLength(0)
  })
})

describe('structure · 壳层辅助纯函数（Q-9 确认 / 置灰）', () => {
  it('hasContentInRow：槽位有值或锚定区块 → true', () => {
    const inst = custom5x4()
    expect(hasContentInRow(inst, 0)).toBe(true) // 'A0'
    expect(hasContentInRow(inst, 1)).toBe(true) // 'E'
    expect(hasContentInRow(inst, 2)).toBe(false)
    inst.layout.blockSlots = [{ id: 'gap1', accept: ['groupHeader'], rowHint: 'after-2' }]
    inst.blocks = [{ id: 'b1', type: 'groupHeader', slotId: 'gap1' }]
    expect(hasContentInRow(inst, 2)).toBe(true) // 区块锚定
  })

  it('hasContentInCol：任一行该列有值 → true', () => {
    const inst = custom5x4()
    expect(hasContentInCol(inst, 0)).toBe(true) // a='A0'
    expect(hasContentInCol(inst, 1)).toBe(true) // e='E'
    expect(hasContentInCol(inst, 2)).toBe(false) // c/f/i 全空
  })

  it('canAddRow / canAddCol：达上限 false', () => {
    expect(canAddRow(blank())).toBe(true)
    expect(canAddCol(blank())).toBe(true)
    const full = blank()
    full.layout.colCount = LIMITS.maxCols
    expect(canAddCol(full)).toBe(false)
  })

  it('无 slotGrid 的实例不支持结构编辑', () => {
    const inst = custom5x4()
    delete (inst.layout as { slotGrid?: unknown }).slotGrid
    expect(run(inst, { kind: 'addRow' }).ok).toBe(false)
    expect(canAddRow(inst)).toBe(false)
  })
})

describe('structure · compare-alpha-v1 回归（预置模板结构可编辑）', () => {
  it('删非表头行成功且结构合并区收缩有 warn', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    // structuralMerges [0,0]-[1,0] 不动（删行 3）；merges [0,1]-[0,2] 不动
    const r = run(inst, { kind: 'removeRow', row: 3 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.rowCount).toBe(9)
    expect(r.value.layout.structuralMerges).toContainEqual({ start: [0, 0], end: [1, 0] })
  })
})

// ── 交互升级 T02：left-N 锚点联动 + 大矩形 remap 回归（R-2 / R-4）──

function withLeftTag(): TemplateInstance {
  const inst = custom5x4()
  inst.layout.blockSlots = [
    { id: 'left-1', accept: ['leftTag'], region: 'left-tag', rowHint: 'left-1' },
    { id: 'left-2', accept: ['leftTag'], region: 'left-tag', rowHint: 'left-2' },
    { id: 'footer-1', accept: ['emphFooter'], region: 'footer', rowHint: 'after-2' },
  ]
  inst.blocks = [
    { id: 'tag-1', type: 'leftTag', slotId: 'left-1', props: { text: '标签一' } },
    { id: 'foot-1', type: 'emphFooter', slotId: 'footer-1', props: { text: '注脚' } },
  ]
  return inst
}

describe('structure · left-N 锚点（R-4 leftTag 联动）', () => {
  it('addRow：left-N（N ≥ 插入位）→ N+1，形式保持 left-；footer after-N 同步平移', () => {
    const r = run(withLeftTag(), { kind: 'addRow', afterRow: 0 }) // insertAt=1
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const hints = Object.fromEntries(r.value.layout.blockSlots.map((s) => [s.id, s.rowHint]))
    expect(hints['left-1']).toBe('left-2')
    expect(hints['left-2']).toBe('left-3')
    expect(hints['footer-1']).toBe('after-3')
  })

  it('removeRow：锚定行的 leftTag 区块连带删除 + warn STRUCT_LOSS', () => {
    const r = run(withLeftTag(), { kind: 'removeRow', row: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.blocks.some((b) => b.id === 'tag-2')).toBe(false)
    expect(r.value.blocks.some((b) => b.id === 'tag-1')).toBe(false)
    expect(r.value.blocks.some((b) => b.id === 'foot-1')).toBe(true)
    expect(r.warnings?.some((w) => w.code === 'STRUCT_LOSS' && w.details && (w.details as { category?: string }).category === 'block')).toBe(true)
  })

  it('removeRow：left-N > 删行 → N−1；N < 删行不动', () => {
    const r = run(withLeftTag(), { kind: 'removeRow', row: 2 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const hints = Object.fromEntries(r.value.layout.blockSlots.map((s) => [s.id, s.rowHint]))
    expect(hints['left-1']).toBe('left-1')
    expect(hints['left-2']).toBe('left-2')
    expect(hints['footer-1']).toBe('after-2')
    expect(r.value.blocks.some((b) => b.id === 'tag-1')).toBe(true)
  })

  it('hasContentInRow 识别 left-N 锚定区块（删行确认语义一致）', () => {
    expect(hasContentInRow(withLeftTag(), 2)).toBe(true) // footer after-2 锚定
  })
})

describe('structure · 大矩形 merges 收缩回归（R-2，实现零改动证明）', () => {
  function rectInst(): TemplateInstance {
    const inst = custom5x4()
    inst.layout.merges = [{ start: [1, 0], end: [2, 2] }] // 2×3 大矩形
    return inst
  }

  it('2×3 删一行 → 1×3（沿删轴收缩）', () => {
    const r = run(rectInst(), { kind: 'removeRow', row: 2 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.merges).toContainEqual({ start: [1, 0], end: [1, 2] })
  })

  it('1×3 再删一列 → 1×2', () => {
    let inst = rectInst()
    let r = run(inst, { kind: 'removeRow', row: 2 })
    expect(r.ok).toBe(true)
    inst = r.ok ? r.value : inst
    r = run(inst, { kind: 'removeCol', col: 2 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.merges).toContainEqual({ start: [1, 0], end: [1, 1] })
  })

  it('大矩形完全在删行内 → 连带移除', () => {
    const inst = rectInst()
    inst.layout.merges = [{ start: [2, 0], end: [2, 2] }]
    const r = run(inst, { kind: 'removeRow', row: 2 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.merges).toHaveLength(0)
  })
})
