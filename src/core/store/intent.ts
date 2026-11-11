import { fail, ok, type Result } from '../errors'
import type {
  Align,
  BarFormat,
  BlockDesc,
  EditIntent,
  Emphasis,
  ImageSlotObject,
  MarkSlotObject,
  NumSlotObject,
  RoleColorKey,
  SlotValue,
  TemplateInstance,
  TextSlotObject,
  ThemeTokens,
} from '../types'
import { canMerge, canSplit } from './mergeGuard'
import { applyStructuralIntent } from './structure'
import { resolveTheme, sanitizeHex } from '../theme/palettes'
import { LIMITS, clampColWidth, clampTier, clampTier3, visibleRowCount } from '../theme/layoutScales'
import { MARK_LABEL } from '../format/formatTokens'
import { canSetImage, checkImageBudget, validateImageDataUrl } from '../image/imageGuard'
import { KPI_CARD_MAX, sanitizeBar, sanitizeKpiCards } from '../kpi/kpiCards'

function slotStyle(v: SlotValue | undefined): { align?: Align; emphasize?: Emphasis[] } {
  if (typeof v === 'object' && v !== null && !('image' in v)) {
    const em = v.emphasize
    return {
      align: v.align,
      emphasize: Array.isArray(em) ? em : em ? [em] : undefined,
    }
  }
  return {}
}

/** 槽值上的 bar 格式（仅 text/num 对象承载；mark/image 无条形语义） */
function slotBar(v: SlotValue | undefined): BarFormat | undefined {
  if (
    v &&
    typeof v === 'object' &&
    !('image' in v) &&
    !('mark' in v) &&
    'bar' in v &&
    v.bar &&
    typeof v.bar === 'object'
  ) {
    return v.bar as BarFormat
  }
  return undefined
}

/** Merge incoming value with the previous align/emphasize/bar (format follows the value's kind). */
function mergeSlotValue(prev: SlotValue | undefined, incoming: SlotValue): SlotValue {
  const base = slotStyle(prev)
  const inc = slotStyle(incoming)
  const align = inc.align ?? base.align
  const emphasize = inc.emphasize ?? base.emphasize
  const bar = slotBar(incoming) ?? slotBar(prev)
  if (typeof incoming === 'object' && incoming !== null && 'mark' in incoming) {
    return { mark: incoming.mark, align, emphasize } satisfies MarkSlotObject
  }
  if (typeof incoming === 'object' && incoming !== null && 'num' in incoming) {
    return { num: incoming.num, align, emphasize, ...(bar ? { bar } : {}) } satisfies NumSlotObject
  }
  const text = typeof incoming === 'object' && 'text' in incoming ? String(incoming.text ?? '') : String(incoming)
  return { text, align, emphasize, ...(bar ? { bar } : {}) } satisfies TextSlotObject
}

/** Keep the value's kind (text / mark / num / image), only patch align. */
function withAlign(v: SlotValue | undefined, align: Align): SlotValue {
  if (typeof v === 'object' && v !== null && ('mark' in v || 'num' in v)) {
    return { ...v, align }
  }
  // 图片槽无对齐语义：原样保留
  if (typeof v === 'object' && v !== null && 'image' in v) return v
  const text = typeof v === 'object' && v !== null ? String(v.text ?? '') : v === undefined ? '' : String(v)
  return { text, align }
}

/** Keep the value's kind (text / mark / num / image), only patch emphasize. */
function withEmphasis(v: SlotValue | undefined, emphasize: Emphasis[]): SlotValue {
  if (typeof v === 'object' && v !== null && ('mark' in v || 'num' in v)) {
    return { ...v, emphasize }
  }
  // 图片槽无强调语义：原样保留
  if (typeof v === 'object' && v !== null && 'image' in v) return v
  const text = typeof v === 'object' && v !== null ? String(v.text ?? '') : v === undefined ? '' : String(v)
  return { text, emphasize }
}

