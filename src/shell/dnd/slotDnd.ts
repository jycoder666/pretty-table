import {
  buildVisualRows,
  colWidthAt,
  type BlockType,
  type EditIntent,
  type TemplateInstance,
} from '@/core'

export type DropTarget = {
  blockSlotId: string
  rect: CellRect
  accept: BlockType[]
}

/**
 * 格几何（左/上/宽/高）。PX-04 v2：优先由渲染核提供（滚动/冻结列/列宽调整感知），
 * 无核时回退 estimateCellRects 的内容坐标纯算术。与 DOMRect / core ViewportRect 结构兼容。
 */
export interface CellRect {
  left: number
  top: number
  width: number
  height: number
}

const ROW_HEIGHT = 36
const HEADER_HEIGHT = 36
const BLOCK_HEIGHT = 32

/** 区块类型 → 界面用词（组件库卡片 / 拖拽幽灵 / 表内拖动把手共用一套词） */
export const BLOCK_TYPE_LABEL: Record<BlockType, string> = {
  sectionBar: '分区色条',
  groupHeader: '分组标题行',
  emphFooter: '强调注脚',
  leftTag: '左栏标签块',
}

/** 生效列宽合计（PX-04：与 toOption 渲染同源，colWidths / 默认宽都从这里走） */
export function totalContentWidth(inst: TemplateInstance): number {
  let sum = 0
  for (let c = 0; c < inst.layout.colCount; c++) sum += colWidthAt(inst, c)
  return sum
}

/** Approximate per-cell rects in preview coordinates (origin = host top-left). */
export function estimateCellRects(
  inst: TemplateInstance,
  origin: { left: number; top: number } = { left: 0, top: 0 },
): CellRect[][] {
  const { metas, rowHeights } = buildVisualRows(inst)
  const colCount = inst.layout.colCount
  const rows: CellRect[][] = []
  let y = origin.top
  for (let r = 0; r < metas.length; r++) {
    const h = rowHeights[r] ?? (r < (inst.layout.headerLevels ?? 1) ? HEADER_HEIGHT : ROW_HEIGHT)
    const cols: CellRect[] = []
    let x = origin.left
    for (let c = 0; c < colCount; c++) {
      const w = colWidthAt(inst, c)
      cols.push({ left: x, top: y, width: w, height: h })
      x += w
    }
    rows.push(cols)
    y += h
  }
  return rows
}

/** Drop targets for every `layout.blockSlots` entry, top-to-bottom by visual gap rows. */
export function computeDropTargets(
  inst: TemplateInstance,
  cellRects: CellRect[][],
): DropTarget[] {
  const { blockRowIndexes } = buildVisualRows(inst)
  const orderedVisual = [...blockRowIndexes.entries()].sort((a, b) => a[0] - b[0])
  const seen = new Set<string>()
  const targets: DropTarget[] = []

  for (const [visualRow, slotId] of orderedVisual) {
    const def = inst.layout.blockSlots.find((s) => s.id === slotId)
    if (!def) continue
    const row = cellRects[visualRow]
    if (!row?.length) continue
    const first = row[0]!
    const last = row[row.length - 1]!
    const left = first.left
    const top = first.top
    const width = last.left + last.width - first.left
    const height = first.height || BLOCK_HEIGHT
    targets.push({
      blockSlotId: slotId,
      rect: { left, top, width, height },
      accept: [...def.accept],
    })
    seen.add(slotId)
  }

  // Remaining slots (footer / left-tag) — park below content so resolveDrop still works
  let bottom = 0
  for (const row of cellRects) {
    for (const cell of row) bottom = Math.max(bottom, cell.top + cell.height)
  }
  for (const def of inst.layout.blockSlots) {
    if (seen.has(def.id)) continue
    targets.push({
      blockSlotId: def.id,
      rect: { left: 0, top: bottom, width: totalContentWidth(inst), height: BLOCK_HEIGHT },
      accept: [...def.accept],
    })
    bottom += BLOCK_HEIGHT
  }

  return targets
}

export function resolveDrop(
  target: DropTarget | null,
  type: BlockType,
): EditIntent | { reject: 'SLOT_DROP_BLOCKED' | 'BLOCK_TYPE_REJECT' } {
  if (!target) return { reject: 'SLOT_DROP_BLOCKED' }
  if (!target.accept.includes(type)) return { reject: 'BLOCK_TYPE_REJECT' }
  return {
    kind: 'addBlock',
    block: {
      id: 'pending',
      type,
      slotId: target.blockSlotId,
      props: {},
    },
  }
}
