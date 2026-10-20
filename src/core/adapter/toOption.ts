import type { Align, Emphasis, MergeRange, RenderContext, SlotValue, TemplateInstance } from '../types'
import { resolveTheme, type Palette } from '../theme/palettes'
import { toVTableTheme } from '../theme/vtableTheme'
import { FONT_STACK } from '../theme/font'

const COL_WIDTH = 140
const LABEL_WIDTH = 120
const ROW_HEIGHT = 36
const HEADER_HEIGHT = 36
const BLOCK_HEIGHT = 32

export type CellMeta = {
  slotId: string | null
  role: 'header' | 'body' | 'label' | 'block' | 'readonly'
  text: string
  align?: Align
  emphasize?: Emphasis[]
  isPlaceholder?: boolean
}

function slotParts(v: SlotValue | undefined): { text: string; align?: Align; emphasize?: Emphasis[] } {
  if (v === undefined || v === null) return { text: '' }
  if (typeof v === 'object' && 'text' in v) {
    const em = v.emphasize
    return {
      text: String(v.text ?? ''),
      align: v.align,
      emphasize: Array.isArray(em) ? em : em ? [em] : undefined,
    }
  }
  return { text: String(v) }
}

function gapAfterSet(inst: TemplateInstance): Set<number> {
  const gapAfter = new Set<number>()
  for (const def of inst.layout.blockSlots) {
    if (def.rowHint === 'after-1') gapAfter.add(1)
    if (def.rowHint === 'after-5') gapAfter.add(5)
  }
  return gapAfter
}

export function buildVisualRows(inst: TemplateInstance): {
  metas: CellMeta[][]
  rowHeights: number[]
  blockRowIndexes: Map<number, string>
} {
  const grid = inst.layout.slotGrid ?? []
  const colCount = inst.layout.colCount
  const headerLevels = inst.layout.headerLevels ?? 1
  const metas: CellMeta[][] = []
  const rowHeights: number[] = []
  const blockRowIndexes = new Map<number, string>()
  const gapAfter = new Map<number, string>()
  for (const def of inst.layout.blockSlots) {
    if (def.rowHint === 'after-1') gapAfter.set(1, def.id)
    if (def.rowHint === 'after-5') gapAfter.set(5, def.id)
  }

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] ?? []
    const metaRow: CellMeta[] = []
    for (let c = 0; c < colCount; c++) {
      const sid = row[c] ?? null
      const readonly = inst.layout.readonlyCells?.some(([rr, cc]) => rr === r && cc === c)
      let text = ''
      let align: Align | undefined
      let emphasize: Emphasis[] | undefined
      let isPlaceholder = false
      let role: CellMeta['role'] = r < headerLevels ? 'header' : c === 0 ? 'label' : 'body'

      if (r === 0 && c === 0 && inst.meta?.templateType === 'compare') {
        text = '项目'
        role = 'header'
      } else if (r === 1 && inst.meta?.templateType === 'detail') {
        text = c === 0 ? '项目' : c === 1 ? '说明' : '备注'
        role = 'header'
      } else if (sid) {
        const parts = slotParts(inst.slots[sid])
        text = parts.text
        align = parts.align
        emphasize = parts.emphasize
        if (text === '') {
          isPlaceholder = true
          text = '填写内容'
        }
        if (readonly) role = 'readonly'
      } else if (readonly) {
        role = 'readonly'
      }

      metaRow.push({ slotId: sid, role, text, align, emphasize, isPlaceholder })
    }
    metas.push(metaRow)
    rowHeights.push(r < headerLevels ? HEADER_HEIGHT : ROW_HEIGHT)

    const gapId = gapAfter.get(r)
    if (gapId) {
      const block = inst.blocks.find((b) => b.slotId === gapId)
      const label =
        block?.type === 'sectionBar'
          ? String(block.props?.label ?? '分区')
          : block
            ? String(block.props?.text ?? '分组标题')
            : '（可拖入分区色条 / 分组标题）'
      const blockRow: CellMeta[] = Array.from({ length: colCount }, (_, c) => ({
        slotId: c === 0 ? gapId : null,
        role: block ? 'block' : 'body',
        text: c === 0 ? label : '',
        isPlaceholder: !block,
      }))
      blockRowIndexes.set(metas.length, gapId)
      metas.push(blockRow)
      rowHeights.push(BLOCK_HEIGHT)
    }
  }

  return { metas, rowHeights, blockRowIndexes }
}

export function remapMerges(
  inst: TemplateInstance,
  blockRowIndexes: Map<number, string>,
): MergeRange[] {
  const gapAfter = gapAfterSet(inst)
  const logicalToVisual = new Map<number, number>()
  let visual = 0
  const gridLen = inst.layout.slotGrid?.length ?? inst.layout.rowCount
  for (let r = 0; r < gridLen; r++) {
    logicalToVisual.set(r, visual)
    visual += 1
    if (gapAfter.has(r)) visual += 1
  }

  const mapRange = (m: MergeRange): MergeRange => ({
    start: [logicalToVisual.get(m.start[0]) ?? m.start[0], m.start[1]],
    end: [logicalToVisual.get(m.end[0]) ?? m.end[0], m.end[1]],
  })

  const merges = [...(inst.layout.merges ?? []), ...(inst.layout.structuralMerges ?? [])]
  const blockMerges: MergeRange[] = []
  for (const [vr] of blockRowIndexes) {
    blockMerges.push({ start: [vr, 0], end: [vr, inst.layout.colCount - 1] })
  }
  return [...merges.map(mapRange), ...blockMerges]
}

