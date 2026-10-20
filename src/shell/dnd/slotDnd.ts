import {
  buildVisualRows,
  type BlockType,
  type EditIntent,
  type TemplateInstance,
} from '@/core'

export type DropTarget = {
  blockSlotId: string
  rect: DOMRect
  accept: BlockType[]
}

const COL_WIDTH = 140
const LABEL_WIDTH = 120
const ROW_HEIGHT = 36
const HEADER_HEIGHT = 36
const BLOCK_HEIGHT = 32

/** Approximate per-cell DOMRects in preview coordinates (origin = host top-left). */
export function estimateCellRects(
  inst: TemplateInstance,
  origin: { left: number; top: number } = { left: 0, top: 0 },
): DOMRect[][] {
  const { metas, rowHeights } = buildVisualRows(inst)
  const colCount = inst.layout.colCount
  const rows: DOMRect[][] = []
  let y = origin.top
  for (let r = 0; r < metas.length; r++) {
    const h = rowHeights[r] ?? (r < (inst.layout.headerLevels ?? 1) ? HEADER_HEIGHT : ROW_HEIGHT)
    const cols: DOMRect[] = []
    let x = origin.left
    for (let c = 0; c < colCount; c++) {
      const w = c === 0 ? LABEL_WIDTH : COL_WIDTH
      cols.push(new DOMRect(x, y, w, h))
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
  cellRects: DOMRect[][],
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
    const width = last.right - first.left
    const height = first.height || BLOCK_HEIGHT
    targets.push({
      blockSlotId: slotId,
      rect: new DOMRect(left, top, width, height),
      accept: [...def.accept],
    })
    seen.add(slotId)
  }

  // Remaining slots (footer / left-tag) — park below content so resolveDrop still works
  let bottom = 0
  for (const row of cellRects) {
    for (const cell of row) bottom = Math.max(bottom, cell.bottom)
  }
  for (const def of inst.layout.blockSlots) {
    if (seen.has(def.id)) continue
    targets.push({
      blockSlotId: def.id,
      rect: new DOMRect(0, bottom, LABEL_WIDTH + COL_WIDTH * Math.max(0, inst.layout.colCount - 1), BLOCK_HEIGHT),
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
