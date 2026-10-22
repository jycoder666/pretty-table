import {
  findMergeAt,
  getSlotDisplayText,
  isImageDataUrl,
  type Align,
  type MergeRange,
  type TemplateInstance,
} from '@/core'
import { logicalToVisualRow } from './selection'

/**
 * WP3 键盘导航（纯函数，无 DOM）：画布聚焦后方向键 / Tab 移动选区，
 * 落到合并区自动扩成整块（与点击选格同口径），越界保持原位不绕行。
 */

export interface CellPos {
  row: number
  col: number
}

export function gridSize(inst: TemplateInstance): { rows: number; cols: number } {
  const grid = inst.layout.slotGrid
  return {
    rows: grid?.length ?? inst.layout.rowCount,
    cols: grid?.[0]?.length ?? inst.layout.colCount,
  }
}

function inGrid(inst: TemplateInstance, row: number, col: number): boolean {
  const { rows, cols } = gridSize(inst)
  return row >= 0 && row < rows && col >= 0 && col < cols
}

/** 单格选区：落在合并区上就整块选中（点击选格同口径） */
export function cellSelection(inst: TemplateInstance, row: number, col: number): MergeRange {
  const merge = findMergeAt(inst.layout, row, col)
  return merge ?? { start: [row, col], end: [row, col] }
}

/** 归一化（逐轴 min/max），保证 start ≤ end */
function normalize(sel: MergeRange): MergeRange {
  return {
    start: [Math.min(sel.start[0], sel.end[0]), Math.min(sel.start[1], sel.end[1])],
    end: [Math.max(sel.start[0], sel.end[0]), Math.max(sel.start[1], sel.end[1])],
  }
}

/**
 * 方向键：折叠到选区起点格的相邻格（Excel 语义——多格选区按方向键收回单格）。
 * 目标越界 → 选区不动；目标落在合并区 → 扩成整块。
 */
export function moveSelection(
  inst: TemplateInstance,
  sel: MergeRange,
  dr: number,
  dc: number,
): MergeRange {
  const cur = normalize(sel)
  const row = cur.start[0] + dr
  const col = cur.start[1] + dc
  if (!inGrid(inst, row, col)) return cur
  return cellSelection(inst, row, col)
}

/**
 * Shift+方向键：把选区终点沿方向扩一格（起点锚定不动）。
 * 越界不扩；新终点落在合并区 → 终点扩到该合并区边界。
 */
export function extendSelection(
  inst: TemplateInstance,
  sel: MergeRange,
  dr: number,
  dc: number,
): MergeRange {
  const cur = normalize(sel)
  let row = cur.end[0] + dr
  let col = cur.end[1] + dc
  if (!inGrid(inst, row, col)) return cur
  const merge = findMergeAt(inst.layout, row, col)
  if (merge) {
    row = merge.end[0]
    col = merge.end[1]
  }
  return normalize({ start: [cur.start[0], cur.start[1]], end: [row, col] })
}

/** Tab / Shift+Tab：右移一格，行末绕到下一行行首（反向则上一行行末）；到头保持原位 */
export function tabSelection(inst: TemplateInstance, sel: MergeRange, back = false): MergeRange {
  const cur = normalize(sel)
  const { cols } = gridSize(inst)
  let row = cur.start[0]
  let col = cur.start[1]
  if (back) {
    col -= 1
    if (col < 0) {
      row -= 1
      col = cols - 1
    }
  } else {
    col += 1
    if (col >= cols) {
      row += 1
      col = 0
    }
  }
  if (!inGrid(inst, row, col)) return cur
  return cellSelection(inst, row, col)
}

/**
 * 格文案（图片格不出值——data URL 不该进剪贴板；标记/数值槽走核内显示文案）。
 * `raw`：就地编辑需要原始可编辑文案（数值 3 而不是「3 元」这类带格式的显示值）。
 */
