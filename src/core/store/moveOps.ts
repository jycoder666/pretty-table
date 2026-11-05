import { fail, ok, type CoreWarning, type Result } from '../errors'
import type { TemplateInstance } from '../types'
import { cloneInstance } from '../schema/validate'
import {
  permuteAxisRanges,
  permuteBlockAxisRanges,
  permuteBlockCells,
  permuteBlockIndex,
  permuteCells,
  permuteIndex,
  survivesBlockPermute,
  survivesPermute,
} from './remap'

/**
 * 整行/整列换位（WP4，WP5 从 structure.ts 原样搬出）。
 * 只搬位置，不搬语义：合并区/只读格/列宽/推荐列跟着被搬的那一行（列）一起重映射。
 */

/** 换位可行性（两个轴共用）：下标合法 + 合并区不碎 */
function checkMove(
  inst: TemplateInstance,
  from: number,
  to: number,
  axis: 0 | 1,
  count: number,
): Result<true> {
  const label = axis === 0 ? '行' : '列'
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= count || to >= count) {
    return fail('TEMPLATE_INVALID', `这一${label}不存在`)
  }
  const sets = [inst.layout.merges, inst.layout.structuralMerges, inst.layout.allowedMerges]
  for (const set of sets) {
    for (const r of set ?? []) {
      const s = axis === 0 ? r.start[0] : r.start[1]
      const e = axis === 0 ? r.end[0] : r.end[1]
      if (!survivesPermute(s, e, from, to)) {
        return fail(
          'STRUCT_MOVE_BLOCKED',
          `这一${label}和合并区交错，挪不动——先拆开合并区再试`,
        )
      }
    }
  }
  return ok(true)
}

/**
 * 换位可行性预检（增量设计 A3）：壳层菜单置灰与核内执行共用同一判定与文案。
 * 判定顺序严格保持现实现：
 * - 行轴 = 表头行 → 越界/合并区存活（原 checkMove 主体）
 * - 列轴 = 标签列 → 越界/合并区存活 → 冻结边界
 * doMoveRow/doMoveCol 改为内部调用本函数（行为与报错口径零变化）。
 */
export function moveGate(inst: TemplateInstance, axis: 0 | 1, from: number, to: number): Result<true> {
  if (axis === 0) {
    const headerLevels = inst.layout.headerLevels ?? 1
    if (from < headerLevels || to < headerLevels) {
      return fail('STRUCT_MOVE_BLOCKED', '表头行不能挪动，需要调整请用表头层数')
    }
    return checkMove(inst, from, to, 0, inst.layout.rowCount)
  }
  if (from === 0 || to === 0) {
    return fail('STRUCT_MOVE_BLOCKED', '第一列是标签列，不能挪动')
  }
  const check = checkMove(inst, from, to, 1, inst.layout.colCount)
  if (!check.ok) return check
  const frozen = inst.layout.frozenColCount ?? 0
  if (from < frozen !== to < frozen) {
    return fail('STRUCT_MOVE_BLOCKED', '冻结列不能和普通列换位')
  }
  return ok(true)
}

/**
 * 整行换位（WP4）。只搬位置，不搬语义：
 * - 表头行不参与（表头是层级结构，挪进数据区会破坏表头语义）
 * - 内容随行走：slotGrid 行、合并区、只读格一起按置换重映射
 * - 区块锚点 rowHint 是「第 N 行之后」的位置语义，按位置不动（与加行/删行的口径一致）
 */
export function doMoveRow(
  inst: TemplateInstance,
  from: number,
  to: number,
  warnings: CoreWarning[],
): Result<TemplateInstance> {
  const gate = moveGate(inst, 0, from, to)
  if (!gate.ok) return gate
  const next = cloneInstance(inst)
  if (from === to) return ok(next, warnings)
  const grid = next.layout.slotGrid!
  const [moved] = grid.splice(from, 1)
  if (moved) grid.splice(to, 0, moved)
  next.layout.merges = permuteAxisRanges(next.layout.merges, from, to, 0)
  next.layout.structuralMerges = permuteAxisRanges(next.layout.structuralMerges, from, to, 0)
  next.layout.allowedMerges = permuteAxisRanges(next.layout.allowedMerges, from, to, 0)
  next.layout.readonlyCells = permuteCells(next.layout.readonlyCells, from, to, 0)
  return ok(next, warnings)
}

