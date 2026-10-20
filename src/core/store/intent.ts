import { fail, ok, type Result } from '../errors'
import type {
  Align,
  BlockDesc,
  EditIntent,
  Emphasis,
  MarkSlotObject,
  NumSlotObject,
  SlotValue,
  TemplateInstance,
  TextSlotObject,
} from '../types'
import { canMerge, canSplit } from './mergeGuard'
import { MARK_LABEL } from '../format/formatTokens'

function slotStyle(v: SlotValue | undefined): { align?: Align; emphasize?: Emphasis[] } {
  if (typeof v === 'object' && v !== null) {
    const em = v.emphasize
    return {
      align: v.align,
      emphasize: Array.isArray(em) ? em : em ? [em] : undefined,
    }
  }
  return {}
}

/** Merge incoming value with the previous align/emphasize (format follows the value's kind). */
function mergeSlotValue(prev: SlotValue | undefined, incoming: SlotValue): SlotValue {
  const base = slotStyle(prev)
  const inc = slotStyle(incoming)
  const align = inc.align ?? base.align
  const emphasize = inc.emphasize ?? base.emphasize
  if (typeof incoming === 'object' && incoming !== null && 'mark' in incoming) {
    return { mark: incoming.mark, align, emphasize } satisfies MarkSlotObject
  }
  if (typeof incoming === 'object' && incoming !== null && 'num' in incoming) {
    return { num: incoming.num, align, emphasize } satisfies NumSlotObject
  }
  const text = typeof incoming === 'object' ? String(incoming.text ?? '') : String(incoming)
  return { text, align, emphasize } satisfies TextSlotObject
}

/** Keep the value's kind (text / mark / num), only patch align. */
function withAlign(v: SlotValue | undefined, align: Align): SlotValue {
  if (typeof v === 'object' && v !== null && ('mark' in v || 'num' in v)) {
    return { ...v, align }
  }
  const text = typeof v === 'object' && v !== null ? String(v.text ?? '') : v === undefined ? '' : String(v)
  return { text, align }
}

/** Keep the value's kind (text / mark / num), only patch emphasize. */
function withEmphasis(v: SlotValue | undefined, emphasize: Emphasis[]): SlotValue {
  if (typeof v === 'object' && v !== null && ('mark' in v || 'num' in v)) {
    return { ...v, emphasize }
  }
  const text = typeof v === 'object' && v !== null ? String(v.text ?? '') : v === undefined ? '' : String(v)
  return { text, emphasize }
}

function slotText(v: SlotValue | undefined): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'object') {
    if ('mark' in v) return v.mark ? MARK_LABEL[v.mark] : ''
    if ('num' in v) return v.num === null || v.num === undefined ? '' : String(v.num)
    return String(v.text ?? '')
  }
  return String(v)
}

export function isEmphasizable(inst: TemplateInstance, slotId: string): boolean {
  const grid = inst.layout.slotGrid
  if (!grid) return true
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r]
    if (!row) continue
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== slotId) continue
      const readonly = inst.layout.readonlyCells?.some(([rr, cc]) => rr === r && cc === c)
      if (readonly) return false
      // label column (col 0) on body rows: not emphasizable per Q-004
      if (c === 0 && r >= (inst.layout.headerLevels ?? 1)) return false
      return true
    }
  }
  // block props are not emphasizable via cell emphasis
  if (inst.blocks.some((b) => b.slotId === slotId || b.id === slotId)) return false
  return true
}

function clearSlotsInRange(inst: TemplateInstance, range: import('../types').MergeRange, keepTopLeft: boolean) {
  const grid = inst.layout.slotGrid
  if (!grid) return
  for (let r = range.start[0]; r <= range.end[0]; r++) {
    for (let c = range.start[1]; c <= range.end[1]; c++) {
      if (keepTopLeft && r === range.start[0] && c === range.start[1]) continue
      const sid = grid[r]?.[c]
      if (sid) inst.slots[sid] = ''
    }
  }
}

