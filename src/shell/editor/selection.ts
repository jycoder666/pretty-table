import type { MergeRange, TemplateInstance } from '@/core'
import { estimateCellRects } from '../dnd/slotDnd'

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
 * 选区可视化：把逻辑选区映射到可视格矩形（壳叠加层描边）。
 * 逻辑行 → 可视行的位移与 remapMerges 同一套 after-N gap 机制；格子几何与
 * estimateCellRects（渲染定位）同源。合并区选区按逻辑坐标逐格展开，描边覆盖其可视格。
 */
export function selectionCellRects(
  inst: TemplateInstance,
  sel: MergeRange,
): SelectionRect[] {
  const cells = estimateCellRects(inst)
  const gapAfter = new Set<number>()
  for (const def of inst.layout.blockSlots) {
    const m = /^after-(\d+)$/.exec(def.rowHint ?? '')
    if (m) gapAfter.add(Number(m[1]))
  }
  const logicalToVisual = new Map<number, number>()
  let visual = 0
  const gridLen = inst.layout.slotGrid?.length ?? inst.layout.rowCount
  for (let r = 0; r < gridLen; r++) {
    logicalToVisual.set(r, visual)
    visual += 1
    if (gapAfter.has(r)) visual += 1
  }
  const out: SelectionRect[] = []
  for (let r = sel.start[0]; r <= sel.end[0]; r++) {
    const vr = logicalToVisual.get(r)
    if (vr === undefined) continue
    for (let c = sel.start[1]; c <= sel.end[1]; c++) {
      const rect = cells[vr]?.[c]
      if (rect) {
        out.push({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
      }
    }
  }
  return out
}
