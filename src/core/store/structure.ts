import { fail, ok, type CoreWarning, type Result } from '../errors'
import type { BlockDesc, CellCoord, TemplateInstance } from '../types'
import { cloneInstance } from '../schema/validate'
import { LIMITS, STRUCTURE_MIN_COLS, STRUCTURE_MIN_ROWS, visibleRowCount } from '../theme/layoutScales'
import { MARK_LABEL } from '../format/formatTokens'
import { remapRangesInsert, remapRangesRemove } from './remap'
import { doMoveCol, doMoveRow } from './moveOps'

/**
 * 结构编辑核（自定义格式设计增量 §1.4，FR-C3）。
 * 纯函数：在副本上一次改完全部 remap 联动，返回完整新实例（含 STRUCT_LOSS warns）。
 * 禁止在壳里拆成多次 dispatch 拼一个结构操作——一个结构操作 = 一张撤销快照。
 * 新槽位 id 一律 u<单调序号>（§1.4.4）：实例内不重用、不改既有 id。
 * 区间重映射原语见 ./remap，整行/整列换位见 ./moveOps（WP5 拆分，行为不变）。
 */

export type StructuralIntent =
  | { kind: 'addRow'; afterRow?: number }
  | { kind: 'removeRow'; row: number }
  | { kind: 'addCol'; afterCol?: number }
  | { kind: 'removeCol'; col: number }
  | { kind: 'setHeaderLevel'; levels: 1 | 2 | 3 }
  /** WP4：整行换位（from → to，其余行按序让位） */
  | { kind: 'moveRow'; from: number; to: number }
  /** WP4：整列换位 */
  | { kind: 'moveCol'; from: number; to: number }

type SlotRecord = TemplateInstance['slots']

/** 槽位是否为空（空字符串 / 空文本 / null mark / null num / 缺省；图片槽不算空） */
export function isSlotEmpty(v: SlotRecord[string] | undefined): boolean {
  if (v === undefined || v === null || v === '') return true
  if (typeof v === 'object') {
    if ('mark' in v) return v.mark === null || v.mark === undefined
    if ('num' in v) return v.num === null || v.num === undefined
    if ('image' in v) return false
    return String(v.text ?? '') === ''
  }
  return String(v) === ''
}

/** 槽位显示文字（表头下调并入用；mark/num 按显示文字转纯文本，图片槽按空文字并入） */
function slotDisplayText(v: SlotRecord[string] | undefined): string {
  if (v === undefined || v === null || v === '') return ''
  if (typeof v === 'object') {
    if ('mark' in v) return v.mark ? MARK_LABEL[v.mark] : ''
    if ('num' in v) return v.num === null || v.num === undefined ? '' : String(v.num)
    if ('image' in v) return ''
    return String(v.text ?? '')
  }
  return String(v)
}