/**
 * 整列换位（WP4）。比换行多三条结构约束：
 * - 第 0 列是标签列（左栏标签块锚点 left-N、首列固定 FR-26、Q-004 强调规则都挂在列号上）→ 不参与换位
 * - 冻结列与非冻结列不能互串（冻结是「最左 N 列」的位置语义，串了会得到意料之外的固定列）
 * - 列宽与推荐列（highlight.recommendCol / recommendableCols）跟着列一起走
 */
export function doMoveCol(
  inst: TemplateInstance,
  from: number,
  to: number,
  warnings: CoreWarning[],
): Result<TemplateInstance> {
  const gate = moveGate(inst, 1, from, to)
  if (!gate.ok) return gate
  const next = cloneInstance(inst)
  if (from === to) return ok(next, warnings)
  const grid = next.layout.slotGrid!
  for (const row of grid) {
    const [moved] = row.splice(from, 1)
    if (moved !== undefined) row.splice(to, 0, moved)
  }
  next.layout.merges = permuteAxisRanges(next.layout.merges, from, to, 1)
  next.layout.structuralMerges = permuteAxisRanges(next.layout.structuralMerges, from, to, 1)
  next.layout.allowedMerges = permuteAxisRanges(next.layout.allowedMerges, from, to, 1)
  next.layout.readonlyCells = permuteCells(next.layout.readonlyCells, from, to, 1)
  next.layout.recommendableCols = next.layout.recommendableCols?.map((c) =>
    permuteIndex(c, from, to),
  )
  if (next.highlight?.recommendCol !== null && next.highlight?.recommendCol !== undefined) {
    next.highlight = { recommendCol: permuteIndex(next.highlight.recommendCol, from, to) }
  }
  // 列宽与列一一对应：跟着列内容走，否则换列后宽度会留在原地
  const widths = next.layout.style?.colWidths
  if (widths) {
    const moved = [...widths]
    const [w] = moved.splice(from, 1)
    moved.splice(to, 0, w ?? null)
    next.layout.style = { ...next.layout.style, colWidths: moved }
  }
  return ok(next, warnings)
}

// ── 区块换位（编辑台灵活操作升级 T01：区间整体移动，一次置换、一次校验、一张快照）──

/** 区块换位共用存活检查：三套合并区集合逐一过 survivesBlockPermute（与 checkMove 同式） */
function checkMoveBlock(
  inst: TemplateInstance,
  from: number,
  count: number,
  to: number,
  axis: 0 | 1,
): Result<true> {
  const sets = [inst.layout.merges, inst.layout.structuralMerges, inst.layout.allowedMerges]
  for (const set of sets) {
    for (const r of set ?? []) {
      const s = axis === 0 ? r.start[0] : r.start[1]
      const e = axis === 0 ? r.end[0] : r.end[1]
      if (!survivesBlockPermute(s, e, from, count, to)) {
        return fail(
          'STRUCT_MOVE_BLOCKED',
          '这一段和合并区交错，挪不动——先拆开合并区再试',
        )
      }
    }
  }
  return ok(true)
}

/**
 * 区块换位可行性预检（壳层菜单置灰/拖拽落点与核内执行共用同一判定与文案）。
 * 判定顺序：越界/块合法性（TEMPLATE_INVALID）→ 表头行/标签列（STRUCT_MOVE_BLOCKED）→
 * 冻结边界（仅列轴）→ 合并区存活。
 * to 语义 = 块在删除后坐标里的落点（splice(from,count) 后 splice(to,0,…)），与执行严格同式。
 */
