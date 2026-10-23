import { describe, expect, it } from 'vitest'
import {
  applyStructuralIntent,
  canAddCol,
  canAddRow,
  hasContentInCol,
  hasContentInRow,
  previewStructuralImpact,
  type StructuralIntent,
} from './structure'
import { moveGate, doMoveCol, doMoveRow } from './moveOps'
import { applyEditIntent } from './intent'
import { LIMITS, STRUCTURE_MIN_COLS, STRUCTURE_MIN_ROWS } from '../theme/layoutScales'
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

// ── WP4：整行/整列换位（内容随行走；结构约束挡住时给白话原因）──

/** 带列宽/推荐列/只读格/区块锚点的 3×3 实例，用于换位 remap 全断言（默认不冻结列） */
function movable3x3(): TemplateInstance {
  const inst = custom5x4()
  inst.layout.headerLevels = 1
  inst.layout.frozenColCount = 0
  inst.layout.readonlyCells = [[1, 2]]
  inst.layout.recommendableCols = [1, 2]
  inst.highlight = { recommendCol: 2 }
  inst.layout.style = { colWidths: [100, 200, 300] }
  inst.layout.blockSlots = [{ id: 'gap-1', accept: ['sectionBar'], rowHint: 'after-1' }]
  inst.blocks = [{ id: 'bar-1', type: 'sectionBar', slotId: 'gap-1', props: {} }]
  return inst
}