function styleForCell(
  cell: CellMeta,
  palette: Palette,
  zebraOn: boolean,
  row: number,
  mode: RenderContext['mode'],
): Record<string, unknown> {
  const style: Record<string, unknown> = {
    fontFamily: FONT_STACK,
    fontSize: 13,
    borderColor: palette.border,
    borderLineWidth: 1,
    padding: [8, 10, 8, 10],
  }
  if (cell.role === 'header') {
    style.bgColor = palette.primary
    style.color = palette.headerText
    style.fontWeight = 'bold'
  } else if (cell.role === 'block') {
    style.bgColor = palette.primary
    style.color = palette.headerText
    style.fontWeight = 600
    style.textAlign = 'left'
  } else {
    const zebra = zebraOn && row % 2 === 1
    style.bgColor = zebra ? palette.zebra : palette.paper
    style.color = '#1a1a1a'
    if (cell.role === 'label' || cell.role === 'readonly') style.fontWeight = 600
  }
  if (cell.align) style.textAlign = cell.align
  const em = cell.emphasize ?? []
  if (em.includes('bold')) style.fontWeight = 700
  if (em.includes('red')) style.color = palette.emphasis
  if (em.includes('bg')) style.bgColor = palette.emphasisSoft
  if (cell.isPlaceholder && mode === 'preview') {
    style.color = '#9aa3af'
    style.fontStyle = 'italic'
  }
  return style
}

export function toOption(inst: TemplateInstance, ctx: RenderContext): Record<string, unknown> {
  const { palette, zebraOn } = resolveTheme(inst.themeId, inst.themeTokens)
  const effectiveZebra = inst.zebraOn === false ? false : zebraOn
  const { metas, rowHeights, blockRowIndexes } = buildVisualRows(inst)
  const merges = remapMerges(inst, blockRowIndexes)
  const colCount = inst.layout.colCount

  const records = metas.map((row) => {
    const rec: Record<string, string> = {}
    row.forEach((cell, c) => {
      rec[`c${c}`] = cell.text
    })
    return rec
  })

  const columns = Array.from({ length: colCount }, (_, c) => ({
    field: `c${c}`,
    title: ' ',
    width: c === 0 ? LABEL_WIDTH : COL_WIDTH,
    style: (args: { row: number; col: number }) => {
      const cell = metas[args.row]?.[args.col]
      if (!cell) return {}
      return styleForCell(cell, palette, effectiveZebra, args.row, ctx.mode)
    },
  }))

  const theme = toVTableTheme(palette, {
    zebraOn: effectiveZebra,
    transparentUnderlay: ctx.transparentUnderlay,
  })

  const customMergeCell = (col: number, row: number) => {
    for (const m of merges) {
      if (row >= m.start[0] && row <= m.end[0] && col >= m.start[1] && col <= m.end[1]) {
        const text = metas[m.start[0]]?.[m.start[1]]?.text ?? ''
        return {
          text: row === m.start[0] && col === m.start[1] ? text : '',
          range: {
            start: { col: m.start[1], row: m.start[0] },
            end: { col: m.end[1], row: m.end[0] },
          },
        }
      }
    }
    return undefined
  }

  return {
    records,
    columns,
    widthMode: 'standard',
    heightMode: 'standard',
    defaultRowHeight: ROW_HEIGHT,
    defaultHeaderRowHeight: 0,
    showHeader: false,
    frozenColCount: inst.layout.frozenColCount ?? 0,
    theme,
    rowSeriesNumber: false,
    animationAppear: false,
    customMergeCell,
    __pt: {
      metas,
      rowHeights,
      blockRowIndexes: Object.fromEntries(blockRowIndexes),
      palette,
      font: FONT_STACK,
      contentWidth: LABEL_WIDTH + COL_WIDTH * Math.max(0, colCount - 1),
      contentHeight: rowHeights.reduce((a, b) => a + b, 0),
      mode: ctx.mode,
      merges,
    },
  }
}

export function measureContentSize(inst: TemplateInstance): { width: number; height: number } {
  const opt = toOption(inst, { mode: 'export' })
  const pt = opt.__pt as { contentWidth: number; contentHeight: number }
  return { width: pt.contentWidth + 2, height: pt.contentHeight + 2 }
}

export function findSlotAtVisual(
  inst: TemplateInstance,
  visualRow: number,
  col: number,
): { slotId: string | null; isBlockSlot: boolean } {
  const { metas, blockRowIndexes } = buildVisualRows(inst)
  const cell = metas[visualRow]?.[col]
  const blockSlot = blockRowIndexes.get(visualRow)
  return { slotId: cell?.slotId ?? null, isBlockSlot: Boolean(blockSlot) }
}

/** Map a visual body row index back to logical slotGrid row, or null if it is a block row. */
export function visualToLogicalRow(inst: TemplateInstance, visualRow: number): number | null {
  const gapAfter = gapAfterSet(inst)
  let visual = 0
  const gridLen = inst.layout.slotGrid?.length ?? inst.layout.rowCount
  for (let r = 0; r < gridLen; r++) {
    if (visual === visualRow) return r
    visual += 1
    if (gapAfter.has(r)) {
      if (visual === visualRow) return null
      visual += 1
    }
  }
  return null
}