function cellText(inst: TemplateInstance, row: number, col: number, raw = false): string {
  const sid = inst.layout.slotGrid?.[row]?.[col]
  if (!sid) return ''
  const v = inst.slots[sid]
  if (typeof v === 'string' && isImageDataUrl(v)) return ''
  if (v && typeof v === 'object' && 'image' in v) return ''
  if (raw) {
    if (typeof v === 'string') return v
    if (v && typeof v === 'object' && 'text' in v) return String(v.text ?? '')
    if (v && typeof v === 'object' && 'num' in v) {
      return v.num === null || v.num === undefined ? '' : String(v.num)
    }
    return ''
  }
  return getSlotDisplayText(v, '')
}

/**
 * 选区 → TSV（Ctrl+C 口径）：逻辑网格逐格取值，行 \n、列 \t。
 * 合并区只在左上角出值（其余格留空），与粘贴回读的「合并区其余格为空」一致。
 */
export function selectionToTsv(inst: TemplateInstance, sel: MergeRange): string {
  const cur = normalize(sel)
  const lines: string[] = []
  for (let r = cur.start[0]; r <= cur.end[0]; r++) {
    const cells: string[] = []
    for (let c = cur.start[1]; c <= cur.end[1]; c++) {
      const merge = findMergeAt(inst.layout, r, c)
      if (merge && (r !== merge.start[0] || c !== merge.start[1])) {
        cells.push('')
        continue
      }
      cells.push(cellText(inst, r, c))
    }
    lines.push(cells.join('\t'))
  }
  return lines.join('\n')
}

/** 就地编辑的可编辑性判定结果 */
export type EditableCell =
  | { kind: 'text'; slotId: string; text: string; align: Align }
  | { kind: 'readonly' }
  | { kind: 'image' }
  | { kind: 'typed' }
  | { kind: 'empty' }

function alignOf(v: unknown): Align {
  if (v && typeof v === 'object' && 'align' in v) {
    const a = (v as { align?: unknown }).align
    if (a === 'center' || a === 'right' || a === 'left') return a
  }
  return 'left'
}

/**
 * 就地编辑目标（WP3 双击 / 直接键入）：
 * - 合并区落在左上格（其余格内容与渲染同源取左上格槽）
 * - 只读格 → readonly（模板固定，提示不可改）
 * - 图片格 → image（改图走右栏上传/替换，打字会覆盖图片）
 * - 标记/数值槽 → typed（语义值，改值走右栏，不用文本框接管）
 * - 无槽位（区块行 / 越界）→ empty
 */
export function editableCellAt(inst: TemplateInstance, row: number, col: number): EditableCell {
  if (!inGrid(inst, row, col)) return { kind: 'empty' }
  const merge = findMergeAt(inst.layout, row, col)
  const r = merge ? merge.start[0] : row
  const c = merge ? merge.start[1] : col
  // 只读判定先于槽位判定：模板固定格（如预设表头标签）常常本身就没有槽位，
  // 先说「模板固定不能改」比「这里没内容」更贴近用户看到的东西。
  const readonly = (inst.layout.readonlyCells ?? []).some(([rr, cc]) => rr === r && cc === c)
  if (readonly) return { kind: 'readonly' }
  const sid = inst.layout.slotGrid?.[r]?.[c]
  if (!sid) return { kind: 'empty' }
  const v = inst.slots[sid]
  if (typeof v === 'string' && isImageDataUrl(v)) return { kind: 'image' }
  if (v && typeof v === 'object' && 'image' in v) return { kind: 'image' }
  if (v && typeof v === 'object' && ('mark' in v || 'num' in v)) return { kind: 'typed' }
  return { kind: 'text', slotId: sid, text: cellText(inst, r, c, true), align: alignOf(v) }
}

/** 就地编辑浮层定位用的可视行（区块行不在逻辑网格 → null） */
export function visualRowOfCell(inst: TemplateInstance, row: number): number | null {
  return logicalToVisualRow(inst, row)
}
