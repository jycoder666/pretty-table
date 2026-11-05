import { describe, expect, it } from 'vitest'
import {
  applyStructuralIntent,
  canAddCol,
  canAddRow,
  hasContentInCol,
  hasContentInRow,
  previewStructuralImpact,
  previewStructuralRange,
  type StructuralIntent,
} from './structure'
import { moveGate, moveBlockGate, doMoveCol, doMoveRow, doMoveBlockRow, doMoveBlockCol } from './moveOps'
import { permuteBlockIndex, permuteIndex, survivesBlockPermute } from './remap'
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
      allowedMerges: [{ start: [0, 0], end: [2, 2] }],
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

// ── 灵活操作升级 T01①：区间影响预检 previewStructuralRange ──

describe('structure · previewStructuralRange（灵活操作 T01① 区间聚合口径）', () => {
  it('filled 求和：区间内各行/列非空槽位相加', () => {
    const inst = block6x4()
    inst.slots['x10'] = 'A'
    inst.slots['x20'] = 'B'
    expect(previewStructuralRange(inst, 'row', 1, 2).filledCellCount).toBe(2)
    expect(previewStructuralRange(inst, 'row', 1, 1).filledCellCount).toBe(1)
    // 列轴（3 列删 2 列合法）：col0 = a('A0') 1 格 + col1 = e('E') 1 格
    expect(previewStructuralRange(custom5x4(), 'col', 0, 1).filledCellCount).toBe(2)
  })

  it('跨区间合并区只计一次：同一合并区跨多行只算一个（不是逐行求和）', () => {
    const inst = block6x4() // 6 行，区间 [1,3] 可删（6−3=3 ≥ 最低结构）
    inst.layout.merges = [{ start: [1, 0], end: [3, 2] }] // 恰好跨满区间
    const impact = previewStructuralRange(inst, 'row', 1, 3)
    expect(impact.blockedReason).toBeUndefined()
    expect(impact.affectedMergeCount).toBe(1)
    // merges ∪ structuralMerges 两个不同区间各计一次
    const two = block6x4()
    two.layout.merges = [{ start: [1, 0], end: [3, 0] }]
    two.layout.structuralMerges = [{ start: [1, 1], end: [2, 1] }]
    expect(previewStructuralRange(two, 'row', 1, 3).affectedMergeCount).toBe(2)
  })

  it('不相交的合并区不计；allowedMerges 是兼容字段不计（与单点版同口径）', () => {
    const inst = block6x4()
    inst.layout.merges = [{ start: [0, 0], end: [0, 1] }] // 表头带状区间，与 [1,3] 不相交
    const impact = previewStructuralRange(inst, 'row', 1, 3)
    expect(impact.blockedReason).toBeUndefined()
    expect(impact.affectedMergeCount).toBe(0)
    const compat = block6x4()
    compat.layout.allowedMerges = [{ start: [1, 0], end: [3, 2] }]
    expect(previewStructuralRange(compat, 'row', 1, 3).affectedMergeCount).toBe(0)
  })

  it('行轴区块锚点计数：锚点落在区间内的已占用区块（left-N / after-N 都算）；列轴恒 0', () => {
    const inst = withLeftTag() // 3 行表只能单行删：tag-1@left-1（行1）、foot-1@after-2（行2）
    expect(previewStructuralRange(inst, 'row', 1, 1).affectedBlockCount).toBe(1)
    expect(previewStructuralRange(inst, 'row', 2, 2).affectedBlockCount).toBe(1)
    // 多锚点同落一个区间：只计区间内的，区间外锚点不计
    const wide = block6x4()
    wide.layout.blockSlots = [
      { id: 'left-a', accept: ['leftTag'], region: 'left-tag', rowHint: 'left-1' },
      { id: 'gap-b', accept: ['groupHeader'], rowHint: 'after-2' },
      { id: 'gap-c', accept: ['groupHeader'], rowHint: 'after-4' },
    ]
    wide.blocks = [
      { id: 'tag-a', type: 'leftTag', slotId: 'left-a', props: {} },
      { id: 'bar-b', type: 'groupHeader', slotId: 'gap-b', props: {} },
    ]
    expect(previewStructuralRange(wide, 'row', 1, 3).affectedBlockCount).toBe(2)
    expect(previewStructuralRange(wide, 'row', 4, 4).affectedBlockCount).toBe(0)
    expect(previewStructuralRange(wide, 'col', 0, 1).affectedBlockCount).toBe(0)
  })

  it('blockedReason 三级顺序：越界 → 含表头行 → 最低结构（与执行守卫同序）', () => {
    const inst = custom5x4() // 3 行 3 列，headerLevels 1
    // 1) 越界最优先
    expect(previewStructuralRange(inst, 'row', 1, 9).blockedReason).toBe('所选的行不存在')
    expect(previewStructuralRange(inst, 'col', 1, 9).blockedReason).toBe('所选的列不存在')
    // 2) 区间含表头行
    expect(previewStructuralRange(inst, 'row', 0, 2).blockedReason).toBe('所选范围含表头行，不能删除')
    // 3) 最低结构：3 行删 2 → 剩 1 < 2
    expect(previewStructuralRange(inst, 'row', 1, 2).blockedReason).toBe('至少保留 1 行表头和 1 行内容，不能再删了')
    // 表头优先于最低结构：2 行表删 [0,1] 两级同时命中 → 报表头
    const r1 = run(inst, { kind: 'removeRow', row: 2 })
    const two = r1.ok ? r1.value : inst
    expect(previewStructuralRange(two, 'row', 0, 1).blockedReason).toBe('所选范围含表头行，不能删除')
    // 列轴无表头检查：3 列删 3 列 → 最低结构
    expect(previewStructuralRange(inst, 'col', 0, 2).blockedReason).toBe('至少保留 1 列，不能再删了')
  })

  it('from > to 内部归一化；blocked 时三计数为 0', () => {
    const inst = blank() // 5 行全空槽
    inst.slots['u9'] = 'X' // index 2 行首格有内容
    expect(previewStructuralRange(inst, 'row', 3, 2)).toEqual(previewStructuralRange(inst, 'row', 2, 3))
    expect(previewStructuralRange(inst, 'row', 3, 2).filledCellCount).toBe(1)
    expect(previewStructuralRange(inst, 'row', 0, 9)).toEqual({
      filledCellCount: 0,
      affectedMergeCount: 0,
      affectedBlockCount: 0,
      blockedReason: '所选的行不存在',
    })
  })

  it('与执行守卫同源：预检允许的区间降序删必成功；预检拦截的执行必失败', () => {
    const inst = blank() // 5 行 1 表头
    expect(previewStructuralRange(inst, 'row', 2, 3).blockedReason).toBeUndefined()
    let cur = inst
    for (let r = 3; r >= 2; r--) {
      const out = run(cur, { kind: 'removeRow', row: r })
      expect(out.ok).toBe(true)
      if (out.ok) cur = out.value
    }
    expect(cur.layout.rowCount).toBe(3)
    expect(previewStructuralRange(inst, 'row', 0, 1).blockedReason).toBe('所选范围含表头行，不能删除')
    expect(run(inst, { kind: 'removeRow', row: 0 }).ok).toBe(false)
  })
})

