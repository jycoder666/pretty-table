import { fail, ok, type CoreWarning, type Result } from '../errors'
import type { TemplateInstance } from '../types'
import { cloneInstance } from '../schema/validate'
import { permuteAxisRanges, permuteCells, permuteIndex, survivesPermute } from './remap'

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