function slotText(v: SlotValue | undefined): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'object') {
    if ('mark' in v) return v.mark ? MARK_LABEL[v.mark] : ''
    if ('num' in v) return v.num === null || v.num === undefined ? '' : String(v.num)
    if ('image' in v) return ''
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

/**
 * 选区内有内容的可写格数（清空/合并前的提示口径；跳过只读格与空槽位）。
 * `skipTopLeft`：合并前口径——合并保留左上格内容，只有其余格的内容会被清掉。
 */
export function countFilledSlotsInRange(
  inst: TemplateInstance,
  range: import('../types').MergeRange,
  opts?: { skipTopLeft?: boolean },
): number {
  const grid = inst.layout.slotGrid
  if (!grid) return 0
  const readonly = new Set((inst.layout.readonlyCells ?? []).map(([r, c]) => `${r},${c}`))
  const r0 = Math.min(range.start[0], range.end[0])
  const r1 = Math.max(range.start[0], range.end[0])
  const c0 = Math.min(range.start[1], range.end[1])
  const c1 = Math.max(range.start[1], range.end[1])
  let n = 0
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (opts?.skipTopLeft && r === r0 && c === c0) continue
      if (readonly.has(`${r},${c}`)) continue
      const sid = grid[r]?.[c]
      if (!sid) continue
      if (slotText(inst.slots[sid]) !== '') n += 1
    }
  }
  return n
}

/**
 * 选区内的可写槽位 id（WP3 批量对齐/强调的落点）：跳过只读格与无槽位格，按阅读顺序去重。
 * 合并区只返回左上格的槽（渲染与导出同口径：合并区只有左上格承载内容）。
 */
