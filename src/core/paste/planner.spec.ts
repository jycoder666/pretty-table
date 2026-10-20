import { describe, expect, it } from 'vitest'
import type { TemplateInstance } from '../types'
import { parsePaste } from './parser'
import { buildVisibleGrid, planPaste } from './planner'
import { cloneInstance } from '../schema/validate'

/** 6 逻辑行 × 2 列；第 2 行（0 基）后有 between-rows 区块槽 → 可见 7 行 */
export function makePasteFixture(): TemplateInstance {
  return {
    schemaVersion: '1.1',
    templateId: 'paste-fixture',
    themeId: 'T-A',
    slots: {
      'a.1': '', 'a.2': '',
      'b.1': '', 'b.2': '',
      'c.1': '', 'c.2': '',
      'd.1': '', 'd.2': '',
      'e.1': '', 'e.2': '',
      'f.1': '', 'f.2': '',
    },
    blocks: [],
    slotDefs: {
      'c.1': { kind: 'number', format: 'percent' },
      'd.1': { kind: 'number', format: 'currency', currency: 'CNY' },
      'e.1': { kind: 'number', format: 'number' },
      'f.1': { kind: 'mark' },
    },
    highlight: { recommendCol: null },
    layout: {
      rowCount: 6,
      colCount: 2,
      blockSlots: [{ id: 'gap-1', accept: ['sectionBar'], rowHint: 'after-2', region: 'between-rows' }],
      slotGrid: [
        ['a.1', 'a.2'],
        ['b.1', 'b.2'],
        ['c.1', 'c.2'],
        ['d.1', 'd.2'],
        ['e.1', 'e.2'],
        ['f.1', 'f.2'],
      ],
    },
  }
}

describe('buildVisibleGrid · Planner 可见网格', () => {
  it('7. 逻辑 6 行、第 2 行后有 between-rows 区块 → 可见 7 行，第 3 行为 block', () => {
    const rows = buildVisibleGrid(makePasteFixture())
    expect(rows).toHaveLength(7)
    expect(rows[2]).toEqual({ kind: 'logical', logicalRow: 2 })
    expect(rows[3]).toEqual({ kind: 'block', blockSlotId: 'gap-1' })
    expect(rows[4]).toEqual({ kind: 'logical', logicalRow: 3 })
  })

  it('8. anchor 落在区块行或 slotGrid=null 格 → PASTE_NO_ANCHOR', () => {
    const inst = makePasteFixture()
    inst.layout.slotGrid![0]![0] = null
    const grid = parsePaste({ text: '1\t2' })
    expect(grid.ok).toBe(true)
    if (!grid.ok) return
    const onBlock = planPaste(inst, 0, [3, 0], grid.value)
    expect(onBlock.ok).toBe(false)
    expect(onBlock.ok ? '' : onBlock.error.code).toBe('PASTE_NO_ANCHOR')
    const onNull = planPaste(inst, 0, [0, 0], grid.value)
    expect(onNull.ok).toBe(false)
    expect(onNull.ok ? '' : onNull.error.code).toBe('PASTE_NO_ANCHOR')
  })

  it('9. 模板无 slotGrid 且迁移不了 → PASTE_UNSUPPORTED', () => {
    const inst = makePasteFixture()
    inst.layout.slotGrid = undefined
    const grid = parsePaste({ text: '1\t2' })
    expect(grid.ok).toBe(true)
    if (!grid.ok) return
    const r = planPaste(inst, 0, [0, 0], grid.value)
    expect(r.ok).toBe(false)
    expect(r.ok ? '' : r.error.code).toBe('PASTE_UNSUPPORTED')
  })

  it('10. 可见网格坐标映射回逻辑槽：区块行之后的源行写入正确的逻辑槽', () => {
    const inst = makePasteFixture()
    const grid = parsePaste({ text: '1\t2\n3\t4' })
    expect(grid.ok).toBe(true)
    if (!grid.ok) return
    // 起点 visible 第 4 行 = 逻辑第 3 行（d.*）；两行落在逻辑 3、4（跳过区块行不占目标行数之外）
    const r = planPaste(inst, 7, [4, 0], grid.value)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.baseVersion).toBe(7)
    const ids = r.value.cells.map((c) => c.slotId)
    expect(ids).toEqual(['d.1', 'd.2', 'e.1', 'e.2'])
  })

  it('11. plan.baseVersion = 传入 version', () => {
    const inst = makePasteFixture()
    const grid = parsePaste({ text: '1' })
    expect(grid.ok).toBe(true)
    if (!grid.ok) return
    const r = planPaste(inst, 42, [0, 0], grid.value)
    expect(r.ok).toBe(true)
    expect(r.ok ? r.value.baseVersion : -1).toBe(42)
  })

  it('10b. 跨区块行目标格 slotId=null（交给 Validator 拒收）', () => {
    const inst = cloneInstance(makePasteFixture())
    const grid = parsePaste({ text: '1\t2\n3\t4\n5\t6' })
    expect(grid.ok).toBe(true)
    if (!grid.ok) return
    const r = planPaste(inst, 0, [2, 0], grid.value)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.cells.find((c) => c.row === 3)?.slotId).toBeNull()
  })
})