export function applyEditIntent(
  inst: TemplateInstance,
  intent: EditIntent,
  opts?: { blockSlotPolicy?: 'replace' | 'reject' },
): Result<TemplateInstance> {
  const next = JSON.parse(JSON.stringify(inst)) as TemplateInstance
  const policy = opts?.blockSlotPolicy ?? 'replace'

  switch (intent.kind) {
    case 'setSlot': {
      if (!(intent.slotId in next.slots) && !slotExistsInGrid(next, intent.slotId)) {
        return fail('SLOT_UNKNOWN', '未知槽位', { slotId: intent.slotId })
      }
      next.slots[intent.slotId] = mergeSlotValue(next.slots[intent.slotId], intent.value)
      return ok(next)
    }
    case 'setTheme': {
      next.themeId = intent.themeId
      return ok(next)
    }
    case 'setZebra': {
      next.zebraOn = intent.on
      return ok(next)
    }
    case 'merge': {
      const check = canMerge(next.layout, intent.range)
      if (!check.ok) return check
      next.layout.merges = [...(next.layout.merges ?? []), intent.range]
      clearSlotsInRange(next, intent.range, true)
      return ok(next)
    }
    case 'split': {
      const check = canSplit(next.layout, intent.range)
      if (!check.ok) return check
      next.layout.merges = (next.layout.merges ?? []).filter(
        (m) =>
          !(
            m.start[0] === intent.range.start[0] &&
            m.start[1] === intent.range.start[1] &&
            m.end[0] === intent.range.end[0] &&
            m.end[1] === intent.range.end[1]
          ),
      )
      return ok(next)
    }
    case 'setAlign': {
      if (!slotExistsInGrid(next, intent.slotId) && !(intent.slotId in next.slots)) {
        return fail('SLOT_UNKNOWN', '未知槽位', { slotId: intent.slotId })
      }
      next.slots[intent.slotId] = withAlign(next.slots[intent.slotId], intent.align)
      return ok(next)
    }
    case 'setEmphasis': {
      if (!isEmphasizable(next, intent.slotId)) {
        return fail('SLOT_DROP_BLOCKED', '此处由模板固定，不能强调')
      }
      next.slots[intent.slotId] = withEmphasis(next.slots[intent.slotId], intent.emphasize)
      return ok(next)
    }
    case 'setRecommendCol': {
      const recs = next.layout.recommendableCols ?? []
      if (intent.col !== null && !recs.includes(intent.col)) {
        return fail('SLOT_UNKNOWN', '该列不能标记为推荐', { col: intent.col })
      }
      next.highlight = { ...(next.highlight ?? { recommendCol: null }), recommendCol: intent.col }
      return ok(next)
    }
    case 'addBlock': {
      return applyAddBlock(next, intent.block, policy)
    }
    case 'removeBlock': {
      const idx = next.blocks.findIndex((b) => b.id === intent.blockId)
      if (idx < 0) return fail('BLOCK_NOT_FOUND', '区块不存在', { blockId: intent.blockId })
      next.blocks.splice(idx, 1)
      return ok(next)
    }
    case 'updateBlock': {
      const b = next.blocks.find((x) => x.id === intent.blockId)
      if (!b) return fail('BLOCK_NOT_FOUND', '区块不存在', { blockId: intent.blockId })
      b.props = { ...b.props, ...intent.props }
      return ok(next)
    }
    default:
      return fail('TEMPLATE_INVALID', '未知编辑意图')
  }
}

function slotExistsInGrid(inst: TemplateInstance, slotId: string): boolean {
  const grid = inst.layout.slotGrid
  if (!grid) return false
  return grid.some((row) => row?.includes(slotId))
}

function applyAddBlock(
  next: TemplateInstance,
  block: BlockDesc,
  policy: 'replace' | 'reject',
): Result<TemplateInstance> {
  const def = next.layout.blockSlots.find((s) => s.id === block.slotId)
  if (!def) return fail('SLOT_UNKNOWN', '未知区块槽', { slotId: block.slotId })
  if (!def.accept.includes(block.type)) {
    return fail('BLOCK_TYPE_REJECT', '这里不能放这个区块', { type: block.type })
  }
  // MVP: emphFooter / leftTag visible but disabled in shell; still reject if somehow sent
  if (block.type === 'emphFooter' || block.type === 'leftTag') {
    return fail('BLOCK_TYPE_REJECT', '该区块本期不可用', { type: block.type })
  }
  const occupied = next.blocks.filter((b) => b.slotId === block.slotId)
  const eff = def.occupiedPolicy ?? policy
  if (occupied.length && eff === 'reject') {
    return fail('BLOCK_SLOT_OCCUPIED', '该位置已有区块', { slotId: block.slotId })
  }
  if (occupied.length && eff === 'replace') {
    next.blocks = next.blocks.filter((b) => b.slotId !== block.slotId)
  }
  // mutex group
  if (def.mutexGroup) {
    const mutexSlots = new Set(
      next.layout.blockSlots.filter((s) => s.mutexGroup === def.mutexGroup).map((s) => s.id),
    )
    next.blocks = next.blocks.filter((b) => !mutexSlots.has(b.slotId) || b.slotId === block.slotId)
  }
  next.blocks.push({
    ...block,
    props: {
      label: block.props?.label ?? '',
      text: block.props?.text ?? block.props?.label ?? '分组标题',
      styleTier: block.props?.styleTier ?? 1,
      ...block.props,
    },
  })
  return ok(next)
}

export function getSlotDisplayText(v: SlotValue | undefined, placeholder: string): string {
  const t = slotText(v)
  return t === '' ? placeholder : t
}
