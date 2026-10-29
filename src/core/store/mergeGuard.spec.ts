import { describe, expect, it } from 'vitest'
import { COMPARE_ALPHA_V1 } from '../templates'
import { canMerge, canSplit } from './mergeGuard'
import type { LayoutSpec, MergeRange } from '../types'

const R = (r0: number, c0: number, r1: number, c1: number): MergeRange => ({
  start: [r0, c0],
  end: [r1, c1],
})

function layout(partial: Partial<LayoutSpec> = {}): LayoutSpec {
  return { rowCount: 6, colCount: 6, blockSlots: [], ...partial }
}

describe('mergeGuard · 白名单合并（A-5）', () => {
  it('无声明或白名单外 → 拒', () => {
    expect(canMerge(layout(), R(0, 0, 0, 1)).ok).toBe(false)
    const l = layout({ allowedMerges: [R(0, 0, 0, 1)] })
    const r = canMerge(l, R(3, 0, 3, 2))
    expect(r.ok).toBe(false)
    expect(!r.ok ? r.error.message : '').toContain('允许')
  })

  it('落在单一允许矩形内 → 放行', () => {
    const l = layout({ allowedMerges: [R(2, 1, 5, 1)] })
    expect(canMerge(l, R(2, 1, 4, 1)).ok).toBe(true)
  })

  it('对比表白名单：同列纵向可并，跨对象列与跨分隔槽不可并', () => {
    const l = COMPARE_ALPHA_V1.layout
    expect(canMerge(l, R(2, 1, 4, 1)).ok).toBe(true)
    expect(canMerge(l, R(2, 1, 2, 2)).ok).toBe(false)
    expect(canMerge(l, R(5, 1, 6, 1)).ok).toBe(false)
  })

  it('碰到锁定合并（非同区间重叠）→ MERGE_STRUCTURAL', () => {
    const l = layout({ structuralMerges: [R(0, 0, 1, 0)] })
    const r = canMerge(l, R(0, 0, 0, 1))
    expect(r.ok).toBe(false)
    expect(!r.ok ? r.error.code : '').toBe('MERGE_STRUCTURAL')
  })

  it('与现有合并区部分重叠 → MERGE_CONFLICT', () => {
    const l = layout({ merges: [R(0, 1, 0, 2)] })
    const r = canMerge(l, R(0, 2, 0, 3))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('MERGE_CONFLICT')
  })

  // WP1 收紧：旧实现「同区间重复合并放行」会把同一区间再追加进 merges（重复项），
  // 且按钮一直可点。现在直接拒并给出可读原因。
  it('同区间重复合并 → 拒（MERGE_NOT_ALLOWED「已经是合并区」）', () => {
    const l = layout({ merges: [R(0, 1, 0, 2)] })
    const r = canMerge(l, R(0, 1, 0, 2))
    expect(r.ok).toBe(false)
    expect(!r.ok ? r.error.code : '').toBe('MERGE_NOT_ALLOWED')
    expect(!r.ok ? r.error.message : '').toContain('已经是合并区')
  })

  it('选区恰好等于锁定合并区 → MERGE_STRUCTURAL（不再假装可合并）', () => {
    const l = layout({ structuralMerges: [R(0, 0, 1, 0)] })
    const r = canMerge(l, R(0, 0, 1, 0))
    expect(r.ok).toBe(false)
    expect(!r.ok ? r.error.code : '').toBe('MERGE_STRUCTURAL')
  })

  it('单格仍 MERGE_NOT_ALLOWED', () => {
    const l = layout()
    expect(canMerge(l, R(1, 1, 1, 1)).ok).toBe(false)
  })

  it('白名单内的矩形放行；超出 4 行拒', () => {
    const l = layout({ allowedMerges: [R(0, 0, 5, 2)] })
    expect(canMerge(l, R(0, 0, 1, 1)).ok).toBe(true)
    expect(canMerge(l, R(0, 0, 4, 0)).ok).toBe(false)
  })

  it('range end < start → 入口逐轴归一化后，落在白名单内放行', () => {
    const l = layout({ allowedMerges: [R(0, 0, 1, 1)] })
    expect(canMerge(l, { start: [1, 1], end: [0, 0] }).ok).toBe(true)
  })

  it('归一化后与锁定合并相撞仍拒（MERGE_STRUCTURAL）', () => {
    const l = layout({ structuralMerges: [R(0, 0, 1, 0)] })
    const r = canMerge(l, { start: [0, 1], end: [1, 0] })
    expect(r.ok).toBe(false)
    expect(!r.ok ? r.error.code : '').toBe('MERGE_STRUCTURAL')
  })

  it('选区命中 readonlyCells → MERGE_NOT_ALLOWED「此处由模板固定，不能合并」', () => {
    const l = layout({ readonlyCells: [[2, 1]] })
    const r = canMerge(l, R(1, 0, 2, 2))
    expect(r.ok).toBe(false)
    expect(!r.ok ? r.error.code : '').toBe('MERGE_NOT_ALLOWED')
    expect(!r.ok ? r.error.message : '').toContain('模板固定')
    const open = layout({
      readonlyCells: [[2, 1]],
      allowedMerges: [R(3, 0, 4, 2)],
    })
    expect(canMerge(open, R(3, 0, 4, 2)).ok).toBe(true)
  })

  it('锁定合并仍禁拆（structuralMerges 硬闸保留）', () => {
    const l = layout({ structuralMerges: [R(0, 0, 1, 0)] })
    const r = canSplit(l, R(0, 0, 1, 0))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('MERGE_STRUCTURAL')
  })

  it('allowedMerges 不影响 canSplit 判定', () => {
    const l = layout({ merges: [R(2, 0, 2, 1)] })
    expect(canSplit(l, R(2, 0, 2, 1)).ok).toBe(true)
  })

  // WP1：拆分闸收紧为「选区恰好等于某个合并区」，消灭「可点但点了没反应」的静默 no-op
  it('选区落在合并区之内（子区域）→ 拒 + 指引「请选中整个合并区再拆分」', () => {
    const l = layout({ merges: [R(0, 1, 0, 3)] })
    const r = canSplit(l, R(0, 1, 0, 2))
    expect(r.ok).toBe(false)
    expect(!r.ok ? r.error.code : '').toBe('MERGE_NOT_ALLOWED')
    expect(!r.ok ? r.error.message : '').toContain('整个合并区')
  })

  it('选区比合并区大（含未合并格）→ 拒（不再假可点）', () => {
    const l = layout({ merges: [R(0, 1, 0, 2)] })
    expect(canSplit(l, R(0, 0, 0, 2)).ok).toBe(false)
  })

  it('非合并区选区 → 拒（MERGE_NOT_ALLOWED）', () => {
    const l = layout({ merges: [R(2, 0, 2, 1)] })
    expect(canSplit(l, R(3, 0, 3, 1)).ok).toBe(false)
  })

  it('选区恰好等于锁定合并区（含归一化 end<start）→ MERGE_STRUCTURAL', () => {
    const l = layout({ structuralMerges: [R(0, 0, 1, 0)] })
    const r = canSplit(l, { start: [1, 0], end: [0, 0] })
    expect(r.ok).toBe(false)
    expect(!r.ok ? r.error.code : '').toBe('MERGE_STRUCTURAL')
  })
})
