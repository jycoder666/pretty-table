import { describe, expect, it } from 'vitest'
import { COMPARE_ALPHA_V1, createBlankInstance } from '../templates'
import { cloneInstance } from '../schema/validate'
import { applyEditIntent } from './intent'
import { canMerge, canSplit } from './mergeGuard'
import { MERGE_MAX_CLUSTERS, MERGE_MAX_SPAN_COLS, MERGE_MAX_SPAN_ROWS } from '../theme/layoutScales'
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

  it('白名单内的矩形放行；跨度超上限拒（断言按 layoutScales 常量参数化，T01④ 同步）', () => {
    const l = layout({ rowCount: MERGE_MAX_SPAN_ROWS, allowedMerges: [R(0, 0, MERGE_MAX_SPAN_ROWS - 1, 2)] })
    expect(canMerge(l, R(0, 0, 1, 1)).ok).toBe(true)
    // 上限内恰满跨度 → 放行（旧口径 4 行的 R(0,0,4,0) 现已合法）
    expect(canMerge(l, R(0, 0, MERGE_MAX_SPAN_ROWS - 1, 0)).ok).toBe(true)
    // 超上限：跨度 = 上限 + 1 → 拒，文案带常量数字
    const l2 = layout({ rowCount: MERGE_MAX_SPAN_ROWS + 1, allowedMerges: [R(0, 0, MERGE_MAX_SPAN_ROWS, 2)] })
    const r = canMerge(l2, R(0, 0, MERGE_MAX_SPAN_ROWS, 0))
    expect(r.ok).toBe(false)
    expect(!r.ok ? r.error.message : '').toBe(`一次最多合并 ${MERGE_MAX_SPAN_ROWS} 行或 ${MERGE_MAX_SPAN_COLS} 列`)
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

// ── 灵活操作升级：合并上限常量 6/8/30（拍板值，PRD §8 Q1），白名单闸不动 ──
// T05 收口：边界矩阵参数化（常量注入；改常量只改本矩阵与拍板值断言，B5-4 纪律）。

describe('mergeGuard · 合并上限边界矩阵（灵活操作 T05：常量注入参数化）', () => {
  function fullAllow(rows: number, cols: number): LayoutSpec {
    return layout({ rowCount: rows, colCount: cols, allowedMerges: [R(0, 0, rows - 1, cols - 1)] })
  }

  it('常量拍板值：6 / 8 / 30（B6-1 拍板；改常量时同步此断言）', () => {
    expect(MERGE_MAX_SPAN_ROWS).toBe(6)
    expect(MERGE_MAX_SPAN_COLS).toBe(8)
    expect(MERGE_MAX_CLUSTERS).toBe(30)
  })

  // 跨度矩阵：上限内一位与恰在上限都放行，超一位拒（5/6/7 行、7/8/9 列按常量展开）
  const SPAN_MATRIX: { axis: 'row' | 'col'; span: number; note: string; verdict: string }[] = [
    { axis: 'row', span: MERGE_MAX_SPAN_ROWS - 1, note: '恰在上限内一位', verdict: '放行' },
    { axis: 'row', span: MERGE_MAX_SPAN_ROWS, note: '恰在上限', verdict: '放行' },
    { axis: 'row', span: MERGE_MAX_SPAN_ROWS + 1, note: '超上限一位', verdict: '拒（文案含常量数字）' },
    { axis: 'col', span: MERGE_MAX_SPAN_COLS - 1, note: '恰在上限内一位', verdict: '放行' },
    { axis: 'col', span: MERGE_MAX_SPAN_COLS, note: '恰在上限', verdict: '放行' },
    { axis: 'col', span: MERGE_MAX_SPAN_COLS + 1, note: '超上限一位', verdict: '拒（文案含常量数字）' },
  ]

  it.each(SPAN_MATRIX)('$axis 跨度 $span（$note）→ $verdict', ({ axis, span, verdict }) => {
    // 夹具尺寸随常量走（常量 + 5 的余量），改常量时矩阵不必改表尺寸
    const l = axis === 'row' ? fullAllow(MERGE_MAX_SPAN_ROWS + 5, 3) : fullAllow(3, MERGE_MAX_SPAN_COLS + 5)
    const range = axis === 'row' ? R(0, 0, span - 1, 1) : R(0, 0, 1, span - 1)
    const rejected = verdict !== '放行'
    const r = canMerge(l, range)
    expect(r.ok).toBe(!rejected)
    // 拒绝文案带常量数字（GC-25：码不外露，白话）；放行时无文案（空串对空串）
    const wantMsg = rejected ? `一次最多合并 ${MERGE_MAX_SPAN_ROWS} 行或 ${MERGE_MAX_SPAN_COLS} 列` : ''
    expect(r.ok ? '' : r.error.message).toBe(wantMsg)
  })

  // 数量矩阵：存量 29 处（上限内）第 30 处放行；存量 30 处（恰在上限）第 31 处拒
  const CLUSTER_MATRIX: { prior: number; note: string; verdict: string }[] = [
    { prior: MERGE_MAX_CLUSTERS - 1, note: '恰在上限内一位', verdict: '放行' },
    { prior: MERGE_MAX_CLUSTERS, note: '恰在上限', verdict: '拒（这张表的合并已经到上限）' },
  ]

  it.each(CLUSTER_MATRIX)('存量 $prior 处合并再并一处（$note）→ $verdict', ({ prior, verdict }) => {
    const merges = Array.from({ length: prior }, (_, i) => R(i, 0, i, 1))
    const l = layout({
      rowCount: MERGE_MAX_CLUSTERS + 2,
      colCount: 4,
      merges,
      allowedMerges: [R(0, 0, MERGE_MAX_CLUSTERS + 1, 3)],
    })
    const rejected = verdict !== '放行'
    const r = canMerge(l, R(prior, 2, prior, 3))
    expect(r.ok).toBe(!rejected)
    expect(r.ok ? '' : r.error.message).toBe(rejected ? '这张表的合并已经到上限' : '')
  })

  it('白名单闸不受放宽影响：允许区外仍拒、文案与错误码不变', () => {
    const l = layout({ allowedMerges: [R(0, 0, 1, 1)] })
    const r = canMerge(l, R(2, 0, 3, 1))
    expect(r.ok).toBe(false)
    expect(!r.ok ? r.error.code : '').toBe('MERGE_NOT_ALLOWED')
    expect(!r.ok ? r.error.message : '').toBe('这一块不在模板允许的合并区里')
  })
})

// ── 灵活操作升级 T05②：「存量 20 处可拆分可续合并」主判据走单测夹具（UI 造数代价高）──

describe('mergeGuard · 存量 20 处合并的旧数据（T05②：夹具主判据）', () => {
  it('createBlankInstance 造 20 merges 实例：全部可拆分、拆分后可原位续合并、可续并至 30、第 31 处拒', () => {
    // 存量口径（B5-1 零迁移）：旧上限（跨度 4/5、数量 20）下创建的 merges 是放宽后的子集，全部继续合法
    const inst = cloneInstance(createBlankInstance({ rows: 20, cols: 12 }))
    const legacy = Array.from({ length: 20 }, (_, r) => R(r, 0, r, 1))
    inst.layout.merges = legacy

    // ① 20 处存量逐处可拆分（canSplit 闸）
    for (const m of legacy) {
      expect(canSplit(inst.layout, m).ok).toBe(true)
    }
    // ② 拆分链路：真实 merge/split 意图走 applyEditIntent（与壳层 dispatch 同一条核内链）
    const splitOnce = applyEditIntent(inst, { kind: 'split', range: legacy[0]! })
    expect(splitOnce.ok).toBe(true)
    const afterSplit = splitOnce.ok ? splitOnce.value : inst
    expect(afterSplit.layout.merges).toHaveLength(19)

    // ③ 拆掉的第 1 处可在原位续合并（拆分 → 续合并闭环）
    const reMerge = applyEditIntent(afterSplit, { kind: 'merge', range: legacy[0]! })
    expect(reMerge.ok).toBe(true)
    const afterReMerge = reMerge.ok ? reMerge.value : afterSplit
    expect(afterReMerge.layout.merges).toHaveLength(20)

    // ④ 从存量 20 续并至新上限 30：第 21~30 处全部放行（真实 merge 意图链）
    let cur = afterReMerge
    for (let r = 0; r < 10; r++) {
      const res = applyEditIntent(cur, { kind: 'merge', range: R(r, 2, r, 3) })
      expect(res.ok).toBe(true)
      cur = res.ok ? res.value : cur
    }
    expect(cur.layout.merges).toHaveLength(30)

    // ⑤ 30 处存量后的 canMerge 闸单点断言：第 31 处拒
    const r31 = canMerge(cur.layout, R(10, 2, 10, 3))
    expect(r31.ok).toBe(false)
    expect(!r31.ok ? r31.error.message : '').toBe('这张表的合并已经到上限')
  })
})
