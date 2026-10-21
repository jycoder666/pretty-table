import { fail, ok, type Result } from '../errors'
import type { LayoutSpec, MergeRange } from '../types'

function rangeKey(r: MergeRange): string {
  return `${r.start[0]},${r.start[1]}-${r.end[0]},${r.end[1]}`
}

function sameRange(a: MergeRange, b: MergeRange): boolean {
  return rangeKey(a) === rangeKey(b)
}

function isSingleCell(r: MergeRange): boolean {
  return r.start[0] === r.end[0] && r.start[1] === r.end[1]
}

/** True if `inner` is fully inside `outer` (inclusive). */
function containedIn(inner: MergeRange, outer: MergeRange): boolean {
  return (
    inner.start[0] >= outer.start[0] &&
    inner.start[1] >= outer.start[1] &&
    inner.end[0] <= outer.end[0] &&
    inner.end[1] <= outer.end[1]
  )
}

function overlaps(a: MergeRange, b: MergeRange): boolean {
  return !(
    a.end[0] < b.start[0] ||
    a.start[0] > b.end[0] ||
    a.end[1] < b.start[1] ||
    a.start[1] > b.end[1]
  )
}

export function canMerge(layout: LayoutSpec, range: MergeRange): Result<void> {
  if (isSingleCell(range)) {
    return fail('MERGE_NOT_ALLOWED', '单格无需合并')
  }
  if (range.start[0] !== range.end[0] && range.start[1] !== range.end[1]) {
    return fail('MERGE_NOT_ALLOWED', '只支持同行或同列相邻合并')
  }
  // 自定义格式设计增量 §1.4.1：合并闸放宽——allowedMerges 降级为兼容字段，不再硬闸；
  // 硬闸收窄为「不碰锁定合并 + 不与现有合并区部分重叠」。
  const structural = layout.structuralMerges ?? []
  if (structural.some((s) => overlaps(range, s) && !sameRange(range, s))) {
    return fail('MERGE_STRUCTURAL', '不能覆盖锁定合并区')
  }
  const existing = layout.merges ?? []
  if (existing.some((m) => overlaps(range, m) && !sameRange(range, m))) {
    return fail('MERGE_CONFLICT', '和已有的合并区叠不上，请先拆开再合并')
  }
  return ok(undefined)
}

export function canSplit(layout: LayoutSpec, range: MergeRange): Result<void> {
  const structural = layout.structuralMerges ?? []
  if (structural.some((s) => sameRange(s, range) || containedIn(range, s))) {
    return fail('MERGE_STRUCTURAL', '此处由模板锁定，不能拆分')
  }
  const merges = layout.merges ?? []
  const hit = merges.find((m) => sameRange(m, range) || containedIn(range, m))
  if (!hit) {
    return fail('MERGE_NOT_ALLOWED', '没有可拆分的合并')
  }
  return ok(undefined)
}

export function findMergeAt(layout: LayoutSpec, row: number, col: number): MergeRange | null {
  const merges = [...(layout.merges ?? []), ...(layout.structuralMerges ?? [])]
  for (const m of merges) {
    if (row >= m.start[0] && row <= m.end[0] && col >= m.start[1] && col <= m.end[1]) {
      return m
    }
  }
  return null
}