/** 实例内现有 u 序号最大值 +1（单调新 id，不跨实例共享） */
function nextSlotSeq(inst: TemplateInstance): number {
  let max = 0
  const scan = (id: string | null | undefined) => {
    if (!id) return
    const m = /^u(\d+)$/.exec(id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  for (const id of Object.keys(inst.slots)) scan(id)
  for (const row of inst.layout.slotGrid ?? []) {
    for (const id of row) scan(id)
  }
  return max + 1
}

/**
 * 区块槽 rowHint 锚点解析（共享知识 §7.7：新锚点形式必须同步这里）。
 * 支持 after-N（行间 gap / footer）与 left-N（左栏标签块）两种形式。
 */
type RowHintAnchor = { form: 'after' | 'left'; row: number }

function parseAnchor(rowHint: string | undefined): RowHintAnchor | null {
  if (!rowHint) return null
  const after = /^after-(\d+)$/.exec(rowHint)
  if (after) return { form: 'after', row: Number(after[1]) }
  const left = /^left-(\d+)$/.exec(rowHint)
  if (left) return { form: 'left', row: Number(left[1]) }
  return null
}

function formatAnchor(form: 'after' | 'left', row: number): string {
  return form === 'after' ? `after-${row}` : `left-${row}`
}

/** 兼容旧调用点：锚点行号（两种形式统一） */
function anchorOf(rowHint: string | undefined): number | null {
  const a = parseAnchor(rowHint)
  return a ? a.row : null
}

function makeSlot(
  next: TemplateInstance,
  id: string,
) {
  next.slots[id] = ''
  next.slotDefs = { ...next.slotDefs, [id]: { kind: 'text' } }
}

/** warn：结构操作连带丢失（details 标类别与数量，壳层聚合 toast） */
function lossWarn(warnings: CoreWarning[], category: string, count: number, message: string) {
  warnings.push({ code: 'STRUCT_LOSS', message, details: { category, count } })
}

// ── 行操作 ────────────────────────────────────────────────────

function doAddRow(inst: TemplateInstance, afterRow: number | undefined, warnings: CoreWarning[]): Result<TemplateInstance> {
  if (visibleRowCount(inst) >= LIMITS.maxRows) {
    return fail('LIMIT_ROWS', '最多 20 行，加不下了')
  }
  const next = cloneInstance(inst)
  const headerLevels = next.layout.headerLevels ?? 1
  const rowCount = next.layout.rowCount
  // 插入位钳制：不许插进表头区（可写行插在表头中间会破坏层级结构）
  const lo = Math.min(headerLevels, rowCount)
  const raw = afterRow === undefined || afterRow === null ? rowCount : afterRow + 1
  const insertAt = Math.max(lo, Math.min(rowCount, raw))
  const seq = nextSlotSeq(next)
  const grid = next.layout.slotGrid!
  const newRow: string[] = []
  for (let c = 0; c < next.layout.colCount; c++) {
    const id = `u${seq + c}`
    newRow.push(id)
    makeSlot(next, id)
  }
  grid.splice(insertAt, 0, newRow)
  next.layout.merges = remapRangesInsert(next.layout.merges ?? [], insertAt, 1, 0)
  next.layout.structuralMerges = remapRangesInsert(next.layout.structuralMerges ?? [], insertAt, 1, 0)
  next.layout.allowedMerges = remapRangesInsert(next.layout.allowedMerges ?? [], insertAt, 1, 0)
  next.layout.blockSlots = next.layout.blockSlots.map((s) => {
    const a = parseAnchor(s.rowHint)
    return a && a.row >= insertAt ? { ...s, rowHint: formatAnchor(a.form, a.row + 1) } : s
  })
  next.layout.readonlyCells = (next.layout.readonlyCells ?? []).map(
    ([r, c]) => (r >= insertAt ? [r + 1, c] : [r, c]) as CellCoord,
  )
  next.layout.rowCount += 1
  return ok(next, warnings)
}

/** 删第 row 逻辑行（Q-9 策略 A：连带删槽位数据与锚定区块），表头行由调用方拒绝 */
function doRemoveRowAt(next: TemplateInstance, row: number, warnings: CoreWarning[]) {
  const grid = next.layout.slotGrid!
  const removedIds = (grid[row] ?? []).filter((x): x is string => !!x)
  grid.splice(row, 1)
  for (const id of removedIds) {
    delete next.slots[id]
    if (next.slotDefs) delete next.slotDefs[id]
  }

  const m = remapRangesRemove(next.layout.merges ?? [], row, 0)
  next.layout.merges = m.ranges
  const sm = remapRangesRemove(next.layout.structuralMerges ?? [], row, 0)
  if (sm.removed.length) {
    lossWarn(warnings, 'structural-merge', sm.removed.length, `${sm.removed.length} 处结构合并区已随删行收缩移除`)
  }
  next.layout.structuralMerges = sm.ranges
  next.layout.allowedMerges = remapRangesRemove(next.layout.allowedMerges ?? [], row, 0).ranges

  // 锚定删行的区块连带删除；锚点在删行之后的平移
  const kept: BlockDesc[] = []
  let removedBlocks = 0
  for (const b of next.blocks) {
    const def = next.layout.blockSlots.find((s) => s.id === b.slotId)
    if (anchorOf(def?.rowHint) === row) {
      removedBlocks++
      continue
    }
    kept.push(b)
  }
  next.blocks = kept
  if (removedBlocks) {
    lossWarn(warnings, 'block', removedBlocks, `${removedBlocks} 个区块随该行删除`)
  }
  next.layout.blockSlots = next.layout.blockSlots.map((s) => {
    const a = parseAnchor(s.rowHint)
    return a && a.row > row ? { ...s, rowHint: formatAnchor(a.form, a.row - 1) } : s
  })

  next.layout.readonlyCells = (next.layout.readonlyCells ?? [])
    .filter(([r]) => r !== row)
    .map(([r, c]) => (r > row ? ([r - 1, c] as CellCoord) : ([r, c] as CellCoord)))
  next.layout.rowCount -= 1
}

function doAddCol(inst: TemplateInstance, afterCol: number | undefined, warnings: CoreWarning[]): Result<TemplateInstance> {
  if (inst.layout.colCount >= LIMITS.maxCols) {
    return fail('LIMIT_COLS', '最多 12 列，加不下了')
  }
  const next = cloneInstance(inst)
  const colCount = next.layout.colCount
  const insertAt = afterCol === undefined || afterCol === null ? colCount : Math.max(0, Math.min(colCount - 1, afterCol)) + 1
  const seq = nextSlotSeq(next)
  const grid = next.layout.slotGrid!
  for (let r = 0; r < grid.length; r++) {
    const id = `u${seq + r}`
    grid[r]!.splice(insertAt, 0, id)
    makeSlot(next, id)
  }
  next.layout.merges = remapRangesInsert(next.layout.merges ?? [], insertAt, 1, 1)
  next.layout.structuralMerges = remapRangesInsert(next.layout.structuralMerges ?? [], insertAt, 1, 1)
  next.layout.allowedMerges = remapRangesInsert(next.layout.allowedMerges ?? [], insertAt, 1, 1)
  next.layout.readonlyCells = (next.layout.readonlyCells ?? []).map(
    ([r, c]) => (c >= insertAt ? [r, c + 1] : [r, c]) as CellCoord,
  )
  // layout.style.colWidths：插位补 null
  if (next.layout.style?.colWidths) {
    const widths = [...next.layout.style.colWidths]
    while (widths.length < next.layout.colCount) widths.push(null)
    widths.splice(insertAt, 0, null)
    next.layout.style = { ...next.layout.style, colWidths: widths }
  }
  next.layout.colCount += 1
  return ok(next, warnings)
}

function doRemoveCol(next: TemplateInstance, col: number, warnings: CoreWarning[]) {
  const grid = next.layout.slotGrid!
  const removedIds: string[] = []
  for (const r of grid) {
    const id = r[col]
    if (id) removedIds.push(id)
    r.splice(col, 1)
  }
  for (const id of removedIds) {
    delete next.slots[id]
    if (next.slotDefs) delete next.slotDefs[id]
  }

  const m = remapRangesRemove(next.layout.merges ?? [], col, 1)
  next.layout.merges = m.ranges
  const sm = remapRangesRemove(next.layout.structuralMerges ?? [], col, 1)
  if (sm.removed.length) {
    lossWarn(warnings, 'structural-merge', sm.removed.length, `${sm.removed.length} 处结构合并区已随删列收缩移除`)
  }
  next.layout.structuralMerges = sm.ranges
  next.layout.allowedMerges = remapRangesRemove(next.layout.allowedMerges ?? [], col, 1).ranges

  // 区块行是整行，列无关：blocks 不联动
  next.layout.readonlyCells = (next.layout.readonlyCells ?? [])
    .filter(([, c]) => c !== col)
    .map(([r, c]) => (c > col ? ([r, c - 1] as CellCoord) : ([r, c] as CellCoord)))

  // layout.style.colWidths：删位
  if (next.layout.style?.colWidths) {
    const widths = [...next.layout.style.colWidths]
    widths.splice(col, 1)
    next.layout.style = { ...next.layout.style, colWidths: widths }
  }

  // 冻结列联动：被删列号 < frozenColCount → −1
  if (next.layout.frozenColCount !== undefined && col < next.layout.frozenColCount) {
    next.layout.frozenColCount -= 1
  }
  next.layout.colCount -= 1
}

function doSetHeaderLevel(inst: TemplateInstance, levels: 1 | 2 | 3, warnings: CoreWarning[]): Result<TemplateInstance> {
  const cur = inst.layout.headerLevels ?? 1
  const next = cloneInstance(inst)
  if (levels === cur) return ok(next, warnings)

  if (levels > cur) {
    // 上调：顶部插 (levels − cur) 行新槽位（同加行规则，插在表头顶部）
    const delta = levels - cur
    if (visibleRowCount(inst) + delta > LIMITS.maxRows) {
      return fail('LIMIT_ROWS', '最多 20 行，加不下了')
    }
    const seq = nextSlotSeq(next)
    const grid = next.layout.slotGrid!
    const newRows: string[][] = []
    for (let i = 0; i < delta; i++) {
      const row: string[] = []
      for (let c = 0; c < next.layout.colCount; c++) {
        const id = `u${seq + i * next.layout.colCount + c}`
        row.push(id)
        makeSlot(next, id)
      }
      newRows.push(row)
    }
    grid.splice(0, 0, ...newRows)
    next.layout.merges = remapRangesInsert(next.layout.merges ?? [], 0, delta, 0)
    next.layout.structuralMerges = remapRangesInsert(next.layout.structuralMerges ?? [], 0, delta, 0)
    next.layout.allowedMerges = remapRangesInsert(next.layout.allowedMerges ?? [], 0, delta, 0)
    next.layout.blockSlots = next.layout.blockSlots.map((s) => {
      const a = parseAnchor(s.rowHint)
      return a ? { ...s, rowHint: formatAnchor(a.form, a.row + delta) } : s
    })
    next.layout.readonlyCells = (next.layout.readonlyCells ?? []).map(
      ([r, c]) => [r + delta, c] as CellCoord,
    )
    next.layout.rowCount += delta
    next.layout.headerLevels = levels
    return ok(next, warnings)
  }

  // 下调（Q-11：内容并入最底层保留表头行，放不下清除 + STRUCT_LOSS）
  const targetRow = levels - 1
  const grid = next.layout.slotGrid!
  let merged = 0
  let lost = 0
  let typedConverted = 0
  for (let r = cur - 1; r >= levels; r--) {
    for (let c = 0; c < next.layout.colCount; c++) {
      const srcId = grid[r]?.[c]
      if (!srcId) continue
      const srcVal = next.slots[srcId]
      if (isSlotEmpty(srcVal)) continue
      const text = slotDisplayText(srcVal)
      if (!text) continue
      const tgtId = grid[targetRow]?.[c]
      const tgtVal = tgtId ? next.slots[tgtId] : undefined
      if (tgtId && isSlotEmpty(tgtVal)) {
        next.slots[tgtId] = { text }
        merged++
        if (typeof srcVal === 'object' && ('mark' in srcVal || 'num' in srcVal)) typedConverted++
      } else {
        lost++
      }
    }
  }
  if (lost) lossWarn(warnings, 'header-text', lost, `${lost} 处表头文字放不下，已清除`)
  if (typedConverted) {
    warnings.push({
      code: 'UNKNOWN_FIELD',
      message: '表头符号/数字已按文字并入',
      details: { count: typedConverted },
    })
  }
  // 删深层表头行（行号从小到大删，删 levels 共 cur − levels 次）
  for (let i = levels; i < cur; i++) {
    doRemoveRowAt(next, levels, warnings)
  }
  next.layout.headerLevels = levels
  return ok(next, warnings)
}

// ── 主入口 ────────────────────────────────────────────────────

export function applyStructuralIntent(
  inst: TemplateInstance,
  intent: StructuralIntent,
): Result<TemplateInstance> {
  if (!inst.layout.slotGrid) {
    return fail('TEMPLATE_INVALID', '这张表不支持结构调整')
  }
  const warnings: CoreWarning[] = []
  switch (intent.kind) {
    case 'addRow':
      return doAddRow(inst, intent.afterRow, warnings)
    case 'removeRow': {
      const row = intent.row
      if (!Number.isInteger(row) || row < 0 || row >= inst.layout.rowCount) {
        return fail('TEMPLATE_INVALID', '这一行不存在')
      }
      const headerLevels = inst.layout.headerLevels ?? 1
      if (row < headerLevels) {
        return fail('TEMPLATE_INVALID', '表头行不能直接删除，请下调表头层数')
      }
      // 最低结构守卫（增量设计 A3）：表头行本就不可删，这里拦「删掉最后一条内容行」
      if (inst.layout.rowCount <= STRUCTURE_MIN_ROWS) {
        return fail('STRUCTURE_MIN_ROWS', '至少保留 1 行表头和 1 行内容，不能再删了')
      }
      const next = cloneInstance(inst)
      doRemoveRowAt(next, row, warnings)
      return ok(next, warnings)
    }
    case 'addCol':
      return doAddCol(inst, intent.afterCol, warnings)
    case 'removeCol': {
      const col = intent.col
      if (!Number.isInteger(col) || col < 0 || col >= inst.layout.colCount) {
        return fail('TEMPLATE_INVALID', '这一列不存在')
      }
      // 最低结构守卫（增量设计 A3）：至少保留 1 列
      if (inst.layout.colCount <= STRUCTURE_MIN_COLS) {
        return fail('STRUCTURE_MIN_COLS', '至少保留 1 列，不能再删了')
      }
      const next = cloneInstance(inst)
      doRemoveCol(next, col, warnings)
      return ok(next, warnings)
    }
    case 'setHeaderLevel':
      return doSetHeaderLevel(inst, intent.levels, warnings)
    case 'moveRow':
      return doMoveRow(inst, intent.from, intent.to, warnings)
    case 'moveCol':
      return doMoveCol(inst, intent.from, intent.to, warnings)
  }
}

// ── 壳层辅助纯函数（Q-9 确认 / 达上限置灰）──────────────────

/** 该行任一槽位有值，或锚定区块存在 → 壳层删行前弹二次确认 */
export function hasContentInRow(inst: TemplateInstance, row: number): boolean {
  const ids = inst.layout.slotGrid?.[row] ?? []
  if (ids.some((id) => id && !isSlotEmpty(inst.slots[id]))) return true
  return inst.blocks.some((b) => {
    const def = inst.layout.blockSlots.find((s) => s.id === b.slotId)
    return anchorOf(def?.rowHint) === row
  })
}

/** 该列任一槽位有值 → 壳层删列前弹二次确认 */
export function hasContentInCol(inst: TemplateInstance, col: number): boolean {
  const grid = inst.layout.slotGrid ?? []
  return grid.some((r) => {
    const id = r[col]
    return !!id && !isSlotEmpty(inst.slots[id])
  })
}

/** 可见行数（含区块行）达上限 → 壳层置灰加行按钮 */
export function canAddRow(inst: TemplateInstance): boolean {
  if (!inst.layout.slotGrid) return false
  return visibleRowCount(inst) < LIMITS.maxRows
}

/** 列数达上限 → 壳层置灰加列按钮 */
export function canAddCol(inst: TemplateInstance): boolean {
  if (!inst.layout.slotGrid) return false
  return inst.layout.colCount < LIMITS.maxCols
}

// ── 删除影响预检（增量设计 A3：UI 确认分流与确认框摘要的唯一口径）─────────────

/** previewStructuralImpact 的返回：三计数与禁用原因（与执行守卫同源判定） */
export interface StructuralImpact {
  /** 该行/列内非空槽位数（isSlotEmpty 同口径；不含区块） */
  filledCellCount: number
  /**
   * 会被调整的合并区数：merges ∪ structuralMerges 中与该行/列相交（s ≤ index ≤ e）的区间数。
   * 仅平移不相交的区间不计——形状不变对用户无感知。allowedMerges 是兼容字段，不计。
   */
  affectedMergeCount: number
  /**
   * 会随删除移除的区块数：blockSlots 锚点（after-N / left-N 解析后）恰为该行号的已占用区块。
   * 删列恒为 0（区块行是整行，列无关——doRemoveCol 现口径）。
   */
  affectedBlockCount: number
  /** 禁用原因（白话）；undefined = 允许删除。UI 禁用不是唯一防线，core 执行时二次校验 */
  blockedReason?: string
}

/**
 * 删除第 index 行/列的影响预检纯函数（不碰实例）。
 * blockedReason 判定顺序与执行守卫一致：越界 → 表头行（仅行轴）→ 最低结构。
 */
export function previewStructuralImpact(
  inst: TemplateInstance,
  axis: 'row' | 'col',
  index: number,
): StructuralImpact {
  const blocked = (reason: string): StructuralImpact => ({
    filledCellCount: 0,
    affectedMergeCount: 0,
    affectedBlockCount: 0,
    blockedReason: reason,
  })

  if (axis === 'row') {
    const rowCount = inst.layout.slotGrid?.length ?? inst.layout.rowCount
    if (!Number.isInteger(index) || index < 0 || index >= rowCount) {
      return blocked('这一行不存在')
    }
    const headerLevels = inst.layout.headerLevels ?? 1
    if (index < headerLevels) {
      return blocked('表头行不能删除，请下调表头层数')
    }
    if (rowCount <= STRUCTURE_MIN_ROWS) {
      return blocked('至少保留 1 行表头和 1 行内容，不能再删了')
    }
  } else {
    if (!Number.isInteger(index) || index < 0 || index >= inst.layout.colCount) {
      return blocked('这一列不存在')
    }
    if (inst.layout.colCount <= STRUCTURE_MIN_COLS) {
      return blocked('至少保留 1 列，不能再删了')
    }
  }

  // 非空槽位计数
  let filledCellCount = 0
  const grid = inst.layout.slotGrid ?? []
  if (axis === 'row') {
    for (const id of grid[index] ?? []) {
      if (id && !isSlotEmpty(inst.slots[id])) filledCellCount++
    }
  } else {
    for (const row of grid) {
      const id = row[index]
      if (id && !isSlotEmpty(inst.slots[id])) filledCellCount++
    }
  }

  // 相交合并区计数（merges ∪ structuralMerges；allowedMerges 为兼容字段不计）
  let affectedMergeCount = 0
  const sets = [inst.layout.merges, inst.layout.structuralMerges]
  for (const set of sets) {
    for (const r of set ?? []) {
      const s = axis === 'row' ? r.start[0] : r.start[1]
      const e = axis === 'row' ? r.end[0] : r.end[1]
      if (s <= index && index <= e) affectedMergeCount++
    }
  }

  // 连带删除的区块计数（仅行轴；锚点行号恰为该行的已占用区块）
  let affectedBlockCount = 0
  if (axis === 'row') {
    for (const b of inst.blocks) {
      const def = inst.layout.blockSlots.find((s) => s.id === b.slotId)
      if (anchorOf(def?.rowHint) === index) affectedBlockCount++
    }
  }

  return { filledCellCount, affectedMergeCount, affectedBlockCount }
}
