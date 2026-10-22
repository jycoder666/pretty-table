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
  if (structural.some((s) => sameRange(r, s))) {
    return fail('MERGE_STRUCTURAL', '这一块由模板固定，不能合并也不能拆分')
  }
  if (structural.some((s) => overlaps(r, s))) {
    return fail('MERGE_STRUCTURAL', '不能覆盖锁定合并区')
  }
  const existing = layout.merges ?? []
  // WP1 收紧：选区恰好等于某个既有合并区时，merge 意图只是把同一区间再压一遍
  // （旧实现会往 merges 里追加重复项）→ 直接拒绝，按钮同步置灰。
  if (existing.some((m) => sameRange(r, m))) {
    return fail('MERGE_NOT_ALLOWED', '这一块已经是合并区了')
  }
  if (existing.some((m) => overlaps(r, m))) {
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

/**
 * 拆分闸（WP1 收紧）：只认「选区恰好等于某个合并区」。
 * 历史实现放过「选区被合并区包含」，但 split 意图按精确匹配过滤 → 点了没反应（静默 no-op）。
 * 现在子区域选择直接给可执行指引，不再假装可点。
 */
export function canSplit(layout: LayoutSpec, range: MergeRange): Result<void> {
  const r = normalizeRange(range)
  const structural = layout.structuralMerges ?? []
  if (structural.some((s) => sameRange(s, r))) {
    return fail('MERGE_STRUCTURAL', '这一块由模板固定，不能拆分')
  }
  const merges = layout.merges ?? []
  if (!merges.some((m) => sameRange(m, r))) {
    return fail('MERGE_NOT_ALLOWED', '请选中整个合并区再拆分')
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
