import { parseMark } from '../format/formatTokens'
import { parseNumeric } from '../format/parseNumeric'
import type { Align, Emphasis, SlotValue, TemplateInstance } from '../types'
import type { CoreError, CoreWarning } from '../errors'
import { buildVisibleGrid, type PastePlan } from './planner'

/**
 * 粘贴校验（设计增量 §2.3，Q-020）：
 * - 序 4～7 全部检查、一并报告：HITS_MERGED → HITS_BLOCK → HITS_LOCKED → OUT_OF_RANGE
 * - 主码 = errors[0].code；整块拒收；不截断、不扩表
 * - 区块/合并/锁定只检查落在可见网格内的部分（超出部分不重复报）
 * - 通过后按槽类型换算语义值；读不成的格按文字写入并产出 PASTE_NOTICE_AS_TEXT（不拒收，Q-011）
 */

export interface ValidatedPastePlan extends PastePlan {
  writes: { slotId: string; value: SlotValue }[]
  notices: CoreWarning[]
}

export type PasteValidation =
  | { ok: true; value: ValidatedPastePlan }
  | { ok: false; errors: CoreError[] }

type Rect = { r0: number; r1: number; c0: number; c1: number }

function logicalToVisible(inst: TemplateInstance): Map<number, number> {
  const map = new Map<number, number>()
  buildVisibleGrid(inst).forEach((row, i) => {
    if (row.kind === 'logical') map.set(row.logicalRow, i)
  })
  return map
}

function rangeIntersectsRect(
  range: { start: [number, number]; end: [number, number] },
  rect: Rect,
  logicalToVis: Map<number, number>,
): boolean {
  const r0 = logicalToVis.get(range.start[0])
  const r1 = logicalToVis.get(range.end[0])
  if (r0 === undefined || r1 === undefined) return false
  return r0 <= rect.r1 && r1 >= rect.r0 && range.start[1] <= rect.c1 && range.end[1] >= rect.c0
}

function prevStyle(v: SlotValue | undefined): { align?: Align; emphasize?: Emphasis[] } {
  if (typeof v === 'object' && v !== null) {
    const em = v.emphasize
    return {
      align: v.align,
      emphasize: Array.isArray(em) ? em : em ? [em] : undefined,
    }
  }
  return {}
}

/** 按槽类型与 format 把 raw 换算成语义值（Q-011）；读不成 → 按文字 + notice */
function convertCell(
  inst: TemplateInstance,
  slotId: string,
  raw: string,
): { value: SlotValue; notice: boolean } {
  const def = inst.slotDefs?.[slotId]
  const kind = def?.kind ?? 'text'
  const st = prevStyle(inst.slots[slotId])
  if (kind === 'mark') {
    const m = parseMark(raw)
    if (m) return { value: { mark: m, ...st }, notice: false }
    return { value: { text: raw, ...st }, notice: true }
  }
  if (kind === 'number') {
    const r = parseNumeric(raw, def?.format ?? 'number')
    if (r.ok) return { value: { num: r.value, ...st }, notice: false }
    return { value: { text: raw, ...st }, notice: true }
  }
  return { value: { text: raw, ...st }, notice: false }
}

export function validatePaste(inst: TemplateInstance, plan: PastePlan): PasteValidation {
  const visible = buildVisibleGrid(inst)
  const colCount = inst.layout.colCount
  const [r0, c0] = plan.anchor
  const size = plan.size
  // 目标矩形裁剪到可见网格内（超出部分由 OUT_OF_RANGE 报告，不重复检查 4～6）
  const rect: Rect = {
    r0,
    r1: Math.min(r0 + size.h - 1, visible.length - 1),
    c0,
    c1: Math.min(c0 + size.w - 1, colCount - 1),
  }
  const errors: CoreError[] = []

  // 序 4：合并格
  const logicalToVis = logicalToVisible(inst)
  const merges = [...(inst.layout.merges ?? []), ...(inst.layout.structuralMerges ?? [])]
  const hitMerges = merges.filter((m) => rangeIntersectsRect(m, rect, logicalToVis))
  if (hitMerges.length > 0) {
    errors.push({
      code: 'PASTE_HITS_MERGED',
      message: '这块区域里有合并的格子，没法按格填入。请先拆分，或换个起点',
      details: { merges: hitMerges },
    })
  }

  // 序 5：区块行（E-1 默认启用整块拒收）
  const blockSlotIds: string[] = []
  for (let r = rect.r0; r <= rect.r1; r++) {
    const row = visible[r]
    if (row && row.kind === 'block') blockSlotIds.push(row.blockSlotId)
  }
  if (blockSlotIds.length > 0) {
    errors.push({
      code: 'PASTE_HITS_BLOCK',
      message: '这块区域跨过了分区色条，没法连着填。请分两次粘贴，或先移除色条',
      details: { blockSlotId: blockSlotIds[0], blockSlotIds: [...new Set(blockSlotIds)] },
    })
  }

  // 序 6：锁定格 / 模板固定格（仅可见网格内部分；区块行由序 5 报告，不重复计锁定）
  const lockedCells: { row: number; col: number; slotId: string | null }[] = []
  for (const cell of plan.cells) {
    if (cell.row > rect.r1 || cell.col > rect.c1) continue
    const targetRow = visible[cell.row]
    if (targetRow && targetRow.kind === 'block') continue
    if (cell.slotId === null || inst.slotDefs?.[cell.slotId]?.locked === true) {
      lockedCells.push({ row: cell.row, col: cell.col, slotId: cell.slotId })
    }
  }
  if (lockedCells.length > 0) {
    errors.push({
      code: 'PASTE_HITS_LOCKED',
      message: '这块区域里有模板固定的格子（不能改），请换个起点',
      details: { cells: lockedCells },
    })
  }

  // 序 7：超出（按可见网格算，区块行算 1 行；不扩表 → 拒收）
  const extraRows = Math.max(0, r0 + size.h - visible.length)
  const extraCols = Math.max(0, c0 + size.w - colCount)
  if (extraRows > 0 || extraCols > 0) {
    errors.push({
      code: 'PASTE_OUT_OF_RANGE',
      message: '放不下：表格不会自动加行列，请少复制一些，或换个起点',
      details: { extraRows, extraCols },
    })
  }

  if (errors.length > 0) return { ok: false, errors }

  // 换算（步 6）：空格写空；其余按槽类型换算；notice 不拒收（Q-010：percent 裸数字不提醒）
  const writes: { slotId: string; value: SlotValue }[] = []
  const noticeCells: { row: number; col: number; slotId: string }[] = []
  for (const cell of plan.cells) {
    if (!cell.slotId) continue
    if (cell.kind === 'empty') {
      writes.push({ slotId: cell.slotId, value: { text: '', ...prevStyle(inst.slots[cell.slotId]) } })
      continue
    }
    const { value, notice } = convertCell(inst, cell.slotId, cell.raw)
    writes.push({ slotId: cell.slotId, value })
    if (notice) noticeCells.push({ row: cell.row, col: cell.col, slotId: cell.slotId })
  }
  const notices: CoreWarning[] =
    noticeCells.length > 0
      ? [
          {
            code: 'PASTE_NOTICE_AS_TEXT',
            message: `其中 ${noticeCells.length} 格按文字填入`,
            details: { cells: noticeCells },
          },
        ]
      : []

  return { ok: true, value: { ...plan, writes, notices } }
}