describe('structure · moveRow（WP4 整行换位）', () => {
  it('内容随行走：槽位行置换，其它行按序让位', () => {
    const r = run(movable3x3(), { kind: 'moveRow', from: 2, to: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.slotGrid).toEqual([
      ['a', 'b', 'c'],
      ['g', 'h', 'i'],
      ['d', 'e', 'f'],
    ])
    // 槽位数据不动（id 跟着行一起走）
    expect(r.value.slots.a).toBe('A0')
    expect(r.value.slots.g).toBe('')
  })

  it('只读格与合并区按置换重映射（内容语义跟着行）', () => {
    const inst = movable3x3()
    inst.layout.merges = [{ start: [1, 1], end: [1, 2] }]
    const r = run(inst, { kind: 'moveRow', from: 2, to: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // 第 2 行挪到 1，原第 1 行落到 2 → 单行合并区与只读格一起下去
    expect(r.value.layout.merges).toEqual([{ start: [2, 1], end: [2, 2] }])
    expect(r.value.layout.readonlyCells).toEqual([[2, 2]])
  })

  it('区块锚点是位置语义：换行不动 rowHint（与加行/删行口径一致）', () => {
    const r = run(movable3x3(), { kind: 'moveRow', from: 1, to: 2 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.blockSlots[0]?.rowHint).toBe('after-1')
    expect(r.value.blocks[0]?.slotId).toBe('gap-1')
  })

  it('表头行不参与换位 → STRUCT_MOVE_BLOCKED', () => {
    const r = run(movable3x3(), { kind: 'moveRow', from: 0, to: 2 })
    expect(!r.ok ? r.error.code : '').toBe('STRUCT_MOVE_BLOCKED')
    expect(!r.ok ? r.error.message : '').toContain('表头')
  })

  it('跨行合并区被抽走一行（碎成不相邻）→ 拒绝而不是悄悄拆开', () => {
    const inst = movable3x3()
    // 合并区只占 0..1 行：把第 1 行抽到第 2 行 → 影像 {0,2} 不相邻
    inst.layout.merges = [{ start: [0, 1], end: [1, 1] }]
    const r = run(inst, { kind: 'moveRow', from: 1, to: 2 })
    expect(!r.ok ? r.error.code : '').toBe('STRUCT_MOVE_BLOCKED')
    expect(!r.ok ? r.error.message : '').toContain('合并区')
  })

  it('合并区内部的换位（整体仍在区间内）→ 允许', () => {
    const inst = movable3x3()
    inst.layout.merges = [{ start: [0, 1], end: [2, 1] }]
    const r = run(inst, { kind: 'moveRow', from: 1, to: 2 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.merges).toEqual([{ start: [0, 1], end: [2, 1] }])
  })

  it('跨行合并区整体平移（不交错）→ 允许，端点重新归一化', () => {
    const inst = movable3x3()
    inst.layout.merges = [{ start: [1, 0], end: [2, 2] }]
    const r = run(inst, { kind: 'moveRow', from: 1, to: 2 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.merges).toEqual([{ start: [1, 0], end: [2, 2] }])
  })

  it('from === to → 原样返回（不入栈的空操作由壳层拦）', () => {
    const inst = movable3x3()
    const r = run(inst, { kind: 'moveRow', from: 1, to: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.slotGrid).toEqual(inst.layout.slotGrid)
  })

  it('越界下标 → TEMPLATE_INVALID', () => {
    const r = run(movable3x3(), { kind: 'moveRow', from: 1, to: 9 })
    expect(!r.ok ? r.error.code : '').toBe('TEMPLATE_INVALID')
  })
})

describe('structure · moveCol（WP4 整列换位）', () => {
  it('列内容、列宽、推荐列一起走', () => {
    const r = run(movable3x3(), { kind: 'moveCol', from: 2, to: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.slotGrid).toEqual([
      ['a', 'c', 'b'],
      ['d', 'f', 'e'],
      ['g', 'i', 'h'],
    ])
    expect(r.value.layout.style?.colWidths).toEqual([100, 300, 200])
    expect(r.value.highlight?.recommendCol).toBe(1)
    expect(r.value.layout.recommendableCols).toEqual([2, 1])
  })

  it('只读格与合并区按列置换重映射', () => {
    const inst = movable3x3()
    inst.layout.merges = [{ start: [0, 1], end: [0, 2] }]
    const r = run(inst, { kind: 'moveCol', from: 2, to: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.readonlyCells).toEqual([[1, 1]])
    expect(r.value.layout.merges).toEqual([{ start: [0, 1], end: [0, 2] }])
  })

  it('第一列（标签列）不参与换位 → STRUCT_MOVE_BLOCKED', () => {
    const r = run(movable3x3(), { kind: 'moveCol', from: 1, to: 0 })
    expect(!r.ok ? r.error.code : '').toBe('STRUCT_MOVE_BLOCKED')
    expect(!r.ok ? r.error.message : '').toContain('标签列')
  })

  it('冻结列与普通列不能互串 → STRUCT_MOVE_BLOCKED', () => {
    const inst = movable3x3()
    inst.layout.frozenColCount = 2 // 第 0、1 列冻结
    const r = run(inst, { kind: 'moveCol', from: 1, to: 2 })
    expect(!r.ok ? r.error.code : '').toBe('STRUCT_MOVE_BLOCKED')
    expect(!r.ok ? r.error.message : '').toContain('冻结列')
  })

  it('跨列合并区被抽走一列 → 拒绝；区间内部换位允许', () => {
    const inst = movable3x3()
    inst.layout.merges = [{ start: [0, 0], end: [0, 1] }]
    const r = run(inst, { kind: 'moveCol', from: 2, to: 1 }) // 影像 {0,2} 不相邻
    expect(!r.ok ? r.error.code : '').toBe('STRUCT_MOVE_BLOCKED')
    const inst2 = movable3x3()
    inst2.layout.merges = [{ start: [0, 1], end: [0, 2] }]
    const r2 = run(inst2, { kind: 'moveCol', from: 2, to: 1 })
    expect(r2.ok).toBe(true)
  })

  it('原地不动 → ok（核内纯函数，不改入参）', () => {
    const inst = movable3x3()
    const r = run(inst, { kind: 'moveCol', from: 2, to: 2 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.slotGrid).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      ['g', 'h', 'i'],
    ])
  })
})

describe('intent · moveBlock（WP4 表内区块换位）', () => {
  function withTwoSlots(): TemplateInstance {
    const inst = movable3x3()
    inst.layout.blockSlots = [
      { id: 'gap-1', accept: ['sectionBar'], rowHint: 'after-1' },
      { id: 'gap-2', accept: ['sectionBar'], rowHint: 'after-2' },
    ]
    inst.blocks = [{ id: 'bar-1', type: 'sectionBar', slotId: 'gap-1', props: {} }]
    return inst
  }

  it('目标槽为空 → 移动（一步意图）', () => {
    const r = applyEditIntent(withTwoSlots(), { kind: 'moveBlock', blockId: 'bar-1', toSlotId: 'gap-2' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.blocks[0]?.slotId).toBe('gap-2')
  })

  it('目标槽已占用 → 两区块互换（含 accept 双向校验）', () => {
    const inst = withTwoSlots()
    inst.blocks.push({ id: 'bar-2', type: 'sectionBar', slotId: 'gap-2', props: {} })
    const r = applyEditIntent(inst, { kind: 'moveBlock', blockId: 'bar-1', toSlotId: 'gap-2' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.blocks.find((b) => b.id === 'bar-1')?.slotId).toBe('gap-2')
    expect(r.value.blocks.find((b) => b.id === 'bar-2')?.slotId).toBe('gap-1')
  })

  it('目标槽 accept 不收该类型 → BLOCK_TYPE_REJECT', () => {
    const inst = withTwoSlots()
    inst.layout.blockSlots[1] = { id: 'gap-2', accept: ['groupHeader'], rowHint: 'after-2' }
    const r = applyEditIntent(inst, { kind: 'moveBlock', blockId: 'bar-1', toSlotId: 'gap-2' })
    expect(!r.ok ? r.error.code : '').toBe('BLOCK_TYPE_REJECT')
  })

  it('互换时源槽不收对方类型 → 也拒绝（不留类型不合法的区块）', () => {
    const inst = withTwoSlots()
    inst.blocks.push({ id: 'bar-2', type: 'groupHeader', slotId: 'gap-2', props: {} })
    inst.layout.blockSlots[1] = { id: 'gap-2', accept: ['groupHeader', 'sectionBar'], rowHint: 'after-2' }
    const r = applyEditIntent(inst, { kind: 'moveBlock', blockId: 'bar-1', toSlotId: 'gap-2' })
    expect(!r.ok ? r.error.code : '').toBe('BLOCK_TYPE_REJECT')
    expect(!r.ok ? r.error.message : '').toContain('互换')
  })

  it('区块不存在 / 槽位不存在 → BLOCK_NOT_FOUND / SLOT_DROP_BLOCKED', () => {
    const inst = withTwoSlots()
    const a = applyEditIntent(inst, { kind: 'moveBlock', blockId: 'nope', toSlotId: 'gap-2' })
    expect(!a.ok ? a.error.code : '').toBe('BLOCK_NOT_FOUND')
    const b = applyEditIntent(inst, { kind: 'moveBlock', blockId: 'bar-1', toSlotId: 'nope' })
    expect(!b.ok ? b.error.code : '').toBe('SLOT_DROP_BLOCKED')
  })

  it('原地放下 → 原样返回（壳层不再提示）', () => {
    const inst = withTwoSlots()
    const r = applyEditIntent(inst, { kind: 'moveBlock', blockId: 'bar-1', toSlotId: 'gap-1' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.blocks[0]?.slotId).toBe('gap-1')
  })
})

// ── 增量设计 T01：最低结构守卫 + 影响预检 + 换位闸门 moveGate ──

describe('structure · 最低结构守卫（STRUCTURE_MIN_ROWS/COLS，A3）', () => {
  it('常量口径：2 行（1 表头 + 1 内容）/ 1 列', () => {
    expect(STRUCTURE_MIN_ROWS).toBe(2)
    expect(STRUCTURE_MIN_COLS).toBe(1)
  })

  it('rowCount ≤ 2 时删行 → STRUCTURE_MIN_ROWS 白话 fail', () => {
    const inst = custom5x4()
    const r1 = run(inst, { kind: 'removeRow', row: 2 })
    expect(r1.ok).toBe(true) // 3 行 → 2 行放行
    if (!r1.ok) return
    const r2 = run(r1.value, { kind: 'removeRow', row: 1 })
    expect(r2.ok).toBe(false)
    if (r2.ok) return
    expect(r2.error.code).toBe('STRUCTURE_MIN_ROWS')
    expect(r2.error.message).toBe('至少保留 1 行表头和 1 行内容，不能再删了')
  })

  it('colCount ≤ 1 时删列 → STRUCTURE_MIN_COLS 白话 fail', () => {
    let cur = custom5x4()
    // 3 → 2 → 1 列逐次放行，删到只剩 1 列时拦截
    for (let i = 0; i < 2; i++) {
      const r = run(cur, { kind: 'removeCol', col: 0 })
      expect(r.ok).toBe(true)
      if (r.ok) cur = r.value
    }
    expect(cur.layout.colCount).toBe(1)
    const r2 = run(cur, { kind: 'removeCol', col: 0 })
    expect(r2.ok).toBe(false)
    if (r2.ok) return
    expect(r2.error.code).toBe('STRUCTURE_MIN_COLS')
    expect(r2.error.message).toBe('至少保留 1 列，不能再删了')
  })

  it('表头行拒绝仍优先于最低结构（错误码与文案不变）', () => {
    const inst = custom5x4()
    inst.layout.rowCount = 2
    const r = run(inst, { kind: 'removeRow', row: 0 })
    expect(!r.ok ? r.error.code : '').toBe('TEMPLATE_INVALID')
    expect(!r.ok ? r.error.message : '').toContain('表头行不能直接删除')
  })
})

describe('structure · previewStructuralImpact（A3 影响预检纯函数）', () => {
  it('空行：三计数全 0、无禁用', () => {
    const inst = custom5x4()
    const impact = previewStructuralImpact(inst, 'row', 2)
    expect(impact).toEqual({ filledCellCount: 0, affectedMergeCount: 0, affectedBlockCount: 0 })
  })

  it('含内容行：filledCellCount 只数非空槽位（表头行在预检中先行拦截）', () => {
    const inst = custom5x4()
    // row 1 有 e='E'；row 2 全空
    expect(previewStructuralImpact(inst, 'row', 1).filledCellCount).toBe(1)
    expect(previewStructuralImpact(inst, 'row', 2).filledCellCount).toBe(0)
  })

  it('含区块行：affectedBlockCount 计锚定区块；删列恒为 0', () => {
    const inst = withLeftTag()
    expect(previewStructuralImpact(inst, 'row', 2).affectedBlockCount).toBe(1) // footer after-2
    expect(previewStructuralImpact(inst, 'col', 1).affectedBlockCount).toBe(0)
  })

  it('跨删行合并区：merges ∪ structuralMerges 相交计数；allowedMerges 不计', () => {
    const inst = custom5x4()
    inst.layout.merges = [{ start: [1, 0], end: [2, 0] }]
    inst.layout.structuralMerges = [{ start: [1, 1], end: [2, 1] }]
    inst.layout.allowedMerges = [{ start: [1, 2], end: [2, 2] }]
    const impact = previewStructuralImpact(inst, 'row', 2)
    expect(impact.affectedMergeCount).toBe(2)
  })

  it('不相交的合并区仅平移不计', () => {
    const inst = custom5x4()
    inst.layout.merges = [{ start: [0, 0], end: [0, 1] }]
    expect(previewStructuralImpact(inst, 'row', 2).affectedMergeCount).toBe(0)
  })

  it('表头行 → blockedReason（行轴专属）', () => {
    const impact = previewStructuralImpact(custom5x4(), 'row', 0)
    expect(impact.blockedReason).toBe('表头行不能删除，请下调表头层数')
  })

  it('越界 → blockedReason「这一行/列不存在」', () => {
    expect(previewStructuralImpact(custom5x4(), 'row', 9).blockedReason).toBe('这一行不存在')
    expect(previewStructuralImpact(custom5x4(), 'col', 9).blockedReason).toBe('这一列不存在')
  })

  it('最后一列（colCount ≤ 1）→ blockedReason 最低结构', () => {
    const inst = custom5x4()
    const r1 = run(inst, { kind: 'removeCol', col: 0 })
    const one = r1.ok ? r1.value : inst
    const r2 = run(one, { kind: 'removeCol', col: 0 })
    const single = r2.ok ? r2.value : one
    expect(single.layout.colCount).toBe(1)
    const impact = previewStructuralImpact(single, 'col', 0)
    expect(impact.blockedReason).toBe('至少保留 1 列，不能再删了')
  })

  it('blockedReason 与执行守卫同源：预检允许的删除执行必成功', () => {
    const inst = custom5x4()
    for (let r = 0; r < inst.layout.rowCount; r++) {
      const impact = previewStructuralImpact(inst, 'row', r)
      if (impact.blockedReason) continue
      const out = run(inst, { kind: 'removeRow', row: r })
      expect(out.ok).toBe(true)
      break
    }
  })
})

describe('structure · moveGate（A3 换位预检，与执行口径零变化）', () => {
  it('行轴：表头行拒绝，错误码/文案与 doMoveRow 完全一致', () => {
    const inst = movable3x3()
    const g = moveGate(inst, 0, 0, 2)
    const d = doMoveRow(inst, 0, 2, [])
    expect(!g.ok ? g.error.code : '').toBe('STRUCT_MOVE_BLOCKED')
    expect(!d.ok && !g.ok ? d.error.message === g.error.message : false).toBe(true)
  })

  it('行轴：合并区交错拒绝（survivesPermute 同源）', () => {
    const inst = movable3x3()
    inst.layout.merges = [{ start: [0, 1], end: [1, 1] }]
    const g = moveGate(inst, 0, 1, 2)
    expect(!g.ok ? g.error.code : '').toBe('STRUCT_MOVE_BLOCKED')
    expect(!g.ok ? g.error.message : '').toContain('合并区')
  })

  it('行轴：合法换位 → ok(true)', () => {
    expect(moveGate(movable3x3(), 0, 2, 1).ok).toBe(true)
  })

  it('列轴：标签列拒绝（from 或 to = 0）', () => {
    const inst = movable3x3()
    expect(moveGate(inst, 1, 1, 0).ok).toBe(false)
    expect(moveGate(inst, 1, 0, 2).ok).toBe(false)
  })

  it('列轴：冻结边界拒绝', () => {
    const inst = movable3x3()
    inst.layout.frozenColCount = 2
    const g = moveGate(inst, 1, 1, 2)
    expect(!g.ok ? g.error.code : '').toBe('STRUCT_MOVE_BLOCKED')
    expect(!g.ok ? g.error.message : '').toContain('冻结列')
  })

  it('列轴：越界 → TEMPLATE_INVALID（与 doMoveCol 一致）', () => {
    const g = moveGate(movable3x3(), 1, 1, 9)
    const d = doMoveCol(movable3x3(), 1, 9, [])
    expect(!g.ok ? g.error.code : '').toBe('TEMPLATE_INVALID')
    expect(!d.ok && !g.ok ? d.error.message === g.error.message : false).toBe(true)
  })

  it('列轴：合法换位 → ok(true)', () => {
    expect(moveGate(movable3x3(), 1, 2, 1).ok).toBe(true)
  })
})
