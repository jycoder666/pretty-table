import { describe, expect, it } from 'vitest'
import { canMerge, canSplit } from './mergeGuard'
import type { LayoutSpec, MergeRange } from '../types'

const R = (r0: number, c0: number, r1: number, c1: number): MergeRange => ({
  start: [r0, c0],
  end: [r1, c1],
})

function layout(partial: Partial<LayoutSpec> = {}): LayoutSpec {
  return { rowCount: 6, colCount: 6, blockSlots: [], ...partial }
}

describe('mergeGuard · 合并闸放宽（自定义格式 §1.4.1）', () => {
  it('allowedMerges 之外区域现在允许合并（兼容字段不再硬闸）', () => {
    const l = layout({ allowedMerges: [R(0, 0, 0, 1)] })
    const r = canMerge(l, R(3, 0, 3, 2))
    expect(r.ok).toBe(true)
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

  it('同区间重复合并 → 放行（幂等）', () => {
    const l = layout({ merges: [R(0, 1, 0, 2)] })
    expect(canMerge(l, R(0, 1, 0, 2)).ok).toBe(true)
  })

  it('单格 / 双向跨行跨列仍 MERGE_NOT_ALLOWED', () => {
    const l = layout()
    expect(canMerge(l, R(1, 1, 1, 1)).ok).toBe(false)
    expect(canMerge(l, R(0, 0, 1, 1)).ok).toBe(false)
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
})
