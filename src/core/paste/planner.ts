import { fail, ok, type Result } from '../errors'
import type { CellCoord, TemplateInstance } from '../types'
import type { PasteGrid } from './parser'

/** 可见网格（Q-020）：逻辑网格 + 已声明 between-rows 区块的整行（与用户看到的行一一对应） */

export type VisibleRow =
  | { kind: 'logical'; logicalRow: number }
  | { kind: 'block'; blockSlotId: string }

export function buildVisibleGrid(inst: TemplateInstance): VisibleRow[] {
  const rows: VisibleRow[] = []
  const grid = inst.layout.slotGrid
  const gridLen = grid?.length ?? inst.layout.rowCount
  const gaps = new Map<number, string>()
  for (const def of inst.layout.blockSlots) {
    const m = /^after-(\d+)$/.exec(def.rowHint ?? '')
    if (m) gaps.set(Number(m[1]), def.id)
  }
  for (let r = 0; r < gridLen; r++) {
    rows.push({ kind: 'logical', logicalRow: r })
    const gid = gaps.get(r)
    if (gid) rows.push({ kind: 'block', blockSlotId: gid })
  }
  return rows
}

export interface PastePlanCell {
  /** 目标可见网格行/列 */
  row: number
  col: number
  slotId: string | null
  raw: string
  kind: 'value' | 'empty'
}

export interface PastePlan {
  anchor: CellCoord
  size: { h: number; w: number }
  cells: PastePlanCell[]
  baseVersion: number
}

/**
 * 落位（设计增量 §2.2）：从起点向右向下；先在可见网格上定位，再映射回逻辑槽。
 * anchor 必须是可见网格内可写槽（区块行 / null 格 / 越界 → PASTE_NO_ANCHOR）。
 * 模板缺 slotGrid → PASTE_UNSUPPORTED（旧模板且迁移不了）。
 */
export function planPaste(
  inst: TemplateInstance,
  version: number,
  anchor: CellCoord,
  grid: PasteGrid,
): Result<PastePlan> {
  if (!inst.layout.slotGrid) {
    return fail('PASTE_UNSUPPORTED', '这张模板暂不支持粘贴填充', { templateId: inst.templateId })
  }
  const visible = buildVisibleGrid(inst)
  const [r0, c0] = anchor
  if (
    r0 < 0 ||
    c0 < 0 ||
    r0 >= visible.length ||
    c0 >= inst.layout.colCount
  ) {
    return fail('PASTE_NO_ANCHOR', '这个格子不能填写，请选一个可填写的格子作为起点')
  }
  const anchorRow = visible[r0]!
  if (anchorRow.kind === 'block') {
    return fail('PASTE_NO_ANCHOR', '这个格子不能填写，请选一个可填写的格子作为起点')
  }
  const anchorSlot = inst.layout.slotGrid[anchorRow.logicalRow]?.[c0] ?? null
  if (!anchorSlot) {
    return fail('PASTE_NO_ANCHOR', '这个格子不能填写，请选一个可填写的格子作为起点')
  }

  const cells: PastePlanCell[] = grid.cells.map((cell) => {
    const vr = r0 + cell.r
    const vc = c0 + cell.c
    const t = visible[vr]
    const slotId =
      t && t.kind === 'logical' ? (inst.layout.slotGrid![t.logicalRow]?.[vc] ?? null) : null
    return { row: vr, col: vc, slotId, raw: cell.raw, kind: cell.kind }
  })
  return ok({ anchor: [r0, c0], size: { h: grid.h, w: grid.w }, cells, baseVersion: version })
}