// ── 灵活操作升级 T01②：整块换位（remap 原语 + gate + 执行全字段联动）──

/** 6 行 4 列单层表头（块移动夹具）：整块置换全字段精确断言 */
function block6x4(): TemplateInstance {
  const grid: string[][] = []
  const slots: Record<string, string> = {}
  for (let r = 0; r < 6; r++) {
    const row: string[] = []
    for (let c = 0; c < 4; c++) {
      const id = `x${r}${c}`
      row.push(id)
      slots[id] = r === 0 ? `H${c}` : ''
    }
    grid.push(row)
  }
  return {
    schemaVersion: '1.2',
    templateId: 'spec-block-6x4',
    themeId: 'T-A',
    slots,
    blocks: [],
    layout: {
      rowCount: 6,
      colCount: 4,
      headerLevels: 1,
      blockSlots: [],
      allowedMerges: [{ start: [0, 0], end: [5, 3] }],
      slotGrid: grid,
    },
  } as TemplateInstance
}

describe('remap · 区块置换原语（灵活操作 T01②：与单元素置换同构）', () => {
  it('permuteBlockIndex：count=1 时与 permuteIndex 逐点一致（上移/下移全覆盖）', () => {
    for (const [from, to] of [
      [0, 4],
      [4, 0],
      [1, 4],
      [4, 1],
      [2, 3],
      [2, 2],
    ] as const) {
      for (let i = 0; i < 6; i++) {
        expect(permuteBlockIndex(i, from, 1, to)).toBe(permuteIndex(i, from, to))
      }
    }
  })

  it('permuteBlockIndex：整块搬移 + gap 让位（与执行 splice(from,count)/splice(to,0) 同式）', () => {
    // 6 个位置，块 [1,3) 搬到 4 → 结果序 [0, 3, 4, 5, 1, 2]
    expect([0, 1, 2, 3, 4, 5].map((i) => permuteBlockIndex(i, 1, 2, 4))).toEqual([0, 4, 5, 1, 2, 3])
  })

  it('permuteBlockIndex：from === to 恒等映射', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => permuteBlockIndex(i, 2, 3, 2))).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('survivesBlockPermute：块内区间安全；跨块边界影像断开', () => {
    expect(survivesBlockPermute(1, 2, 1, 2, 4)).toBe(true) // 恰为块本身
    expect(survivesBlockPermute(3, 4, 1, 2, 4)).toBe(true) // gap 段整体让位仍连续
    expect(survivesBlockPermute(2, 3, 1, 2, 4)).toBe(false) // 跨块下边界
    expect(survivesBlockPermute(0, 1, 1, 2, 4)).toBe(false) // 跨块上边界
  })
})

