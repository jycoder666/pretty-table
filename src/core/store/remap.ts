import type { CellCoord, MergeRange } from '../types'

/**
 * 结构编辑核的区间重映射原语（WP5 从 structure.ts 原样搬出，行为不变）。
 * axis 一律 0=行 / 1=列；全部是纯函数，只算区间，不碰实例。
 * 三个合并区集合（merges / structuralMerges / allowedMerges）共用这一套。
 */

function mkRange(ns: number, ne: number, o0: number, o1: number, axis: 0 | 1): MergeRange {
  // axis=0（行）：[row, col] = [n, o]；axis=1（列）：[row, col] = [o, n]
  return {
    start: axis === 0 ? [ns, o0] : [o0, ns],
    end: axis === 0 ? [ne, o1] : [o1, ne],
  }
}

/** 在 axis 轴 at 位置插入 delta 个单位：插入点落在区间内部 → 拉长；≥ at → 平移 */
export function remapRangesInsert(
  ranges: MergeRange[],
  at: number,
  delta: number,
  axis: 0 | 1,
): MergeRange[] {
  return ranges.map((r) => {
    const s = axis === 0 ? r.start[0] : r.start[1]
    const e = axis === 0 ? r.end[0] : r.end[1]
    const o0 = axis === 0 ? r.start[1] : r.start[0]
    const o1 = axis === 0 ? r.end[1] : r.end[0]
    let ns = s
    let ne = e
    if (s < at && e >= at) {
      ne = e + delta
    } else if (s >= at) {
      ns = s + delta
      ne = e + delta
    }
    return mkRange(ns, ne, o0, o1, axis)
  })
}

/** 在 axis 轴删除第 at 个单位：相交收缩；完全在删单位内或收缩后只剩单格 → 移除 */
export function remapRangesRemove(
  ranges: MergeRange[],
  at: number,
  axis: 0 | 1,
): { ranges: MergeRange[]; removed: MergeRange[] } {
  const out: MergeRange[] = []
  const removed: MergeRange[] = []
  for (const r of ranges) {
    const s = axis === 0 ? r.start[0] : r.start[1]
    const e = axis === 0 ? r.end[0] : r.end[1]
    const o0 = axis === 0 ? r.start[1] : r.start[0]
    const o1 = axis === 0 ? r.end[1] : r.end[0]
    if (e < at || s > at) {
      // 不相交：仅平移
      const ns = s > at ? s - 1 : s
      const ne = e > at ? e - 1 : e
      out.push(mkRange(ns, ne, o0, o1, axis))
      continue
    }
    // 相交：收缩
    const ns = s > at ? s - 1 : s
    const ne = e >= at ? e - 1 : e
    if (ns > ne) {
      removed.push(r)
      continue
    }
    const nr = mkRange(ns, ne, o0, o1, axis)
    if (nr.start[0] === nr.end[0] && nr.start[1] === nr.end[1]) {
      removed.push(r)
      continue
    }
    out.push(nr)
  }
  return { ranges: out, removed }
}

/** 单元素置换：把位置 from 的元素移到 to，其余元素按序让位（其它位置一一对应） */
export function permuteIndex(idx: number, from: number, to: number): number {
  if (idx === from) return to
  if (from < to) return idx > from && idx <= to ? idx - 1 : idx
  return idx >= to && idx < from ? idx + 1 : idx
}

/**
 * 合并区在整行（列）置换下是否还连续。
 * 单行/单列合并区整体跟着走，永远安全；跨行/跨列合并区被「从中间抽走一行」或
 * 「把别处一行塞进区间内部」都会碎成不相邻的两块——这种换位直接拒绝，
 * 不做「悄悄拆开合并区」的隐式降级（用户看到的是合并没有了，说不清是谁干的）。
 */
export function survivesPermute(s: number, e: number, from: number, to: number): boolean {
  if (s === e) return true
  const img = new Set<number>()
  for (let i = s; i <= e; i++) img.add(permuteIndex(i, from, to))
  const min = Math.min(...img)
  const max = Math.max(...img)
  return max - min + 1 === img.size
}

/** 合并区集合在某个轴上按置换重映射（区间端点重排后重新归一化） */
export function permuteAxisRanges(
  ranges: MergeRange[] | undefined,
  from: number,
  to: number,
  axis: 0 | 1,
): MergeRange[] | undefined {
  if (!ranges) return ranges
  return ranges.map((r) => {
    const s0 = axis === 0 ? r.start[0] : r.start[1]
    const e0 = axis === 0 ? r.end[0] : r.end[1]
    // 端点的影像不一定是新端点：区间内部换位（0..2 里 1→2）影像集不变。
    // checkMove 已保证影像集连续，取影像集的 min/max 就是新区间。
    let s = Number.POSITIVE_INFINITY
    let e = Number.NEGATIVE_INFINITY
    for (let i = s0; i <= e0; i++) {
      const v = permuteIndex(i, from, to)
      if (v < s) s = v
      if (v > e) e = v
    }
    const o0 = axis === 0 ? r.start[1] : r.start[0]
    const o1 = axis === 0 ? r.end[1] : r.end[0]
    return mkRange(Math.min(s, e), Math.max(s, e), o0, o1, axis)
  })
}

/** 只读格坐标在某个轴上按置换重映射 */
export function permuteCells(
  cells: CellCoord[] | undefined,
  from: number,
  to: number,
  axis: 0 | 1,
): CellCoord[] | undefined {
  if (!cells) return cells
  return cells.map(([r, c]) => {
    const v = permuteIndex(axis === 0 ? r : c, from, to)
    return (axis === 0 ? [v, c] : [r, v]) as CellCoord
  })
}