export function slotIdsInRange(
  inst: TemplateInstance,
  range: import('../types').MergeRange,
): string[] {
  const grid = inst.layout.slotGrid
  if (!grid) return []
  const readonly = new Set((inst.layout.readonlyCells ?? []).map(([r, c]) => `${r},${c}`))
  const r0 = Math.min(range.start[0], range.end[0])
  const r1 = Math.max(range.start[0], range.end[0])
  const c0 = Math.min(range.start[1], range.end[1])
  const c1 = Math.max(range.start[1], range.end[1])
  const seen = new Set<string>()
  const out: string[] = []
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (readonly.has(`${r},${c}`)) continue
      const sid = grid[r]?.[c]
      if (!sid || seen.has(sid)) continue
      seen.add(sid)
      out.push(sid)
    }
  }
  return out
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
      const incoming = intent.value
      if (typeof incoming === 'object' && incoming !== null && 'image' in incoming) {
        // R-3：设图/换图走既有 setSlot 意图，写前三连校验（任一失败 store 不变）
        const gate = canSetImage(next, intent.slotId)
        if (!gate.ok) return gate
        const fmt = validateImageDataUrl(incoming.image)
        if (!fmt.ok) return fmt
        const budget = checkImageBudget(next, incoming as ImageSlotObject, intent.slotId)
        if (!budget.ok) return budget
        next.slots[intent.slotId] = { image: incoming.image }
        return ok(next)
      }
      next.slots[intent.slotId] = mergeSlotValue(next.slots[intent.slotId], incoming)
      return ok(next)
    }
    // ── FR-C1 颜色覆盖（schema 1.2）──
    case 'setThemeToken': {
      const token = intent.token as RoleColorKey
      let value: string | null = null
      if (intent.value !== null) {
        const hex = sanitizeHex(intent.value)
        // 输入钳制：非法 hex 不写入（壳层应在发意图前用 sanitizeHex 预检并回退输入框）
        if (!hex) return fail('TEMPLATE_INVALID', '颜色格式不对，请重新选择')
        value = hex
      }
      const tokens: Record<string, unknown> = { ...next.themeTokens }
      if (value === null) {
        delete tokens[token]
      } else {
        tokens[token] = value
      }
      // 裁剪：与预设主题相同的值不算覆盖（删掉覆盖即逐像素回到预设，§1.2）
      const pal = resolveTheme(next.themeId).palette
      const defaults: Record<string, string> = {
        primary: pal.primary,
        headerText: pal.headerText,
        zebra: pal.zebra,
        emphasis: pal.emphasis,
        border: pal.border,
        background: pal.paper,
        tag: pal.tag,
      }
      for (const k of Object.keys(tokens)) {
        const v = tokens[k]
        const d = defaults[k]
        if (typeof v === 'string' && typeof d === 'string' && v.toLowerCase() === d.toLowerCase()) {
          delete tokens[k]
        }
      }
      if (Object.keys(tokens).length === 0) {
        delete next.themeTokens
      } else {
        next.themeTokens = tokens as unknown as ThemeTokens
      }
      return ok(next)
    }
    case 'resetThemeTokens': {
      delete next.themeTokens
      return ok(next)
    }
    // ── FR-C2 排版档位（全局档位 + 逐列列宽，超界收口不报错崩）──
    case 'setColWidth': {
      if (!Number.isInteger(intent.col) || intent.col < 0 || intent.col >= next.layout.colCount) {
        return fail('SLOT_UNKNOWN', '这一列不存在', { col: intent.col })
      }
      const style = { ...next.layout.style }
      const widths = [...(style.colWidths ?? [])]
      while (widths.length < next.layout.colCount) widths.push(null)
      widths[intent.col] = intent.width === null ? null : clampColWidth(intent.width)
      style.colWidths = widths
      next.layout.style = style
      return ok(next)
    }
    case 'setRowHeightTier': {
      next.layout.style = { ...next.layout.style, rowHeightTier: clampTier(intent.tier) }
      return ok(next)
    }
    case 'setFontSizeTier': {
      next.layout.style = { ...next.layout.style, fontSizeTier: clampTier3(intent.tier) }
      return ok(next)
    }
    case 'setPaddingTier': {
      next.layout.style = { ...next.layout.style, paddingTier: clampTier3(intent.tier) }
      return ok(next)
    }
    // ── FR-C3 结构编辑：转发结构核（一次意图 = 一套 remap = 一张撤销快照）──
    case 'addRow':
    case 'removeRow':
    case 'addCol':
    case 'removeCol':
    case 'setHeaderLevel':
    case 'moveRow':
    case 'moveCol':
    case 'moveRowBlock':
    case 'moveColBlock':
      return applyStructuralIntent(inst, intent)
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
    case 'clearSlots': {
      const grid = next.layout.slotGrid
      if (!grid) return fail('SLOT_UNKNOWN', '当前模板不支持清空内容')
      const readonly = new Set((next.layout.readonlyCells ?? []).map(([r, c]) => `${r},${c}`))
      const r0 = Math.min(intent.range.start[0], intent.range.end[0])
      const r1 = Math.max(intent.range.start[0], intent.range.end[0])
      const c0 = Math.min(intent.range.start[1], intent.range.end[1])
      const c1 = Math.max(intent.range.start[1], intent.range.end[1])
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          // 只读格（模板固定）不清；空槽位跳过
          if (readonly.has(`${r},${c}`)) continue
          const sid = grid[r]?.[c]
          if (sid) next.slots[sid] = ''
        }
      }
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
    // ── Schema 1.2 扩展：KPI 统计卡（表外 hero 区，一次意图一张快照）──
    case 'addKpiCard': {
      const cards = sanitizeKpiCards(next.kpiCards) ?? []
      if (cards.length >= KPI_CARD_MAX) {
        return fail('TEMPLATE_INVALID', `统计卡最多 ${KPI_CARD_MAX} 张`, { count: cards.length })
      }
      next.kpiCards = [...cards, intent.card]
      return ok(next)
    }
    case 'updateKpiCard': {
      const cards = sanitizeKpiCards(next.kpiCards) ?? []
      const idx = cards.findIndex((c) => c.id === intent.cardId)
      if (idx < 0) return fail('TEMPLATE_INVALID', '统计卡不存在', { cardId: intent.cardId })
      cards[idx] = { ...cards[idx]!, ...intent.patch }
      next.kpiCards = cards
      return ok(next)
    }
    case 'removeKpiCard': {
      const cards = sanitizeKpiCards(next.kpiCards) ?? []
      if (!cards.some((c) => c.id === intent.cardId)) {
        return fail('TEMPLATE_INVALID', '统计卡不存在', { cardId: intent.cardId })
      }
      const remain = cards.filter((c) => c.id !== intent.cardId)
      if (remain.length === 0) delete next.kpiCards
      else next.kpiCards = remain
      return ok(next)
    }
    case 'moveKpiCard': {
      const cards = sanitizeKpiCards(next.kpiCards) ?? []
      const idx = cards.findIndex((c) => c.id === intent.cardId)
      const to = idx + intent.dir
      if (idx < 0) return fail('TEMPLATE_INVALID', '统计卡不存在', { cardId: intent.cardId })
      if (to < 0 || to >= cards.length) {
        return fail('TEMPLATE_INVALID', intent.dir === -1 ? '已经在最上面了' : '已经在最下面了', {
          cardId: intent.cardId,
        })
      }
      const swapped = [...cards]
      const tmp = swapped[idx]!
      swapped[idx] = swapped[to]!
      swapped[to] = tmp
      next.kpiCards = swapped
      return ok(next)
    }
    // ── Schema 1.2 扩展：单元格条形格式（bar=null 清除恢复纯文本）──
    case 'setSlotBar': {
      if (!slotExistsInGrid(next, intent.slotId) && !(intent.slotId in next.slots)) {
        return fail('SLOT_UNKNOWN', '未知槽位', { slotId: intent.slotId })
      }
      if (intent.bar === null) {
        const v = next.slots[intent.slotId]
        if (v && typeof v === 'object' && 'bar' in v) {
          const { bar: _drop, ...rest } = v as unknown as Record<string, unknown> & {
            bar?: unknown
          }
          next.slots[intent.slotId] = rest as unknown as SlotValue
        }
        return ok(next)
      }
      const cleaned = sanitizeBar(intent.bar)
      if (!cleaned) return fail('TEMPLATE_INVALID', '条形比例请填 0～100 的数字')
      const prev = next.slots[intent.slotId]
      // mark/image 槽无条形语义：明确拒绝（而非静默忽略）
      if (prev && typeof prev === 'object' && ('mark' in prev || 'image' in prev)) {
        return fail('TEMPLATE_INVALID', '这一格不能加条形')
      }
      // 保留原 kind 与 align/emphasize，仅补 bar：纯文本值包成 text 对象
      if (prev && typeof prev === 'object') {
        next.slots[intent.slotId] = { ...prev, bar: cleaned } as SlotValue
      } else {
        next.slots[intent.slotId] = {
          text: prev === undefined || prev === null ? '' : String(prev),
          bar: cleaned,
        }
      }
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
      // 区块级底色（sectionBar / groupHeader）：hex 清洗，非法拒收；null/undefined = 清除回主题
      const patch: Record<string, unknown> = { ...intent.props }
      let clearColor = false
      if ('color' in patch) {
        const raw = patch.color
        if (raw === null || raw === undefined || raw === '') {
          clearColor = true
          delete patch.color
        } else {
          const hex = sanitizeHex(String(raw))
          if (!hex) return fail('TEMPLATE_INVALID', '颜色格式不对，请填 6 位十六进制')
          patch.color = hex
        }
      }
      b.props = { ...b.props, ...patch }
      if (clearColor && b.props) delete b.props.color
      return ok(next)
    }
    // WP4：表内区块换位——目标槽空则移动；已占用则两个区块互换（双侧 accept 都要允许，
    // 单向校验会让「A 槽不收 B 类」的模板在互换时留下类型不合法的区块）
    case 'moveBlock': {
      const moving = next.blocks.find((b) => b.id === intent.blockId)
      if (!moving) return fail('BLOCK_NOT_FOUND', '区块不存在', { blockId: intent.blockId })
      const toDef = next.layout.blockSlots.find((s) => s.id === intent.toSlotId)
      if (!toDef) return fail('SLOT_DROP_BLOCKED', '这个槽位不存在', { slotId: intent.toSlotId })
      if (moving.slotId === intent.toSlotId) return ok(next)
      if (!toDef.accept.includes(moving.type)) {
        return fail('BLOCK_TYPE_REJECT', '这里不能放这个区块', { slotId: intent.toSlotId })
      }
      const occupant = next.blocks.find((b) => b.slotId === intent.toSlotId && b.id !== moving.id)
      if (occupant) {
        const fromDef = next.layout.blockSlots.find((s) => s.id === moving.slotId)
        if (!fromDef || !fromDef.accept.includes(occupant.type)) {
          return fail('BLOCK_TYPE_REJECT', '这两个区块不能互换', { slotId: moving.slotId })
        }
        next.blocks = next.blocks.map((b) =>
          b.id === moving.id
            ? { ...b, slotId: intent.toSlotId }
            : b.id === occupant.id
              ? { ...b, slotId: moving.slotId }
              : b,
        )
        return ok(next)
      }
      next.blocks = next.blocks.map((b) =>
        b.id === moving.id ? { ...b, slotId: intent.toSlotId } : b,
      )
      return ok(next)
    }
    // ── 分组行动态化（编辑台二轮 2026-11-07）：新槽位 + 区块一次意图一张快照 ──
    case 'addBlockRow': {
      const rowCount = next.layout.slotGrid?.length ?? next.layout.rowCount
      const headerLevels = next.layout.headerLevels ?? 1
      if (
        !Number.isInteger(intent.aboveRow) ||
        intent.aboveRow < headerLevels ||
        intent.aboveRow > rowCount - 1
      ) {
        return fail('TEMPLATE_INVALID', '分组行只能插在正文行的上方')
      }
      if (visibleRowCount(next) >= LIMITS.maxRows) {
        return fail('LIMIT_ROWS', '最多 20 行，加不下了')
      }
      // 锚点 = 选中行上一行（after-N 一 gap 一槽；渲染按行锚点插行，同 gap 不允许两条）
      const anchor = intent.aboveRow - 1
      const anchorTaken = next.layout.blockSlots.some((s) => {
        const m = /^after-(\d+)$/.exec(s.rowHint ?? '')
        return m !== null && Number(m[1]) === anchor
      })
      if (anchorTaken) {
        return fail('BLOCK_SLOT_OCCUPIED', '这个位置已有分组行，先把旧的挪走或删掉')
      }
      const seq = nextDynamicSeq(next)
      const slotId = `gap-d${seq}`
      const text = intent.text ?? (intent.type === 'groupHeader' ? '分组标题' : '分区')
      next.layout.blockSlots = [
        ...next.layout.blockSlots,
        {
          id: slotId,
          accept: ['sectionBar', 'groupHeader'],
          region: 'between-rows',
          rowHint: `after-${anchor}`,
        },
      ]
      next.blocks = [
        ...next.blocks,
        {
          id: `blk-d${seq}`,
          type: intent.type,
          slotId,
          props:
            intent.type === 'sectionBar'
              ? { label: text, text, styleTier: 1 }
              : { text, styleTier: 1 },
        },
      ]
      return ok(next)
    }
    case 'removeBlockRow': {
      const b = next.blocks.find((x) => x.id === intent.blockId)
      if (!b) return fail('BLOCK_NOT_FOUND', '区块不存在', { blockId: intent.blockId })
      const def = next.layout.blockSlots.find((s) => s.id === b.slotId)
      if (!def || def.region !== 'between-rows') {
        return fail('TEMPLATE_INVALID', '这个区块不是分组行，请用「删除区块」')
      }
      next.blocks = next.blocks.filter((x) => x.id !== b.id)
      next.layout.blockSlots = next.layout.blockSlots.filter((s) => s.id !== def.id)
      return ok(next)
    }
    case 'moveBlockRow': {
      const b = next.blocks.find((x) => x.id === intent.blockId)
      if (!b) return fail('BLOCK_NOT_FOUND', '区块不存在', { blockId: intent.blockId })
      const def = next.layout.blockSlots.find((s) => s.id === b.slotId)
      if (!def || def.region !== 'between-rows') {
        return fail('TEMPLATE_INVALID', '这个区块不能按分组行移动')
      }
      const m = /^after-(\d+)$/.exec(def.rowHint ?? '')
      if (!m) return fail('TEMPLATE_INVALID', '这个区块不能按分组行移动')
      const anchor = Number(m[1])
      const to = anchor + intent.dir
      const headerLevels = next.layout.headerLevels ?? 1
      const rowCount = next.layout.slotGrid?.length ?? next.layout.rowCount
      if (to < headerLevels - 1) return fail('TEMPLATE_INVALID', '已经在最上面了')
      if (to > rowCount - 1) return fail('TEMPLATE_INVALID', '已经在最下面了')
      const taken = next.layout.blockSlots.some((s) => {
        if (s.id === def.id) return false
        const a = /^after-(\d+)$/.exec(s.rowHint ?? '')
        return a !== null && Number(a[1]) === to
      })
      if (taken) {
        return fail('BLOCK_SLOT_OCCUPIED', intent.dir === -1 ? '上一格已有分组行' : '下一格已有分组行')
      }
      next.layout.blockSlots = next.layout.blockSlots.map((s) =>
        s.id === def.id ? { ...s, rowHint: `after-${to}` } : s,
      )
      return ok(next)
    }
    // ── 表名编辑：captionSlot 槽优先（预览/导出同源），无槽模板写 displayName ──
    case 'setCaption': {
      const sid = next.layout.captionSlot
      const text = String(intent.text ?? '')
      if (sid && (sid in next.slots || slotExistsInGrid(next, sid))) {
        next.slots[sid] = mergeSlotValue(next.slots[sid], text)
      } else {
        next.meta = { ...next.meta, displayName: text }
      }
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

/** 动态分组行 id 序号（gap-dN / blk-dN 共用计数；实例内单调不重用） */
function nextDynamicSeq(inst: TemplateInstance): number {
  let max = 0
  for (const s of inst.layout.blockSlots) {
    const m = /^gap-d(\d+)$/.exec(s.id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  for (const b of inst.blocks) {
    const m = /^blk-d(\d+)$/.exec(b.id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max + 1
}

/** 分组行清单（面板「分组」区渲染用）：between-rows 已占用区块，按锚点自上而下 */
export interface GroupRowInfo {
  blockId: string
  slotId: string
  type: 'sectionBar' | 'groupHeader'
  text: string
  /** after-N 的 N（0 基锚点行；区块行显示在该行之后） */
  anchorRow: number
}

export function groupRowBlocks(inst: TemplateInstance): GroupRowInfo[] {
  const out: GroupRowInfo[] = []
  for (const b of inst.blocks) {
    if (b.type !== 'sectionBar' && b.type !== 'groupHeader') continue
    const def = inst.layout.blockSlots.find((s) => s.id === b.slotId)
    if (!def || def.region !== 'between-rows') continue
    const m = /^after-(\d+)$/.exec(def.rowHint ?? '')
    if (!m) continue
    out.push({
      blockId: b.id,
      slotId: b.slotId,
      type: b.type,
      text: String(
        b.type === 'sectionBar'
          ? (b.props?.label ?? b.props?.text ?? '分区')
          : (b.props?.text ?? b.props?.label ?? '分组标题'),
      ),
      anchorRow: Number(m[1]),
    })
  }
  return out.sort((a, b) => a.anchorRow - b.anchorRow)
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
      text:
        block.props?.text ?? block.props?.label ?? defaultBlockText(block.type),
      styleTier: block.props?.styleTier ?? 1,
      ...block.props,
    },
  })
  return ok(next)
}

/** 区块默认文案（二期区块启用后按类型给白话初值） */
function defaultBlockText(type: BlockDesc['type']): string {
  if (type === 'emphFooter') return '注脚内容'
  if (type === 'leftTag') return '标签'
  return '分组标题'
}

export function getSlotDisplayText(v: SlotValue | undefined, placeholder: string): string {
  const t = slotText(v)
  return t === '' ? placeholder : t
}