export function moveBlockGate(
  inst: TemplateInstance,
  axis: 0 | 1,
  from: number,
  count: number,
  to: number,
): Result<true> {
  const label = axis === 0 ? '行' : '列'
  const total = axis === 0 ? inst.layout.rowCount : inst.layout.colCount
  const badBlock =
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    !Number.isInteger(count) ||
    count < 1 ||
    from < 0 ||
    to < 0 ||
    from + count > total ||
    to + count > total
  if (badBlock) {
    return fail('TEMPLATE_INVALID', `这一段${label}不存在`)
  }
  if (axis === 0) {
    const headerLevels = inst.layout.headerLevels ?? 1
    if (from < headerLevels || to < headerLevels) {
      return fail('STRUCT_MOVE_BLOCKED', '表头行不能挪动，需要调整请用表头层数')
    }
    return checkMoveBlock(inst, from, count, to, 0)
  }
  if (from < 1 || to < 1) {
    return fail('STRUCT_MOVE_BLOCKED', '第一列是标签列，不能挪动')
  }
  const frozen = inst.layout.frozenColCount ?? 0
  // 源带与目标带各自完整在冻结区同侧；任何一条带横跨冻结边界或两侧分属不同侧都拦
  const straddles = (start: number) => start < frozen && start + count - 1 >= frozen
  const sideOf = (start: number) => start < frozen
  if (straddles(from) || straddles(to) || sideOf(from) !== sideOf(to)) {
    return fail('STRUCT_MOVE_BLOCKED', '冻结列不能和普通列换位')
  }
  return checkMoveBlock(inst, from, count, to, 1)
}

/**
 * 整块行换位。一次置换全字段重映射（slotGrid / 三套合并区集合 / readonlyCells）；
 * 区块锚点 rowHint 是「第 N 行之后」的位置语义，按位置不动（与 doMoveRow 口径一致）。
 */
export function doMoveBlockRow(
  inst: TemplateInstance,
  from: number,
  count: number,
  to: number,
  warnings: CoreWarning[],
): Result<TemplateInstance> {
  const gate = moveBlockGate(inst, 0, from, count, to)
  if (!gate.ok) return gate
  const next = cloneInstance(inst)
  if (from === to) return ok(next, warnings)
  const grid = next.layout.slotGrid!
  const removed = grid.splice(from, count)
  grid.splice(to, 0, ...removed)
  next.layout.merges = permuteBlockAxisRanges(next.layout.merges, from, count, to, 0)
  next.layout.structuralMerges = permuteBlockAxisRanges(next.layout.structuralMerges, from, count, to, 0)
  next.layout.allowedMerges = permuteBlockAxisRanges(next.layout.allowedMerges, from, count, to, 0)
  next.layout.readonlyCells = permuteBlockCells(next.layout.readonlyCells, from, count, to, 0)
  return ok(next, warnings)
}

/**
 * 整块列换位。比整块行换位多三条结构约束（标签列 / 冻结边界 / 列宽与推荐列跟随）：
 * 列宽 splice 同式搬移，推荐列与推荐位经 permuteBlockIndex 一次重映射。
 */
export function doMoveBlockCol(
  inst: TemplateInstance,
  from: number,
  count: number,
  to: number,
  warnings: CoreWarning[],
): Result<TemplateInstance> {
  const gate = moveBlockGate(inst, 1, from, count, to)
  if (!gate.ok) return gate
  const next = cloneInstance(inst)
  if (from === to) return ok(next, warnings)
  const grid = next.layout.slotGrid!
  for (const row of grid) {
    const removed = row.splice(from, count)
    row.splice(to, 0, ...removed)
  }
  next.layout.merges = permuteBlockAxisRanges(next.layout.merges, from, count, to, 1)
  next.layout.structuralMerges = permuteBlockAxisRanges(next.layout.structuralMerges, from, count, to, 1)
  next.layout.allowedMerges = permuteBlockAxisRanges(next.layout.allowedMerges, from, count, to, 1)
  next.layout.readonlyCells = permuteBlockCells(next.layout.readonlyCells, from, count, to, 1)
  next.layout.recommendableCols = next.layout.recommendableCols?.map((c) =>
    permuteBlockIndex(c, from, count, to),
  )
  if (next.highlight?.recommendCol !== null && next.highlight?.recommendCol !== undefined) {
    next.highlight = { recommendCol: permuteBlockIndex(next.highlight.recommendCol, from, count, to) }
  }
  // 列宽与列一一对应：与 slotGrid 同式 splice，宽度跟着列内容走
  const widths = next.layout.style?.colWidths
  if (widths) {
    const moved = [...widths]
    const chunk = moved.splice(from, count)
    moved.splice(to, 0, ...chunk)
    next.layout.style = { ...next.layout.style, colWidths: moved }
  }
  return ok(next, warnings)
}