describe('structure · moveRowBlock（灵活操作 T01② 整块行换位）', () => {
  it('块内合并区随块走：一次置换 slotGrid / 三集合 / readonlyCells 全字段联动', () => {
    const inst = block6x4()
    inst.layout.merges = [{ start: [1, 1], end: [2, 2] }]
    inst.layout.structuralMerges = [{ start: [0, 0], end: [0, 3] }]
    inst.layout.readonlyCells = [
      [1, 0],
      [2, 3],
    ]
    const r = run(inst, { kind: 'moveRowBlock', from: 1, count: 2, to: 4 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.slotGrid).toEqual([
      ['x00', 'x01', 'x02', 'x03'],
      ['x30', 'x31', 'x32', 'x33'],
      ['x40', 'x41', 'x42', 'x43'],
      ['x50', 'x51', 'x52', 'x53'],
      ['x10', 'x11', 'x12', 'x13'],
      ['x20', 'x21', 'x22', 'x23'],
    ])
    expect(r.value.layout.merges).toEqual([{ start: [4, 1], end: [5, 2] }])
    expect(r.value.layout.structuralMerges).toEqual([{ start: [0, 0], end: [0, 3] }])
    expect(r.value.layout.allowedMerges).toEqual([{ start: [0, 0], end: [5, 3] }])
    expect(r.value.layout.readonlyCells).toEqual([
      [4, 0],
      [5, 3],
    ])
    expect(r.value.slots.x10).toBe('')
  })

  it('跨块边界的合并区拦截（STRUCT_MOVE_BLOCKED，区间表述文案）', () => {
    const inst = block6x4()
    inst.layout.merges = [{ start: [2, 1], end: [3, 1] }] // 跨块 [1,2] 下边界
    const r = run(inst, { kind: 'moveRowBlock', from: 1, count: 2, to: 4 })
    expect(!r.ok ? r.error.code : '').toBe('STRUCT_MOVE_BLOCKED')
    expect(!r.ok ? r.error.message : '').toContain('这一段和合并区交错')
  })

  it('跨插入点（gap 段）的合并区拦截', () => {
    const inst = block6x4()
    // 块 [3,4] 上移到 1：合并区 [2,0]-[3,0] 横跨块上边界与插入点
    inst.layout.merges = [{ start: [2, 0], end: [3, 0] }]
    const r = run(inst, { kind: 'moveRowBlock', from: 3, count: 2, to: 1 })
    expect(!r.ok ? r.error.code : '').toBe('STRUCT_MOVE_BLOCKED')
  })

  it('表头行拦截：from 或 to 落在表头区 → 表头白话文案', () => {
    const a = run(block6x4(), { kind: 'moveRowBlock', from: 0, count: 1, to: 2 })
    expect(!a.ok ? a.error.code : '').toBe('STRUCT_MOVE_BLOCKED')
    expect(!a.ok ? a.error.message : '').toContain('表头')
    const b = run(block6x4(), { kind: 'moveRowBlock', from: 2, count: 1, to: 0 })
    expect(!b.ok ? b.error.code : '').toBe('STRUCT_MOVE_BLOCKED')
    expect(!b.ok ? b.error.message : '').toContain('表头')
  })

  it('越界：块出界 → TEMPLATE_INVALID「这一段行不存在」', () => {
    expect(run(block6x4(), { kind: 'moveRowBlock', from: 4, count: 3, to: 0 }).ok).toBe(false)
    const r = run(block6x4(), { kind: 'moveRowBlock', from: 1, count: 2, to: 5 })
    expect(!r.ok ? r.error.code : '').toBe('TEMPLATE_INVALID')
    expect(!r.ok ? r.error.message : '').toBe('这一段行不存在')
  })

  it('from === to → 原样返回（空操作合法）', () => {
    const inst = block6x4()
    const r = run(inst, { kind: 'moveRowBlock', from: 1, count: 2, to: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.slotGrid).toEqual(inst.layout.slotGrid)
  })

  it('区块锚点 rowHint 是位置语义：块移动不动锚点（与单行换位口径一致）', () => {
    const inst = block6x4()
    inst.layout.blockSlots = [{ id: 'gap-1', accept: ['sectionBar'], rowHint: 'after-2' }]
    inst.blocks = [{ id: 'bar-1', type: 'sectionBar', slotId: 'gap-1', props: {} }]
    const r = run(inst, { kind: 'moveRowBlock', from: 3, count: 2, to: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.blockSlots[0]?.rowHint).toBe('after-2')
    expect(r.value.blocks[0]?.slotId).toBe('gap-1')
  })

  it('gate 与执行同源：moveBlockGate 允许的 doMoveBlockRow 必成功', () => {
    const inst = block6x4()
    const g = moveBlockGate(inst, 0, 1, 2, 4)
    const d = doMoveBlockRow(inst, 1, 2, 4, [])
    expect(g.ok).toBe(true)
    expect(d.ok).toBe(true)
    // gate 拦截的执行同样拦截（表头）
    const gb = moveBlockGate(inst, 0, 0, 1, 2)
    const db = doMoveBlockRow(inst, 0, 1, 2, [])
    expect(!gb.ok ? gb.error.code : '').toBe('STRUCT_MOVE_BLOCKED')
    expect(!db.ok && !gb.ok ? db.error.message === gb.error.message : false).toBe(true)
  })
})

describe('structure · moveColBlock（灵活操作 T01② 整块列换位：列宽/推荐列跟随）', () => {
  it('块内合并区随块走 + slotGrid/三集合/readonlyCells/列宽/推荐列全字段联动', () => {
    const inst = block6x4()
    inst.layout.frozenColCount = 0
    inst.layout.merges = [{ start: [1, 1], end: [2, 2] }] // 恰在块 [1,3) 列内
    inst.layout.readonlyCells = [
      [1, 1],
      [3, 2],
    ]
    inst.layout.recommendableCols = [1, 2]
    inst.highlight = { recommendCol: 2 }
    inst.layout.style = { colWidths: [100, 200, 300, 400] }
    const r = doMoveBlockCol(inst, 1, 2, 2, [])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // splice(1,2) 后 [c0,c3]，插回 2 → [c0,c3,c1,c2]
    expect(r.value.layout.slotGrid![0]).toEqual(['x00', 'x03', 'x01', 'x02'])
    expect(r.value.layout.merges).toEqual([{ start: [1, 2], end: [2, 3] }])
    expect(r.value.layout.readonlyCells).toEqual([
      [1, 2],
      [3, 3],
    ])
    expect(r.value.layout.style?.colWidths).toEqual([100, 400, 200, 300])
    expect(r.value.layout.recommendableCols).toEqual([2, 3])
    expect(r.value.highlight?.recommendCol).toBe(3)
  })

  it('标签列拦截：from 或 to = 0 → 标签列白话文案', () => {
    const inst = block6x4()
    const a = run(inst, { kind: 'moveColBlock', from: 0, count: 1, to: 2 })
    expect(!a.ok ? a.error.code : '').toBe('STRUCT_MOVE_BLOCKED')
    const b = run(inst, { kind: 'moveColBlock', from: 1, count: 2, to: 0 })
    expect(!b.ok ? b.error.message : '').toContain('标签列')
  })

  it('冻结边界拦截：跨冻结边界的带、两侧互串都拒；同侧整体挪动放行', () => {
    const inst = block6x4()
    inst.layout.frozenColCount = 2
    // 源带 [1,3) 横跨冻结边界（第 0、1 列冻结）
    expect(run(inst, { kind: 'moveColBlock', from: 1, count: 2, to: 2 }).ok).toBe(false)
    // 源在冻结区、目标在普通区 → 互串
    const cross = run(inst, { kind: 'moveColBlock', from: 1, count: 1, to: 3 })
    expect(!cross.ok ? cross.error.message : '').toContain('冻结列')
    // 整块普通列区内部挪动放行（frozen=0，块 [1,3) → 2）
    const normal = block6x4()
    expect(run(normal, { kind: 'moveColBlock', from: 1, count: 2, to: 2 }).ok).toBe(true)
  })

  it('越界 → TEMPLATE_INVALID「这一段列不存在」', () => {
    const r = run(block6x4(), { kind: 'moveColBlock', from: 2, count: 3, to: 1 })
    expect(!r.ok ? r.error.code : '').toBe('TEMPLATE_INVALID')
    expect(!r.ok ? r.error.message : '').toBe('这一段列不存在')
  })

  it('列轴合并区存活：块内合法、跨块左边界拦截', () => {
    const okInst = block6x4()
    okInst.layout.merges = [{ start: [2, 1], end: [2, 2] }]
    expect(run(okInst, { kind: 'moveColBlock', from: 1, count: 2, to: 2 }).ok).toBe(true)
    const badInst = block6x4()
    badInst.layout.merges = [{ start: [2, 0], end: [2, 1] }] // 跨块左边界（col 0 不动、col 1 在块内）
    expect(run(badInst, { kind: 'moveColBlock', from: 1, count: 2, to: 2 }).ok).toBe(false)
  })
})
