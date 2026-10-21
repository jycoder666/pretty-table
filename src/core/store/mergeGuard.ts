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

/** 入口防御：start/end 逐轴取 min/max 归一化（end < start 的非法范围不崩、按矩形处理） */
function normalizeRange(range: MergeRange): MergeRange {
  const r0 = Math.min(range.start[0], range.end[0])
  const r1 = Math.max(range.start[0], range.end[0])
  const c0 = Math.min(range.start[1], range.end[1])
  const c1 = Math.max(range.start[1], range.end[1])
  return { start: [r0, c0], end: [r1, c1] }
}

export function canMerge(layout: LayoutSpec, range: MergeRange): Result<void> {
  const r = normalizeRange(range)
  if (isSingleCell(r)) {
    return fail('MERGE_NOT_ALLOWED', '单格无需合并')
  }
  // 自定义格式设计增量 §1.4.1：合并闸放宽——allowedMerges 降级为兼容字段，不再硬闸。
  // 交互升级 §1.1（R-2）：删除「只支持同行或同列」限制，任意 m×n 连续矩形放行；
  // 硬闸收窄为「不碰锁定合并 + 不与现有合并区部分重叠 + 不命中 readonlyCells」。
  const structural = layout.structuralMerges ?? []
  if (structural.some((s) => overlaps(r, s) && !sameRange(r, s))) {
    return fail('MERGE_STRUCTURAL', '不能覆盖锁定合并区')
  }
  const existing = layout.merges ?? []
  if (existing.some((m) => overlaps(r, m) && !sameRange(r, m))) {
    return fail('MERGE_CONFLICT', '和已有的合并区叠不上，请先拆开再合并')
  }
  const readonlyHit = (layout.readonlyCells ?? []).some(
    ([rr, cc]) => rr >= r.start[0] && rr <= r.end[0] && cc >= r.start[1] && cc <= r.end[1],
  )
  if (readonlyHit) {
    return fail('MERGE_NOT_ALLOWED', '此处由模板固定，不能合并')
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
