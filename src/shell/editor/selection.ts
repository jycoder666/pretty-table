import { findMergeAt, type MergeRange, type TemplateInstance } from '@/core'
import type { CellRect } from '../dnd/slotDnd'

/**
 * R-2 Shift 矩形选区（交互升级 T04，纯壳层）：
 * 点起点格后按住 Shift 点终点格 → 两点围成矩形（逐轴 min/max 归一化，非法顺序天然修正）。
 */

/** 以既有选区起点为基准，把 Shift 点击的（逻辑行, 列）扩展成矩形选区 */
export function expandRectSelection(
  base: MergeRange,
  logicalRow: number,
  col: number,
): MergeRange {
  return {
    start: [Math.min(base.start[0], logicalRow), Math.min(base.start[1], col)],
    end: [Math.max(base.start[0], logicalRow), Math.max(base.start[1], col)],
  }
}

export interface SelectionRect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * 逻辑行 → 可视行（区块行占位与 remapMerges 同一套 after-N gap 机制）；
 * 逻辑行不在网格内返回 null。就地编辑浮层定位（WP3）与选区描边共用。
 */
export function logicalToVisualRow(inst: TemplateInstance, logicalRow: number): number | null {
  const gapAfter = new Set<number>()
  for (const def of inst.layout.blockSlots) {
    const m = /^after-(\d+)$/.exec(def.rowHint ?? '')
    if (m) gapAfter.add(Number(m[1]))
  }
  const gridLen = inst.layout.slotGrid?.length ?? inst.layout.rowCount
  if (logicalRow < 0 || logicalRow >= gridLen) return null
  let visual = 0
  for (let r = 0; r < gridLen; r++) {
    if (r === logicalRow) return visual
    visual += 1
    if (gapAfter.has(r)) visual += 1
  }
  return null
}

/**
 * 选区可视化：把逻辑选区映射到可视格矩形（壳叠加层描边）。
 * 逻辑行 → 可视行的位移与 remapMerges 同一套 after-N gap 机制。
 * 格几何由调用方传入（PX-04 v2：优先渲染核视口坐标——滚动/冻结列/列宽调整感知；
 * 无核回退 estimateCellRects 内容坐标）。
 * WP1：同属一个合并区的格并成一个外接矩形——合并成功后描边立刻收成一块，
 * 与渲染出来的视觉格一致（逐格描边会在合并区内部留下并不存在的分隔线）。
 */
export function selectionCellRects(
  inst: TemplateInstance,
  sel: MergeRange,
  cellRects: CellRect[][],
): SelectionRect[] {
  const cells = cellRects
  // 合并区身份分组：同键格的矩形并成外接矩形；未合并格各自成块（键含可视行列保证唯一）
  const groups = new Map<string, SelectionRect>()
  for (let r = sel.start[0]; r <= sel.end[0]; r++) {
    const vr = logicalToVisualRow(inst, r)
    if (vr === null) continue
    for (let c = sel.start[1]; c <= sel.end[1]; c++) {
      const rect = cells[vr]?.[c]
      if (!rect) continue
      const m = findMergeAt(inst.layout, r, c)
      const key = m ? `m:${m.start[0]},${m.start[1]}-${m.end[0]},${m.end[1]}` : `c:${vr},${c}`
      const g = groups.get(key)
      if (!g) {
        groups.set(key, { left: rect.left, top: rect.top, width: rect.width, height: rect.height })
        continue
      }
      const left = Math.min(g.left, rect.left)
      const top = Math.min(g.top, rect.top)
      const right = Math.max(g.left + g.width, rect.left + rect.width)
      const bottom = Math.max(g.top + g.height, rect.top + rect.height)
      groups.set(key, { left, top, width: right - left, height: bottom - top })
    }
  }
  return [...groups.values()]
}

/**
 * 整行/整列选择的叠加矩形（增量设计 A5）：
 * 复用 selectionCellRects 的合并分组与逻辑→可视行映射，仅合成同轴全域选区。
 * 整行 = 该逻辑行可视行整条；整列 = 该列所有可视行矩形并块。
 */
export function structuralRects(
  inst: TemplateInstance,
  axis: 'row' | 'col',
  index: number,
  cellRects: CellRect[][],
): SelectionRect[] {
  const range: MergeRange =
    axis === 'row'
      ? { start: [index, 0], end: [index, inst.layout.colCount - 1] }
      : { start: [0, index], end: [inst.layout.rowCount - 1, index] }
  return selectionCellRects(inst, range, cellRects)
}
