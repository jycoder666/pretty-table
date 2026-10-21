import { describe, expect, it } from 'vitest'
import { validateInstance } from '../schema/validate'
import { createBlankInstance } from './blankFactory'

/** T05：新建空白表向导的实例工厂（FR-C6 / Q-10） */

describe('createBlankInstance — 空白表参数化工厂', () => {
  it('默认 5 行 × 4 列、单层表头，validate 通过', () => {
    const inst = createBlankInstance()
    expect(inst.layout.rowCount).toBe(5)
    expect(inst.layout.colCount).toBe(4)
    expect(inst.layout.headerLevels).toBe(1)
    expect(inst.meta?.templateType).toBe('blank')
    const v = validateInstance(inst)
    expect(v.ok).toBe(true)
  })

  it('自定义 6 行 3 列 2 层表头：网格与槽位一一对应', () => {
    const inst = createBlankInstance({ rows: 6, cols: 3, headerLevels: 2 })
    expect(inst.layout.slotGrid).toHaveLength(6)
    for (const row of inst.layout.slotGrid!) {
      expect(row).toHaveLength(3)
    }
    expect(Object.keys(inst.slots)).toHaveLength(18)
    expect(inst.layout.headerLevels).toBe(2)
  })

  it('超界钳制：行 ≤20、列 ≤12、层级 ≤3；非法输入收口到边界（不报错）', () => {
    expect(createBlankInstance({ rows: 99, cols: 50 }).layout.rowCount).toBe(20)
    expect(createBlankInstance({ rows: 99, cols: 50 }).layout.colCount).toBe(12)
    expect(createBlankInstance({ headerLevels: 9 }).layout.headerLevels).toBe(3)
    expect(createBlankInstance({ rows: -3, cols: 0 }).layout.rowCount).toBe(1)
    expect(createBlankInstance({ rows: -3, cols: 0 }).layout.colCount).toBe(1)
  })

  it('层级不超过行数（至少留一行表体）', () => {
    expect(createBlankInstance({ rows: 2, headerLevels: 3 }).layout.headerLevels).toBe(2)
    expect(createBlankInstance({ rows: 1, headerLevels: 1 }).layout.headerLevels).toBe(1)
  })

  it('槽位 id 单调唯一（u1..uN），全表可合并', () => {
    const inst = createBlankInstance({ rows: 7, cols: 3 })
    const ids = inst.layout.slotGrid!.flat()
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids[0]).toBe('u1')
    expect(inst.layout.allowedMerges).toEqual([{ start: [0, 0], end: [6, 2] }])
    const v = validateInstance(inst)
    expect(v.ok).toBe(true)
  })
})
