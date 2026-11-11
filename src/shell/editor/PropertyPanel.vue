<script setup lang="ts">
import { computed } from 'vue'
import type { CellsSlotObject, ChampionSlotObject, MatchSlotObject } from '@/core'
import { useEditorStore } from '../stores/editor'
import {
  isEmphasizable,
  PALETTES,
  MARK_GLYPH,
  MARK_LABEL,
  MERGE_MAX_SPAN_ROWS,
  MERGE_MAX_SPAN_COLS,
  MERGE_MAX_CLUSTERS,
  RECOMMEND_BADGE_TEXT,
  ROLE_KEYS,
  ROLE_LABELS,
  isRoleOverridden,
  roleColorOf,
  canSetImage,
  clampColWidth,
  colWidthAt,
  slotIdsInRange,
  effectiveKpiCards,
  KPI_CARD_MAX,
  captionText as captionTextOf,
  groupRowBlocks,
  SOFT_BLOCK_COLORS,
  type KpiCard,
  type Align,
  type RoleColorKey,
  type StructuralIntent,
  type ThemeId,
  type Emphasis,
  type MarkValue,
  type SlotValue,
} from '@/core'
import PtButton from '../ui/PtButton.vue'
import PtTooltip from '../ui/PtTooltip.vue'
import PtSegmented from '../ui/PtSegmented.vue'
import { confirmAction } from '../ui/confirm'
import { panelGroupOpen, togglePanelGroup } from './panelGroups'
import { useMergeGates } from './useMergeGates'
import ColorField from './ColorField.vue'

const editor = useEditorStore()

const themes: ThemeId[] = ['T-A', 'T-B', 'T-C']
const themeSwatch = (id: ThemeId) => PALETTES[id].primary

// ── 颜色自定义（FR-C1）：六角色，提交走 setThemeToken / resetThemeTokens ──
const colorRoles: { key: RoleColorKey; label: string }[] = ROLE_KEYS.map((key) => ({
  key,
  label: ROLE_LABELS[key],
}))

function commitColor(role: RoleColorKey, hex: string | null) {
  editor.apply({ kind: 'setThemeToken', token: role, value: hex })
}

function onInvalidColor() {
  editor.showToast('颜色格式不对，请填 6 位十六进制，例如 #1f7a8c')
}

function resetColors() {
  editor.apply({ kind: 'resetThemeTokens' })
}

// ── 格式微调（FR-C2）：行高/字号/内边距三档 + 逐列列宽 ──
const tierOptions = (a: string, b: string, c: string) => [
  { value: 1, label: a },
  { value: 2, label: b },
  { value: 3, label: c },
]

const rowTierOptions = tierOptions('紧凑', '标准', '宽松')
const fontTierOptions = tierOptions('小', '标准', '大')
const padTierOptions = tierOptions('紧', '标准', '松')

const rowTier = computed(() => editor.current?.layout.style?.rowHeightTier ?? 2)
const fontTier = computed(() => editor.current?.layout.style?.fontSizeTier ?? 2)
const padTier = computed(() => editor.current?.layout.style?.paddingTier ?? 2)

const colWidthInputs = computed(() => {
  const n = editor.current?.layout.colCount ?? 0
  return Array.from({ length: n }, (_, c) => ({
    col: c,
    width: editor.current ? colWidthAt(editor.current, c) : 140,
  }))
})

function commitColWidth(col: number, raw: string) {
  const t = raw.trim()
  if (t === '') {
    // 留空 = 该列回默认宽（colWidths 置 null）
    editor.apply({ kind: 'setColWidth', col, width: null })
    return
  }
  const n = Number(t)
  if (!Number.isFinite(n)) {
    editor.showToast('列宽请填数字（64～360），留空恢复默认')
    return
  }
  editor.apply({ kind: 'setColWidth', col, width: clampColWidth(n) })
}

// ── 结构编辑（增量设计 T03）：右栏只留低频设置——摘要卡常显组头，组体为表头层级/上限说明
//    /合并拆分弱化入口/推荐列/删区块。高频的行列增删与换位入口移至画布旁行/列轨道。 ──
const rowCount = computed(() => editor.current?.layout.slotGrid?.length ?? 0)
const colCount = computed(() => editor.current?.layout.colCount ?? 0)
const headerLevels = computed(() => editor.current?.layout.headerLevels ?? 1)

/** 结构变化后原选区/选中槽可能已被 remap，清空防悬挂引用 */
function applyStruct(intent: StructuralIntent): boolean {
  const okApplied = editor.apply(intent)
  if (okApplied) {
    editor.selectionRange = null
    editor.selectedSlotId = null
    editor.selectedBlockId = null
  }
  return okApplied
}

function setHeaderLevels(v: number) {
  applyStruct({ kind: 'setHeaderLevel', levels: v as 1 | 2 | 3 })
}

// ── PX-08 / WP1：合并 / 拆分按钮随选区实时置灰（与画布选区工具条共用 useMergeGates 判定）──
const { mergeGate, splitGate } = useMergeGates()

const marks: Record<MarkValue, string> = { ...MARK_LABEL }
const glyphs: Record<MarkValue, string> = { ...MARK_GLYPH }

function slotDisplay(v: SlotValue | undefined): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'object') {
    if ('mark' in v) return v.mark ? MARK_LABEL[v.mark] : ''
    if ('num' in v) return v.num === null || v.num === undefined ? '' : String(v.num)
    if ('image' in v || 'match' in v || 'cells' in v || 'champion' in v) return ''
    return String((v as unknown as Record<string, unknown>).text ?? '')
  }
  return String(v)
}

// ── R-3 图片区（交互升级 T04）：可设图的 text 槽显示上传/替换/移除 ──

/** 选中槽当前是否已设图 */
const selectedImage = computed<string | null>(() => {
  const sid = editor.selectedSlotId
  const v = sid && editor.current ? editor.current.slots[sid] : undefined
  return v && typeof v === 'object' && 'image' in v ? v.image : null
})

/** 图片能力闸（核内 canSetImage 同源）：存在于 slotGrid、非 readonly、非 locked、kind text/缺省 */
const canImage = computed(() => {
  const inst = editor.current
  const sid = editor.selectedSlotId
  if (!inst || !sid || editor.pastePending) return false
  return canSetImage(inst, sid).ok
})

function onImageFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // 清空以便同一文件可重复选择
  const sid = editor.selectedSlotId
  if (!file || !sid) return
  void editor.uploadImage(sid, file)
}

// ── PX-07：标题改人话——内容摘要 / 行列位置，禁止露出内部 ID（u 序号 / r2c3） ──
const SUMMARY_LIMIT = 8

/** 内容摘要：前 8 字，超出截断加 … */
function summarizeText(s: string): string {
  if (!s) return ''
  const chars = [...s]
  return chars.length > SUMMARY_LIMIT ? chars.slice(0, SUMMARY_LIMIT).join('') + '…' : s
}

/** 槽位在 slotGrid 里的位置（0 基行列）；找不到返回 null */
function slotPosOf(slotId: string): [number, number] | null {
  const grid = editor.current?.layout.slotGrid
  if (!grid) return null
  for (let r = 0; r < grid.length; r++) {
    const c = grid[r]?.indexOf(slotId) ?? -1
    if (c >= 0) return [r, c]
  }
  return null
}

const slotHeadline = computed<string>(() => {
  const sid = editor.selectedSlotId
  if (!sid || !editor.current) return ''
  // R-3：图片槽 headline 显示「图片」（PX-07 人话，不露 data URL）
  const v = editor.current.slots[sid]
  if (v && typeof v === 'object' && 'image' in v) return '图片'
  const summary = summarizeText(slotDisplay(v))
  if (summary) return `当前内容：${summary}`
  const pos = slotPosOf(sid)
  return pos ? `第 ${pos[0] + 1} 行 · 第 ${pos[1] + 1} 列` : ''
})

const blockHeadline = computed<string>(() => {
  const bid = editor.selectedBlockId
  if (!bid || !editor.current) return ''
  const b = editor.current.blocks.find((x) => x.id === bid)
  const text = summarizeText(String(b?.props?.label ?? b?.props?.text ?? ''))
  if (text) return `当前内容：${text}`
  // 空区块 → 人话位置：优先查 slotGrid，再退回区块槽 rowHint（QA Low 修复：
  // after-N 的 N 是 0 基锚点行，区块行插在该行之后 → 1 基展示为第 N+2 行，
  // 与 core/adapter/toOption.ts buildVisualRows 的可视行插入位置同源；
  // left-N（左栏标签）为 1 基第 N+1 行）
  const pos = b ? slotPosOf(b.slotId) : null
  if (pos) return `区块 · 第 ${pos[0] + 1} 行`
  const hint = editor.current.layout.blockSlots.find((s) => s.id === b?.slotId)?.rowHint
  const mAfter = typeof hint === 'string' ? /^after-(\d+)$/.exec(hint) : null
  if (mAfter) return `区块 · 第 ${Number(mAfter[1]) + 2} 行`
  const mLeft = typeof hint === 'string' ? /^left-(\d+)$/.exec(hint) : null
  return mLeft ? `区块 · 第 ${Number(mLeft[1]) + 1} 行` : '区块'
})

// ── Schema 1.5：海报组（表格外纸面文字全量编辑；一次字段修改 = 一步撤销）──
const posterSpec = computed<Record<string, unknown>>(() =>
  (editor.current?.poster ?? {}) as Record<string, unknown>,
)

function setPosterField(key: string, value: unknown) {
  if (!editor.current || editor.pastePending) return
  const next = { ...posterSpec.value }
  if (value === '' || value === undefined || (Array.isArray(value) && value.length === 0)) {
    delete next[key]
  } else {
    next[key] = value
  }
  editor.apply({ kind: 'setPoster', poster: next as never })
}

function posterStr(key: string) {
  return typeof posterSpec.value[key] === 'string' ? (posterSpec.value[key] as string) : ''
}

function posterLines(key: string) {
  const arr = posterSpec.value[key]
  return Array.isArray(arr) ? arr.map(String).join('\n') : ''
}

const posterKicker = computed({
  get: () => posterStr('kicker'),
  set: (v: string) => setPosterField('kicker', v.trim()),
})
const posterTitle = computed({
  get: () => posterStr('title'),
  set: (v: string) => setPosterField('title', v),
})
const posterSubtitle = computed({
  get: () => posterStr('subtitle'),
  set: (v: string) => setPosterField('subtitle', v),
})
const posterLegend = computed({
  get: () => posterStr('legend'),
  set: (v: string) => setPosterField('legend', v.trim()),
})
const posterBadge = computed({
  get: () => posterStr('pageBadge'),
  set: (v: string) => setPosterField('pageBadge', v.trim()),
})
const posterMeta = computed({
  get: () => posterLines('metaLines'),
  set: (v: string) =>
    setPosterField(
      'metaLines',
      v
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean),
    ),
})
const posterFooter = computed({
  get: () => posterLines('footerLines'),
  set: (v: string) =>
    setPosterField(
      'footerLines',
      v
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean),
    ),
})
const posterChips = computed({
  get: () => posterLines('chips'),
  set: (v: string) =>
    setPosterField(
      'chips',
      v
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean),
    ),
})

const slotText = computed({
  get() {
    if (!editor.selectedSlotId || !editor.current) return ''
    return slotDisplay(editor.current.slots[editor.selectedSlotId])
  },
  set(v: string) {
    if (editor.selectedSlotId) editor.setSlotText(editor.selectedSlotId, v)
  },
})

/** 选中槽的声明类型（schema 1.1）；缺省按 text */
const slotKind = computed<'text' | 'number' | 'mark'>(() => {
  const sid = editor.selectedSlotId
  if (!editor.current || !sid) return 'text'
  return editor.current.slotDefs?.[sid]?.kind ?? 'text'
})

// ── Schema 1.5：副行小字 / 同行尾注（text/num 槽对象字段 patch，一步撤销）──
const isStructuredSlot = computed(() => {
  const sid = editor.selectedSlotId
  const v = sid && editor.current ? editor.current.slots[sid] : undefined
  return Boolean(
    v && typeof v === 'object' && ('match' in v || 'cells' in v || 'champion' in v),
  )
})

const isDecoratableSlot = computed(() => {
  const sid = editor.selectedSlotId
  const v = sid && editor.current ? editor.current.slots[sid] : undefined
  if (v === undefined || v === null || typeof v !== 'object') return slotKind.value !== 'mark'
  return !('image' in v) && !('match' in v) && !('cells' in v) && !('champion' in v) && !('mark' in v)
})

/** 读取选中槽的 text/num 对象形态；字符串值先升级为 {text} 对象再 patch */
function patchSlotObject(patch: Record<string, unknown>) {
  const sid = editor.selectedSlotId
  if (!sid || !editor.current || editor.pastePending) return
  const prev = editor.current.slots[sid]
  let base: Record<string, unknown>
  if (prev && typeof prev === 'object' && !('mark' in prev) && !('image' in prev)) {
    base = { ...(prev as unknown as Record<string, unknown>) }
  } else {
    base = { text: typeof prev === 'object' || prev === undefined ? '' : String(prev) }
    if (slotKind.value === 'number') base = { num: null }
  }
  for (const [k, val] of Object.entries(patch)) {
    if (val === undefined || val === '') delete base[k]
    else base[k] = val
  }
  editor.apply({ kind: 'setSlot', slotId: sid, value: base as never })
}

const slotSub = computed({
  get() {
    const sid = editor.selectedSlotId
    const v = sid && editor.current ? editor.current.slots[sid] : undefined
    return v && typeof v === 'object' && 'sub' in v ? String((v as { sub?: string }).sub ?? '') : ''
  },
  set(v: string) {
    if (isDecoratableSlot.value) patchSlotObject({ sub: v })
  },
})

const slotUnit = computed({
  get() {
    const sid = editor.selectedSlotId
    const v = sid && editor.current ? editor.current.slots[sid] : undefined
    if (v && typeof v === 'object' && 'unit' in v) return String((v as { unit?: string }).unit ?? '')
    // num 槽单位由 slotDefs 声明（模板级）
    const sid2 = editor.selectedSlotId
    return sid2 ? editor.current?.slotDefs?.[sid2]?.unit ?? '' : ''
  },
  set(v: string) {
    if (slotKind.value === 'number') return // num 槽单位是模板声明，不在格级改
    if (isDecoratableSlot.value) patchSlotObject({ unit: v })
  },
})

// ── Schema 1.5：槽位装饰编辑（星级/圆点/甘特/时间轴/点线/描边盒/字号倍率/逐格色）──
interface SlotObjRec extends Record<string, unknown> {
  text?: string | number
}

const decorSlot = computed<SlotObjRec | null>(() => {
  const sid = editor.selectedSlotId
  const v = sid && editor.current ? editor.current.slots[sid] : undefined
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  if ('mark' in v || 'image' in v || 'match' in v || 'cells' in v || 'champion' in v) return null
  return v as unknown as SlotObjRec
})

const canDecor = computed(() => decorSlot.value !== null && !editor.pastePending)

function patchDecor(patch: Record<string, unknown>) {
  if (!canDecor.value) return
  patchSlotObject(patch)
}

const slotStars = computed(() => (decorSlot.value?.stars as number | undefined) ?? 0)
function setStars(n: number) {
  patchDecor({ stars: n === 0 ? undefined : n })
}

const slotDot = computed(() => (decorSlot.value?.dot as { color?: string } | undefined) ?? null)
const dotColor = computed(() => slotDot.value?.color ?? '#c0653a')
function toggleDot() {
  patchDecor({ dot: slotDot.value ? undefined : { color: dotColor.value } })
}
function setDotColor(hex: string) {
  if (!slotDot.value) return
  patchDecor({ dot: { color: hex } })
}

const slotGantt = computed(() => (decorSlot.value?.gantt as { from: number; to: number; color?: string; milestone?: boolean } | undefined) ?? null)
function toggleGantt() {
  patchDecor({ gantt: slotGantt.value ? undefined : { from: 0.1, to: 0.6 } })
}
function setGantt(key: 'from' | 'to', raw: string) {
  if (!slotGantt.value) return
  const n = Number(raw)
  if (!Number.isFinite(n)) return
  const v = Math.min(1, Math.max(0, n))
  const next = { ...slotGantt.value, [key]: v }
  if (next.to < next.from) next.to = next.from
  patchDecor({ gantt: next })
}
function setGanttMilestone(on: boolean) {
  if (!slotGantt.value) return
  const next = { ...slotGantt.value }
  if (on) next.milestone = true
  else delete next.milestone
  patchDecor({ gantt: next })
}
function setGanttColor(hex: string) {
  if (!slotGantt.value) return
  patchDecor({ gantt: { ...slotGantt.value, color: hex } })
}

const slotNode = computed(() => decorSlot.value?.node === true)
const slotLeader = computed(() => decorSlot.value?.leader === true)
const slotBoxed = computed(() => decorSlot.value?.boxed === true)

const slotScale = computed(() => (decorSlot.value?.cellScale as number | undefined) ?? 1)
function setScale(v: number) {
  patchDecor({ cellScale: v === 1 ? undefined : v })
}

const slotBg = computed(() => (decorSlot.value?.bg as string | undefined) ?? '')
const slotColor = computed(() => (decorSlot.value?.color as string | undefined) ?? '')
function setSlotBg(hex: string) {
  patchDecor({ bg: hex })
}
function setSlotTextColor(hex: string) {
  patchDecor({ color: hex })
}

// ── Schema 1.5：对阵/冠军/打卡槽专属编辑 ──
const matchSlot = computed(() => {
  const sid = editor.selectedSlotId
  const v = sid && editor.current ? editor.current.slots[sid] : undefined
  return v && typeof v === 'object' && 'match' in v ? (v as { match: MatchSlotObject['match'] }).match : null
})
function patchMatch(patch: Partial<MatchSlotObject['match']>) {
  const sid = editor.selectedSlotId
  if (!sid || !matchSlot.value || editor.pastePending) return
  editor.apply({
    kind: 'setSlot',
    slotId: sid,
    value: { match: { ...matchSlot.value, ...patch } },
  })
}

const championSlot = computed(() => {
  const sid = editor.selectedSlotId
  const v = sid && editor.current ? editor.current.slots[sid] : undefined
  return v && typeof v === 'object' && 'champion' in v
    ? (v as { champion: ChampionSlotObject['champion'] }).champion
    : null
})
function patchChampion(patch: Partial<ChampionSlotObject['champion']>) {
  const sid = editor.selectedSlotId
  if (!sid || !championSlot.value || editor.pastePending) return
  editor.apply({
    kind: 'setSlot',
    slotId: sid,
    value: { champion: { ...championSlot.value, ...patch } },
  })
}

const cellsSlot = computed(() => {
  const sid = editor.selectedSlotId
  const v = sid && editor.current ? editor.current.slots[sid] : undefined
  return v && typeof v === 'object' && 'cells' in v ? (v as { cells: CellsSlotObject['cells'] }).cells : null
})
function patchCells(patch: Partial<CellsSlotObject['cells']>) {
  const sid = editor.selectedSlotId
  if (!sid || !cellsSlot.value || editor.pastePending) return
  editor.apply({
    kind: 'setSlot',
    slotId: sid,
    value: { cells: { ...cellsSlot.value, ...patch } },
  })
}

// ── Schema 1.5：表格形态（样式组；setStylePatch 一步撤销）──
const styleState = computed(() => editor.current?.layout.style ?? {})
const fontFamily = computed<'sans' | 'serif'>(() => styleState.value.fontFamily ?? 'sans')
const borderScheme = computed(() => styleState.value.borderScheme ?? 'full')
const headerShape = computed(() => styleState.value.headerShape ?? 'flat')
const plainHeader = computed(() => styleState.value.plainHeader === true)
const pillInsetV = computed(() => styleState.value.pillInsetV ?? 6)
function patchStyle(patch: Record<string, unknown>) {
  if (!editor.current || editor.pastePending) return
  editor.apply({ kind: 'setStylePatch', patch: patch as never })
}

// ── Schema 1.5：海报背景（bg 形态 / 基色 / 纹理色 / accent / 文字色 / 标题字体 / 留白 / 颜色洗）──
const posterBgMode = computed(() => {
  const p = editor.current?.poster
  return (p?.bg ?? 'solid') as 'solid' | 'dots' | 'ruled' | 'gradient'
})
function setPosterField2(key: string, value: unknown) {
  if (!editor.current || editor.pastePending) return
  const next: Record<string, unknown> = { ...editor.current.poster }
  if (value === '' || value === undefined) delete next[key]
  else next[key] = value
  editor.apply({ kind: 'setPoster', poster: next as never })
}
const posterBgColor = computed(() => (editor.current?.poster?.bgColor as string | undefined) ?? '')
const posterBgAccent = computed(() => (editor.current?.poster?.bgAccent as string | undefined) ?? '')
const posterAccent = computed(() => (editor.current?.poster?.accent as string | undefined) ?? '')
const posterTextColor = computed(() => (editor.current?.poster?.textColor as string | undefined) ?? '')
const posterTitleFont = computed<'sans' | 'serif'>(() => editor.current?.poster?.titleFont ?? 'sans')
const posterPadding = computed(() => editor.current?.poster?.padding ?? 40)
const posterWashes = computed(() => editor.current?.poster?.bgWashes ?? [])
function setWash(index: number, patch: Partial<{ color: string; x: number; y: number; r: number }>) {
  const washes = (editor.current?.poster?.bgWashes ?? []).map((w, i) =>
    i === index ? { ...w, ...patch } : w,
  )
  setPosterField2('bgWashes', washes)
}
function addWash() {
  const washes = editor.current?.poster?.bgWashes ?? []
  if (washes.length >= 6) return
  setPosterField2('bgWashes', [...washes, { color: '#e2ede1', x: 1, y: 0, r: 0.3 }])
}
function removeWash(index: number) {
  setPosterField2(
    'bgWashes',
    (editor.current?.poster?.bgWashes ?? []).filter((_, i) => i !== index),
  )
}

const markValue = computed<MarkValue | null>(() => {
  const sid = editor.selectedSlotId
  const v = sid && editor.current ? editor.current.slots[sid] : undefined
  return v && typeof v === 'object' && 'mark' in v ? v.mark : null
})

/** 三选一：再点当前项即取消（存 null，显示为空槽） */
function setMark(m: MarkValue | null) {
  if (!editor.selectedSlotId) return
  editor.apply({ kind: 'setSlot', slotId: editor.selectedSlotId, value: { mark: m } })
}

const numText = computed({
  get() {
    const sid = editor.selectedSlotId
    const v = sid && editor.current ? editor.current.slots[sid] : undefined
    const n = v && typeof v === 'object' && 'num' in v ? v.num : null
    return n === null || n === undefined ? '' : String(n)
  },
  set(v: string) {
    if (!editor.selectedSlotId) return
    const t = v.trim()
    const n = t === '' ? null : Number(t)
    editor.apply({
      kind: 'setSlot',
      slotId: editor.selectedSlotId,
      value: { num: n !== null && Number.isFinite(n) ? n : null },
    })
  },
})

// ── 推荐列（FR-23）：最多一列，再点取消；无自定义符号/颜色入口 ──
const recommendableCols = computed<number[]>(() => editor.current?.layout.recommendableCols ?? [])
const recommendCol = computed<number | null>(() => editor.current?.highlight?.recommendCol ?? null)

const colLabels = computed<Record<number, string>>(() => {
  const inst = editor.current
  const out: Record<number, string> = {}
  if (!inst) return out
  const headerRow = (inst.layout.headerLevels ?? 1) - 1
  for (const c of recommendableCols.value) {
    const sid = inst.layout.slotGrid?.[headerRow]?.[c]
    out[c] = (sid && slotDisplay(inst.slots[sid])) || `第 ${c + 1} 列`
  }
  return out
})

function toggleRecommend(col: number) {
  editor.apply({ kind: 'setRecommendCol', col: recommendCol.value === col ? null : col })
}

const blockText = computed({
  get() {
    if (!editor.selectedBlockId || !editor.current) return ''
    const b = editor.current.blocks.find((x) => x.id === editor.selectedBlockId)
    if (!b) return ''
    return String(b.props?.text ?? b.props?.label ?? '')
  },
  set(v: string) {
    editor.updateBlockText(v)
  },
})

// ── R-4 区块样式档位（QA Bug #2 收尾）：leftTag 深浅 2 档 / emphFooter 字号 2 档 ──
// 档位语义与渲染单点对齐：toOption.styleForCell（1=tag 深底或常规字号，2=zebra 浅底或 +2px），
// 导出 model.ts emphFooterStyle 消费同一档位；写入走既有 updateBlock 意图（一意图一张撤销快照）。
const selectedBlock = computed(() => {
  const bid = editor.selectedBlockId
  return bid && editor.current ? (editor.current.blocks.find((x) => x.id === bid) ?? null) : null
})

const blockTierVisible = computed(() => {
  const b = selectedBlock.value
  return b !== null && (b.type === 'leftTag' || b.type === 'emphFooter')
})

const blockTierOptions = computed<{ value: number; label: string }[]>(() => {
  const b = selectedBlock.value
  if (!b) return []
  return b.type === 'leftTag'
    ? [
        { value: 1, label: '深色底' },
        { value: 2, label: '浅色底' },
      ]
    : [
        { value: 1, label: '常规' },
        { value: 2, label: '略大' },
      ]
})

const blockTier = computed(() => (selectedBlock.value?.props?.styleTier === 2 ? 2 : 1))

function setBlockTier(v: number) {
  const b = selectedBlock.value
  if (!b || v === blockTier.value) return
  editor.apply({ kind: 'updateBlock', blockId: b.id, props: { styleTier: v as 1 | 2 } })
}

// ── 表名（caption）编辑（编辑台二轮）：captionSlot 槽优先（预览首行/导出同源）──
const captionValue = computed(() => (editor.current ? captionTextOf(editor.current) : ''))

const captionViaSlot = computed(() => {
  const inst = editor.current
  const sid = inst?.layout.captionSlot
  if (!inst || !sid) return false
  return sid in inst.slots || Boolean(inst.layout.slotGrid?.some((row) => row?.includes(sid)))
})

function commitCaption(raw: string) {
  editor.setCaptionText(raw)
}

// ── 分组行动态化（编辑台二轮）：插入 / 上下移动 / 整行删除 ──
const groups = computed(() => (editor.current ? groupRowBlocks(editor.current) : []))

/** 面板当前锚定的正文行（结构行选择优先，其次单元格选区首行） */
const selectedLogicalRow = computed<number | null>(() => {
  const s = editor.structuralSelection
  if (s && s.axis === 'row') return s.index
  const r = editor.selectionRange
  return r ? r.start[0] : null
})

const canInsertGroupAbove = computed(() => {
  const inst = editor.current
  const row = selectedLogicalRow.value
  if (!inst || row === null || editor.pastePending) return false
  const headerLevels = inst.layout.headerLevels ?? 1
  const rowCount = inst.layout.slotGrid?.length ?? inst.layout.rowCount
  return row >= headerLevels && row <= rowCount - 1
})

function insertGroupRow(type: 'groupHeader' | 'sectionBar') {
  const row = selectedLogicalRow.value
  if (row === null) return
  if (editor.apply({ kind: 'addBlockRow', aboveRow: row, type })) {
    editor.showToast(
      type === 'groupHeader' ? '已在选中行上方插入分组标题' : '已在选中行上方插入分区色条',
    )
  }
}

function moveGroupRow(blockId: string, dir: -1 | 1) {
  editor.apply({ kind: 'moveBlockRow', blockId, dir })
}

async function removeGroupRow() {
  const b = selectedBlock.value
  if (!b) return
  const go = await confirmAction({
    title: '删除分组行',
    message: '该分组行（连同槽位）会整行移除，预览与导出同步更新，确定删除？',
    confirmText: '删除',
    danger: true,
  })
  if (!go) return
  if (editor.apply({ kind: 'removeBlockRow', blockId: b.id })) {
    editor.selectedBlockId = null
  }
}

function selectGroup(blockId: string) {
  editor.selectedBlockId = blockId
  editor.selectedSlotId = null
  editor.selectionRange = null
}

/** 选中区块是否落在 between-rows 分组槽（决定上移/下移/删除分组行的可见性） */
const selectedBlockInGroupRow = computed(() => {
  const b = selectedBlock.value
  if (!b || !editor.current) return false
  const def = editor.current.layout.blockSlots.find((s) => s.id === b.slotId)
  return def?.region === 'between-rows'
})

// ── 分组行 / 分区条区块级底色（默认跟主题 primary，文字色按亮度自动黑白）──
const blockColorVisible = computed(() => {
  const b = selectedBlock.value
  return b !== null && (b.type === 'groupHeader' || b.type === 'sectionBar')
})

const SOFT_COLOR_LABELS = ['杏橙', '豆绿', '雾蓝', '浅紫'] as const
const blockColorPresets = SOFT_BLOCK_COLORS.map((hex, i) => ({
  hex,
  label: SOFT_COLOR_LABELS[i] ?? '预设',
}))

const selectedBlockColor = computed(() => {
  const c = selectedBlock.value?.props?.color
  return typeof c === 'string' && c ? c : null
})

function commitBlockColor(hex: string | null) {
  const b = selectedBlock.value
  if (!b) return
  editor.apply({ kind: 'updateBlock', blockId: b.id, props: { color: hex ?? undefined } })
}

const blockColorValue = computed(
  () => selectedBlockColor.value ?? roleColorOf(editor.current, 'primary'),
)

const multiSelect = computed(() => editor.selectionCellCount > 1)

const canEmphasize = computed(() => {
  const inst = editor.current
  if (!inst) return false
  // WP3 多选：选区内有可写格即可批量强调（只读格由核内逐格跳过）
  if (multiSelect.value) return slotIdsInRange(inst, editor.selectionRange!).length > 0
  if (!editor.selectedSlotId) return false
  return isEmphasizable(inst, editor.selectedSlotId)
})

/** WP3：对齐 / 强调在「多选」时作用整块选区（一批一步撤销），单格走既有单点意图 */
function applyAlign(align: Align) {
  if (multiSelect.value) editor.setAlignForSelection(align)
  else editor.setAlign(align)
}

function toggleEm(kind: Emphasis) {
  if (multiSelect.value) {
    editor.toggleEmphasisForSelection(kind)
    return
  }
  if (!editor.selectedSlotId || !editor.current) return
  const v = editor.current.slots[editor.selectedSlotId]
  const cur =
    v && typeof v === 'object' && 'emphasize' in v
      ? Array.isArray(v.emphasize)
        ? [...v.emphasize]
        : v.emphasize
          ? [v.emphasize]
          : []
      : []
  const next = cur.includes(kind) ? cur.filter((x) => x !== kind) : [...cur, kind]
  editor.setEmphasis(next as Emphasis[])
}

async function removeBlock() {
  const go = await confirmAction({
    title: '删除区块',
    message: '删除后预览会同步更新，确定删除此区块？',
    confirmText: '删除',
    danger: true,
  })
  if (!go) return
  editor.removeSelectedBlock()
}

// ── KPI 统计卡（schema 1.2 扩展）：表外 hero 区卡片的增删改与上移下移 ──
const kpiCards = computed<KpiCard[]>(() =>
  editor.current ? effectiveKpiCards(editor.current) : [],
)

const kpiFull = computed(() => kpiCards.value.length >= KPI_CARD_MAX)

function addKpiCard() {
  editor.apply({
    kind: 'addKpiCard',
    card: { id: `kpi-${Date.now()}`, label: '指标名', value: '0' },
  })
}

function patchKpi(cardId: string, patch: Partial<Omit<KpiCard, 'id'>>) {
  editor.apply({ kind: 'updateKpiCard', cardId, patch })
}

/** 文案/数值输入（change 提交，与列宽输入同口径）；数值纯数字时存 number */
function commitKpiText(cardId: string, field: 'label' | 'value' | 'unit', raw: string) {
  const t = raw.trim()
  if (field === 'value') {
    const n = Number(t)
    patchKpi(cardId, { value: t !== '' && Number.isFinite(n) ? n : t })
  } else if (field === 'unit') {
    patchKpi(cardId, { unit: t === '' ? undefined : t })
  } else {
    patchKpi(cardId, { label: raw })
  }
}

function removeKpi(cardId: string) {
  editor.apply({ kind: 'removeKpiCard', cardId })
}

function moveKpi(cardId: string, dir: -1 | 1) {
  editor.apply({ kind: 'moveKpiCard', cardId, dir })
}

// ── 单元格条形（schema 1.2 扩展）：数据格横条开关 + 比例 + 颜色 ──
/** 选中槽当前的 bar 格式（无 = null） */
const selectedBar = computed(() => {
  const sid = editor.selectedSlotId
  const v = sid && editor.current ? editor.current.slots[sid] : undefined
  return v && typeof v === 'object' && 'bar' in v && v.bar && typeof v.bar === 'object' ? v.bar : null
})

/** 条形能力闸：可写数据格（复用强调闸门口径：只读格/首列标签列不开）；mark/图片格无条形语义 */
const canBar = computed(() => {
  const inst = editor.current
  const sid = editor.selectedSlotId
  if (!inst || !sid || editor.pastePending) return false
  const v = inst.slots[sid]
  if (v && typeof v === 'object' && ('mark' in v || 'image' in v)) return false
  return isEmphasizable(inst, sid)
})

/** 开 = 默认 66% 主题色；关 = 清除恢复纯文本格 */
function toggleBar(on: boolean) {
  const sid = editor.selectedSlotId
  if (!sid) return
  editor.apply({ kind: 'setSlotBar', slotId: sid, bar: on ? { ratio: 0.66 } : null })
}

function commitBarRatio(raw: string) {
  const sid = editor.selectedSlotId
  const cur = selectedBar.value
  if (!sid || !cur) return
  const n = Number(raw)
  if (raw.trim() === '' || !Number.isFinite(n)) {
    editor.showToast('比例请填 0～100 的数字')
    return
  }
  const ratio = Math.min(1, Math.max(0, n / 100))
  editor.apply({
    kind: 'setSlotBar',
    slotId: sid,
    bar: { ratio, ...(cur.color ? { color: cur.color } : {}) },
  })
}

/** 条色：hex 覆盖 / null 恢复主题 primary */
function commitBarColor(hex: string | null) {
  const sid = editor.selectedSlotId
  const cur = selectedBar.value
  if (!sid || !cur) return
  editor.apply({
    kind: 'setSlotBar',
    slotId: sid,
    bar: hex ? { ratio: cur.ratio, color: hex } : { ratio: cur.ratio },
  })
}

/** 条形颜色控件当前值（无自定义 = 主题 primary，取色器初始色） */
const barColorValue = computed(() => selectedBar.value?.color ?? roleColorOf(editor.current, 'primary'))
</script>

<template>
  <aside class="props">
    <h3>属性</h3>
    <p class="lead">一键换表头、分区与强调色</p>

    <!-- ── 内容组（PX-16，默认展开）：改的是格子里有什么 ── -->
    <section class="group" data-testid="group-content">
      <button
        type="button"
        class="group-head"
        data-testid="group-head-content"
        :aria-expanded="panelGroupOpen.content"
        @click="togglePanelGroup('content')"
      >
        <i class="arrow" aria-hidden="true">{{ panelGroupOpen.content ? '▼' : '▶' }}</i>内容
      </button>
      <div v-show="panelGroupOpen.content" class="group-body">
        <!-- 表名（caption）：有 captionSlot 的模板预览首行与导出同步；无槽模板写导出标题 -->
        <div class="section">
          <h4>表名</h4>
          <input
            class="caption-input"
            type="text"
            data-testid="caption-input"
            :value="captionValue"
            :disabled="editor.pastePending"
            placeholder="表格标题"
            aria-label="表名"
            @change="commitCaption(($event.target as HTMLInputElement).value)"
          />
          <p class="hint">
            {{ captionViaSlot ? '表格首行标题与导出标题同步更新' : '写入导出 HTML / PNG 的标题（本模板预览无标题行）' }}
          </p>
        </div>

        <div v-if="editor.selectedSlotId" class="section">
          <h4>槽位文案</h4>
          <!-- PX-07：人话标题（内容摘要 / 行列位置），不露内部 ID -->
          <p class="headline" data-testid="slot-headline">{{ slotHeadline }}</p>
          <!-- R-3 图片区：可设图的 text 槽（含已设图）显示上传/替换/移除 -->
          <div v-if="canImage || selectedImage" class="image-area" data-testid="image-area">
            <template v-if="selectedImage">
              <img class="thumb" :src="selectedImage" alt="已设置的图片" data-testid="image-thumb" />
              <div class="row">
                <PtTooltip text="换一张图片放进这个格子">
                  <label class="file-btn">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      data-testid="image-file-replace"
                      @change="onImageFile"
                    />
                    替换图片
                  </label>
                </PtTooltip>
                <PtTooltip text="移除这张图片，格子恢复为文字格">
                  <PtButton
                    variant="ghost"
                    data-testid="image-remove"
                    :disabled="editor.pastePending"
                    @click="editor.removeImage(editor.selectedSlotId!)"
                  >
                    移除图片
                  </PtButton>
                </PtTooltip>
              </div>
            </template>
            <template v-else>
              <PtTooltip text="上传一张图片放进这个格子">
                <label class="file-btn">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    data-testid="image-file"
                    @change="onImageFile"
                  />
                  上传图片
                </label>
              </PtTooltip>
            </template>
            <p class="hint">PNG / JPG / WebP / GIF，单张 2MB 内；动图按第一帧显示。</p>
          </div>
          <!-- 三态符号槽：只有三选一，无自定义符号/颜色入口（OUT-13 / TC-PT-075） -->
          <template v-if="slotKind === 'mark'">
            <div class="row" role="radiogroup" aria-label="支持状态">
              <PtButton
                v-for="(label, k) in marks"
                :key="k"
                variant="ghost"
                :class="{ on: markValue === k }"
                :aria-pressed="markValue === k"
                :disabled="editor.pastePending"
                @click="setMark(markValue === k ? null : (k as MarkValue))"
              >
                {{ glyphs[k as MarkValue] }} {{ label }}
              </PtButton>
            </div>
            <p class="hint">符号与颜色随主题，不支持自定义。</p>
          </template>
          <!-- 数值槽：只能改数字，格式由模板决定 -->
          <template v-else-if="slotKind === 'number'">
            <input
              class="num"
              :value="numText"
              type="text"
              inputmode="decimal"
              placeholder="填写数字"
              @change="numText = ($event.target as HTMLInputElement).value"
            />
            <p v-if="slotUnit" class="hint">单位：{{ slotUnit }}（由模板定义）</p>
          </template>
          <template v-else>
            <!-- 结构化槽（对阵/冠军/打卡）只显示专属编辑器，不展示通用文字区（防误写覆盖） -->
            <textarea
              v-if="!selectedImage && !isStructuredSlot"
              v-model="slotText"
              rows="3"
              data-testid="slot-text"
              @blur="editor.endTextSession()"
            />
            <!-- Schema 1.5：副行小字 / 同行尾注（模板自带的双行格在这里逐格可改） -->
            <template v-if="!selectedImage && isDecoratableSlot">
              <div class="deco-fields" data-testid="slot-deco-fields">
                <label class="mini-label" for="slot-sub">副行小字（格子里的第二行）</label>
                <input
                  id="slot-sub"
                  type="text"
                  :value="slotSub"
                  :disabled="editor.pastePending"
                  placeholder="如：李老师 · 302"
                  @change="slotSub = ($event.target as HTMLInputElement).value"
                />
                <label class="mini-label" for="slot-unit">同行尾注（主文字后的小字）</label>
                <input
                  id="slot-unit"
                  type="text"
                  :value="slotUnit"
                  :disabled="editor.pastePending"
                  placeholder="如：主项 / 收尾（可留空）"
                  @change="slotUnit = ($event.target as HTMLInputElement).value"
                />
              </div>
              <!-- Schema 1.5：装饰元素（星级/圆点/甘特/时间轴/点线/描边盒/字号倍率/逐格色） -->
              <div v-if="canDecor" class="deco-fields" data-testid="slot-deco-tools">
                <label class="mini-label">星级（0 = 清除）</label>
                <div class="row" role="radiogroup" aria-label="星级">
                  <PtButton
                    v-for="n in 5"
                    :key="'star-' + n"
                    variant="ghost"
                    :class="{ on: slotStars >= n }"
                    :aria-pressed="slotStars >= n"
                    :disabled="editor.pastePending"
                    @click="setStars(slotStars === n ? n - 1 : n)"
                  >
                    ★
                  </PtButton>
                  <PtButton variant="ghost" :disabled="editor.pastePending" @click="setStars(0)">清</PtButton>
                </div>
                <label class="mini-label">状态圆点</label>
                <div class="row">
                  <PtButton
                    variant="ghost"
                    :class="{ on: !!slotDot }"
                    :aria-pressed="!!slotDot"
                    :disabled="editor.pastePending"
                    @click="toggleDot"
                  >
                    {{ slotDot ? '● 有圆点' : '○ 无圆点' }}
                  </PtButton>
                  <input
                    v-if="slotDot"
                    type="color"
                    class="mini-color"
                    :value="dotColor"
                    aria-label="圆点颜色"
                    @change="setDotColor(($event.target as HTMLInputElement).value)"
                  />
                </div>
                <label class="mini-label">甘特条</label>
                <div class="row">
                  <PtButton
                    variant="ghost"
                    :class="{ on: !!slotGantt }"
                    :aria-pressed="!!slotGantt"
                    :disabled="editor.pastePending"
                    @click="toggleGantt"
                  >
                    {{ slotGantt ? '移除甘特' : '添加甘特' }}
                  </PtButton>
                </div>
                <template v-if="slotGantt">
                  <div class="row">
                    <label class="mini-label" for="gantt-from">起</label>
                    <input
                      id="gantt-from"
                      class="num-sm"
                      type="text"
                      inputmode="decimal"
                      :value="slotGantt.from"
                      @change="setGantt('from', ($event.target as HTMLInputElement).value)"
                    />
                    <label class="mini-label" for="gantt-to">止</label>
                    <input
                      id="gantt-to"
                      class="num-sm"
                      type="text"
                      inputmode="decimal"
                      :value="slotGantt.to"
                      @change="setGantt('to', ($event.target as HTMLInputElement).value)"
                    />
                    <input
                      type="color"
                      class="mini-color"
                      :value="slotGantt.color || '#2f3630'"
                      aria-label="甘特条颜色"
                      @change="setGanttColor(($event.target as HTMLInputElement).value)"
                    />
                  </div>
                  <label class="zebra">
                    <input
                      type="checkbox"
                      :checked="!!slotGantt.milestone"
                      :disabled="editor.pastePending"
                      @change="setGanttMilestone(($event.target as HTMLInputElement).checked)"
                    />
                    里程碑（终点菱形）
                  </label>
                </template>
                <div class="row">
                  <PtButton
                    variant="ghost"
                    :class="{ on: slotNode }"
                    :aria-pressed="slotNode"
                    :disabled="editor.pastePending"
                    @click="patchDecor({ node: !slotNode || undefined })"
                  >
                    {{ slotNode ? '● 时间轴' : '○ 时间轴' }}
                  </PtButton>
                  <PtButton
                    variant="ghost"
                    :class="{ on: slotLeader }"
                    :aria-pressed="slotLeader"
                    :disabled="editor.pastePending"
                    @click="patchDecor({ leader: !slotLeader || undefined })"
                  >
                    {{ slotLeader ? '● 点线' : '○ 点线' }}
                  </PtButton>
                  <PtButton
                    variant="ghost"
                    :class="{ on: slotBoxed }"
                    :aria-pressed="slotBoxed"
                    :disabled="editor.pastePending"
                    @click="patchDecor({ boxed: !slotBoxed || undefined })"
                  >
                    {{ slotBoxed ? '▣ 描边盒' : '▢ 描边盒' }}
                  </PtButton>
                </div>
                <label class="mini-label">字号倍率</label>
                <div class="row" role="radiogroup" aria-label="字号倍率">
                  <PtButton
                    v-for="sc in [1, 1.25, 1.5]"
                    :key="'sc-' + sc"
                    variant="ghost"
                    :class="{ on: slotScale === sc }"
                    :aria-pressed="slotScale === sc"
                    :disabled="editor.pastePending"
                    @click="setScale(sc)"
                  >
                    {{ sc }}×
                  </PtButton>
                </div>
                <label class="mini-label" for="slot-bg">格子底色</label>
                <div class="row">
                  <input
                    id="slot-bg"
                    type="color"
                    class="mini-color"
                    :value="slotBg || '#f6f0e3'"
                    aria-label="格子底色"
                    @change="setSlotBg(($event.target as HTMLInputElement).value)"
                  />
                  <PtButton variant="ghost" :disabled="editor.pastePending" @click="setSlotBg('')">清除</PtButton>
                </div>
                <label class="mini-label" for="slot-textcolor">文字颜色</label>
                <div class="row">
                  <input
                    id="slot-textcolor"
                    type="color"
                    class="mini-color"
                    :value="slotColor || '#1a1a1a'"
                    aria-label="文字颜色"
                    @change="setSlotTextColor(($event.target as HTMLInputElement).value)"
                  />
                  <PtButton variant="ghost" :disabled="editor.pastePending" @click="setSlotTextColor('')">清除</PtButton>
                </div>
              </div>
            </template>
            <!-- Schema 1.5：对阵卡编辑（bracket 槽） -->
            <div v-if="matchSlot" class="deco-fields" data-testid="match-editor">
              <label class="mini-label" for="match-a">上卡 · 队名</label>
              <input
                id="match-a"
                type="text"
                :value="matchSlot.a"
                @change="patchMatch({ a: ($event.target as HTMLInputElement).value })"
              />
              <label class="mini-label" for="match-sa">上卡 · 比分</label>
              <input
                id="match-sa"
                type="text"
                :value="matchSlot.sa"
                @change="patchMatch({ sa: ($event.target as HTMLInputElement).value })"
              />
              <label class="mini-label" for="match-b">下卡 · 队名</label>
              <input
                id="match-b"
                type="text"
                :value="matchSlot.b"
                @change="patchMatch({ b: ($event.target as HTMLInputElement).value })"
              />
              <label class="mini-label" for="match-sb">下卡 · 比分</label>
              <input
                id="match-sb"
                type="text"
                :value="matchSlot.sb"
                @change="patchMatch({ sb: ($event.target as HTMLInputElement).value })"
              />
              <label class="zebra">
                <input
                  type="checkbox"
                  :checked="!!matchSlot.winA"
                  @change="patchMatch({ winA: ($event.target as HTMLInputElement).checked, winB: false })"
                />
                上方队伍胜出
              </label>
              <label class="zebra">
                <input
                  type="checkbox"
                  :checked="!!matchSlot.winB"
                  @change="patchMatch({ winB: ($event.target as HTMLInputElement).checked, winA: false })"
                />
                下方队伍胜出
              </label>
            </div>
            <!-- Schema 1.5：冠军卡编辑 -->
            <div v-if="championSlot" class="deco-fields" data-testid="champion-editor">
              <label class="mini-label" for="champ-title">小标</label>
              <input
                id="champ-title"
                type="text"
                :value="championSlot.title || ''"
                @change="patchChampion({ title: ($event.target as HTMLInputElement).value })"
              />
              <label class="mini-label" for="champ-name">冠军名</label>
              <input
                id="champ-name"
                type="text"
                :value="championSlot.name"
                @change="patchChampion({ name: ($event.target as HTMLInputElement).value })"
              />
              <label class="mini-label" for="champ-note">备注</label>
              <input
                id="champ-note"
                type="text"
                :value="championSlot.note || ''"
                @change="patchChampion({ note: ($event.target as HTMLInputElement).value })"
              />
            </div>
            <!-- Schema 1.5：打卡矩阵编辑 -->
            <div v-if="cellsSlot" class="deco-fields" data-testid="cells-editor">
              <label class="mini-label" for="cells-pattern">打卡串（1 = 完成，0 = 未完成）</label>
              <textarea
                id="cells-pattern"
                rows="2"
                :value="cellsSlot.pattern"
                @change="patchCells({ pattern: ($event.target as HTMLTextAreaElement).value.replace(/[^01]/g, '') })"
              ></textarea>
              <label class="mini-label" for="cells-today">「今天」位置（0 起，留空无）</label>
              <input
                id="cells-today"
                class="num-sm"
                type="text"
                inputmode="numeric"
                :value="cellsSlot.today === undefined ? '' : String(cellsSlot.today)"
                @change="
                  patchCells({
                    today:
                      ($event.target as HTMLInputElement).value === ''
                        ? undefined
                        : Number(($event.target as HTMLInputElement).value),
                  })
                "
              />
            </div>
          </template>
          <!-- WP3：多选时按钮作用于整块选区（一批一步撤销） -->
          <p v-if="multiSelect" class="hint" data-testid="selection-count">
            已选 {{ editor.selectionCellCount }} 格，下面的对齐与强调会一起改
          </p>
          <div class="row">
            <PtButton variant="ghost" :disabled="editor.pastePending" @click="applyAlign('left')">左</PtButton>
            <PtButton variant="ghost" :disabled="editor.pastePending" @click="applyAlign('center')">中</PtButton>
            <PtButton variant="ghost" :disabled="editor.pastePending" @click="applyAlign('right')">右</PtButton>
          </div>
          <div class="row">
            <PtTooltip text="给选中格子加红字">
              <PtButton variant="ghost" :disabled="!canEmphasize || editor.pastePending" @click="toggleEm('red')">红字</PtButton>
            </PtTooltip>
            <PtTooltip text="加粗选中格子">
              <PtButton variant="ghost" :disabled="!canEmphasize || editor.pastePending" @click="toggleEm('bold')">加粗</PtButton>
            </PtTooltip>
            <PtTooltip text="给选中格子加底色">
              <PtButton variant="ghost" :disabled="!canEmphasize || editor.pastePending" @click="toggleEm('bg')">底色</PtButton>
            </PtTooltip>
          </div>
          <p v-if="!canEmphasize && !multiSelect" class="hint">此处由模板固定，不能强调</p>
          <!-- 单元格条形（schema 1.2 扩展）：数据格横条开关 + 比例 0~100 + 颜色 -->
          <div v-if="canBar" class="bar-area" data-testid="bar-area">
            <label class="zebra">
              <input
                type="checkbox"
                :checked="!!selectedBar"
                :disabled="editor.pastePending"
                data-testid="bar-toggle"
                @change="toggleBar(($event.target as HTMLInputElement).checked)"
              />
              条形
            </label>
            <template v-if="selectedBar">
              <div class="field">
                <span>比例</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  :value="Math.round(selectedBar.ratio * 100)"
                  :disabled="editor.pastePending"
                  aria-label="条形比例百分数"
                  data-testid="bar-ratio"
                  @change="commitBarRatio(($event.target as HTMLInputElement).value)"
                />
              </div>
              <div class="field">
                <span>条色</span>
                <input
                  type="color"
                  :value="barColorValue"
                  :disabled="editor.pastePending"
                  aria-label="条形颜色"
                  data-testid="bar-color"
                  @change="commitBarColor(($event.target as HTMLInputElement).value)"
                />
                <PtButton
                  v-if="selectedBar.color"
                  variant="ghost"
                  :disabled="editor.pastePending"
                  data-testid="bar-color-reset"
                  @click="commitBarColor(null)"
                >
                  恢复主题色
                </PtButton>
              </div>
              <p class="hint">条宽 = 比例 × 格子内容宽，颜色默认跟主题。</p>
            </template>
          </div>
        </div>

                <!-- Schema 1.5：海报组（表格外纸面文字；无 poster 的模板编辑即创建） -->
        <div class="section" data-testid="poster-group">
          <h4>海报（标题区 / 注脚）</h4>
          <p class="hint">表格画布之外的纸面文字：标题区、右上信息、底部注脚与页码。</p>
          <div class="deco-fields">
            <label class="mini-label">背景形态</label>
            <div class="row" role="radiogroup" aria-label="背景形态">
              <PtButton
                v-for="opt in [
                  { v: 'solid', label: '纯色' },
                  { v: 'dots', label: '点纹' },
                  { v: 'ruled', label: '横线' },
                  { v: 'gradient', label: '渐变' },
                ]"
                :key="'bg-' + opt.v"
                variant="ghost"
                :class="{ on: posterBgMode === opt.v }"
                :aria-pressed="posterBgMode === opt.v"
                :disabled="editor.pastePending"
                @click="setPosterField2('bg', opt.v)"
              >
                {{ opt.label }}
              </PtButton>
            </div>
            <div class="row">
              <label class="mini-label" for="poster-bgcolor">纸面基色</label>
              <input
                id="poster-bgcolor"
                type="color"
                class="mini-color"
                :value="posterBgColor || '#f7f3e6'"
                aria-label="纸面基色"
                @change="setPosterField2('bgColor', ($event.target as HTMLInputElement).value)"
              />
              <label class="mini-label" for="poster-bgaccent">纹理 / 渐变第二色</label>
              <input
                id="poster-bgaccent"
                type="color"
                class="mini-color"
                :value="posterBgAccent || '#d8d2bd'"
                aria-label="纹理第二色"
                @change="setPosterField2('bgAccent', ($event.target as HTMLInputElement).value)"
              />
            </div>
            <!-- Schema 1.4：角部颜色洗（非均匀渐变） -->
            <label class="mini-label">颜色洗（角部渐变斑；最多 6 个）</label>
            <div v-for="(wash, wi) in posterWashes" :key="'wash-' + wi" class="row">
              <input
                type="color"
                class="mini-color"
                :value="wash.color"
                :aria-label="'洗色 ' + (wi + 1)"
                @change="setWash(wi, { color: ($event.target as HTMLInputElement).value })"
              />
              <input
                class="num-sm"
                type="text"
                inputmode="decimal"
                :value="String(wash.x)"
                :aria-label="'洗 x ' + (wi + 1)"
                @change="setWash(wi, { x: Number(($event.target as HTMLInputElement).value) || 0 })"
              />
              <input
                class="num-sm"
                type="text"
                inputmode="decimal"
                :value="String(wash.y)"
                :aria-label="'洗 y ' + (wi + 1)"
                @change="setWash(wi, { y: Number(($event.target as HTMLInputElement).value) || 0 })"
              />
              <input
                class="num-sm"
                type="text"
                inputmode="decimal"
                :value="String(wash.r ?? 0.35)"
                :aria-label="'洗半径 ' + (wi + 1)"
                @change="setWash(wi, { r: Number(($event.target as HTMLInputElement).value) || 0.1 })"
              />
              <PtButton variant="ghost" @click="removeWash(wi)">删</PtButton>
            </div>
            <PtButton variant="ghost" :disabled="posterWashes.length >= 6" @click="addWash">+ 加颜色洗</PtButton>
            <div class="row">
              <label class="mini-label" for="poster-accent">强调色</label>
              <input
                id="poster-accent"
                type="color"
                class="mini-color"
                :value="posterAccent || '#3e7d5e'"
                aria-label="海报强调色"
                @change="setPosterField2('accent', ($event.target as HTMLInputElement).value)"
              />
              <label class="mini-label" for="poster-tc">标题文字色</label>
              <input
                id="poster-tc"
                type="color"
                class="mini-color"
                :value="posterTextColor || '#24534a'"
                aria-label="标题文字色"
                @change="setPosterField2('textColor', ($event.target as HTMLInputElement).value)"
              />
            </div>
            <label class="mini-label">标题字体</label>
            <div class="row" role="radiogroup" aria-label="标题字体">
              <PtButton
                variant="ghost"
                :class="{ on: posterTitleFont === 'sans' }"
                :aria-pressed="posterTitleFont === 'sans'"
                :disabled="editor.pastePending"
                @click="setPosterField2('titleFont', 'sans')"
              >
                无衬线
              </PtButton>
              <PtButton
                variant="ghost"
                :class="{ on: posterTitleFont === 'serif' }"
                :aria-pressed="posterTitleFont === 'serif'"
                :disabled="editor.pastePending"
                @click="setPosterField2('titleFont', 'serif')"
              >
                衬线
              </PtButton>
            </div>
            <label class="mini-label" for="poster-pad">纸面留白（px）</label>
            <input
              id="poster-pad"
              class="num-sm"
              type="text"
              inputmode="numeric"
              :value="String(posterPadding)"
              @change="setPosterField2('padding', Number(($event.target as HTMLInputElement).value) || 40)"
            />
            <label class="mini-label" for="poster-kicker">眉标（英文小字）</label>
            <input
              id="poster-kicker"
              type="text"
              :value="posterKicker"
              :disabled="editor.pastePending"
              placeholder="如：CLASS TIMETABLE · AUTUMN 2026"
              @change="posterKicker = ($event.target as HTMLInputElement).value"
            />
            <label class="mini-label" for="poster-title">大标题</label>
            <input
              id="poster-title"
              type="text"
              :value="posterTitle"
              :disabled="editor.pastePending"
              placeholder="表格大标题（留空 = 不显示）"
              @change="posterTitle = ($event.target as HTMLInputElement).value"
            />
            <label class="mini-label" for="poster-subtitle">副标题</label>
            <input
              id="poster-subtitle"
              type="text"
              :value="posterSubtitle"
              :disabled="editor.pastePending"
              @change="posterSubtitle = ($event.target as HTMLInputElement).value"
            />
            <label class="mini-label" for="poster-chips">徽章卡（每行一个，第一个黑底）</label>
            <textarea
              id="poster-chips"
              rows="2"
              :value="posterChips"
              :disabled="editor.pastePending"
              placeholder="如：容量 17 组 / 天"
              @change="posterChips = ($event.target as HTMLTextAreaElement).value"
            ></textarea>
            <label class="mini-label" for="poster-legend">图例 / 说明行</label>
            <input
              id="poster-legend"
              type="text"
              :value="posterLegend"
              :disabled="editor.pastePending"
              placeholder="如：■ 完成　□ 未完成"
              @change="posterLegend = ($event.target as HTMLInputElement).value"
            />
            <label class="mini-label" for="poster-meta">右上信息（每行一条）</label>
            <textarea
              id="poster-meta"
              rows="2"
              :value="posterMeta"
              :disabled="editor.pastePending"
              @change="posterMeta = ($event.target as HTMLTextAreaElement).value"
            ></textarea>
            <label class="mini-label" for="poster-footer">底部注脚（每行一条）</label>
            <textarea
              id="poster-footer"
              rows="2"
              :value="posterFooter"
              :disabled="editor.pastePending"
              @change="posterFooter = ($event.target as HTMLTextAreaElement).value"
            ></textarea>
            <label class="mini-label" for="poster-badge">页码徽标</label>
            <input
              id="poster-badge"
              type="text"
              :value="posterBadge"
              :disabled="editor.pastePending"
              placeholder="如：02 / 04"
              @change="posterBadge = ($event.target as HTMLInputElement).value"
            />
          </div>
        </div>

        <div v-if="editor.selectedBlockId" class="section">
          <h4>区块</h4>
          <!-- PX-07：区块同理显示文字摘要或「区块 · 第 X 行」 -->
          <p class="headline" data-testid="block-headline">{{ blockHeadline }}</p>
          <textarea v-model="blockText" rows="2" @blur="editor.endTextSession()" />
          <!-- R-4 区块样式档位（QA Bug #2 收尾，T04 偏差③ tooltip 随之挂上）：
               leftTag 深浅 2 档 / emphFooter 字号 2 档；档位常量与渲染单点在 toOption.styleForCell -->
          <div v-if="blockTierVisible" class="field" data-testid="block-tier">
            <span>样式档位</span>
            <PtTooltip text="切换区块样式档位">
              <PtSegmented
                :options="blockTierOptions"
                :model-value="blockTier"
                :disabled="editor.pastePending"
                @update:model-value="setBlockTier"
              />
            </PtTooltip>
          </div>
          <!-- 分组行 / 分区条底色：柔彩预设 + 自定义 hex；缺省跟主题表头色 -->
          <div v-if="blockColorVisible" class="block-color" data-testid="block-color">
            <span class="lbl">底色</span>
            <div class="swatches">
              <PtTooltip v-for="p in blockColorPresets" :key="p.hex" :text="`底色换成${p.label}`">
                <button
                  type="button"
                  class="swatch"
                  :class="{ on: selectedBlockColor === p.hex }"
                  :style="{ background: p.hex }"
                  :data-testid="`block-color-${p.label}`"
                  :disabled="editor.pastePending"
                  :aria-label="`${p.label}底色`"
                  @click="commitBlockColor(p.hex)"
                />
              </PtTooltip>
              <label class="custom-color">
                <input
                  type="color"
                  :value="blockColorValue"
                  :disabled="editor.pastePending"
                  aria-label="自定义底色"
                  data-testid="block-color-custom"
                  @change="commitBlockColor(($event.target as HTMLInputElement).value)"
                />
                自定义
              </label>
              <PtButton
                v-if="selectedBlockColor"
                variant="ghost"
                :disabled="editor.pastePending"
                data-testid="block-color-reset"
                @click="commitBlockColor(null)"
              >
                跟主题
              </PtButton>
            </div>
            <p class="hint">文字色按底色亮度自动黑白；导出 HTML / PNG 同步。</p>
          </div>
          <!-- 分组行操作：上移 / 下移（改锚点）；整行删除见下方「删除分组行」 -->
          <div v-if="selectedBlockInGroupRow" class="row" data-testid="group-row-ops">
            <PtTooltip text="分组行上移一格">
              <PtButton variant="ghost" :disabled="editor.pastePending" data-testid="block-move-up" @click="selectedBlock && moveGroupRow(selectedBlock.id, -1)">上移</PtButton>
            </PtTooltip>
            <PtTooltip text="分组行下移一格">
              <PtButton variant="ghost" :disabled="editor.pastePending" data-testid="block-move-down" @click="selectedBlock && moveGroupRow(selectedBlock.id, 1)">下移</PtButton>
            </PtTooltip>
            <PtTooltip text="整行删除该分组（连同槽位）">
              <PtButton variant="danger" :disabled="editor.pastePending" data-testid="block-remove-row" @click="removeGroupRow">删除分组行</PtButton>
            </PtTooltip>
          </div>
        </div>
      </div>
    </section>

    <!-- ── 统计卡组（schema 1.2 扩展，默认收起）：表外 KPI 卡片增删改与排序 ── -->
    <section class="group" data-testid="group-kpi">
      <button
        type="button"
        class="group-head"
        data-testid="group-head-kpi"
        :aria-expanded="panelGroupOpen.kpi"
        @click="togglePanelGroup('kpi')"
      >
        <i class="arrow" aria-hidden="true">{{ panelGroupOpen.kpi ? '▼' : '▶' }}</i>统计卡
      </button>
      <!-- 组头摘要卡常显：N/6 张 -->
      <p class="structure-summary" data-testid="kpi-summary">
        {{ kpiCards.length }}/{{ KPI_CARD_MAX }} 张 · 表格上方一排展示
      </p>
      <div v-show="panelGroupOpen.kpi" class="group-body">
        <p class="hint">统计卡显示在表格上方，导出 HTML / PNG 一并带上；最多 {{ KPI_CARD_MAX }} 张。</p>
        <div v-for="(card, i) in kpiCards" :key="card.id" class="kpi-item" :data-testid="`kpi-item-${i}`">
          <div class="kpi-item-head">
            <span class="kpi-item-name">第 {{ i + 1 }} 张</span>
            <div class="kpi-item-ops">
              <PtTooltip text="与上一张互换位置">
                <PtButton variant="ghost" :disabled="editor.pastePending || i === 0" :data-testid="`kpi-up-${i}`" @click="moveKpi(card.id, -1)">上移</PtButton>
              </PtTooltip>
              <PtTooltip text="与下一张互换位置">
                <PtButton variant="ghost" :disabled="editor.pastePending || i === kpiCards.length - 1" :data-testid="`kpi-down-${i}`" @click="moveKpi(card.id, 1)">下移</PtButton>
              </PtTooltip>
              <PtTooltip text="删除这张统计卡">
                <PtButton variant="ghost" :disabled="editor.pastePending" :data-testid="`kpi-del-${i}`" @click="removeKpi(card.id)">删除</PtButton>
              </PtTooltip>
            </div>
          </div>
          <label class="kpi-field">
            文案
            <input
              type="text"
              :value="card.label"
              :disabled="editor.pastePending"
              :aria-label="`第${i + 1}张统计卡文案`"
              :data-testid="`kpi-label-${i}`"
              @change="commitKpiText(card.id, 'label', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <div class="kpi-row">
            <label class="kpi-field">
              数值
              <input
                type="text"
                inputmode="decimal"
                :value="String(card.value)"
                :disabled="editor.pastePending"
                :aria-label="`第${i + 1}张统计卡数值`"
                :data-testid="`kpi-value-${i}`"
                @change="commitKpiText(card.id, 'value', ($event.target as HTMLInputElement).value)"
              />
            </label>
            <label class="kpi-field kpi-unit">
              单位
              <input
                type="text"
                :value="card.unit ?? ''"
                placeholder="元 / %"
                :disabled="editor.pastePending"
                :aria-label="`第${i + 1}张统计卡单位`"
                :data-testid="`kpi-unit-${i}`"
                @change="commitKpiText(card.id, 'unit', ($event.target as HTMLInputElement).value)"
              />
            </label>
          </div>
          <label class="zebra">
            <input
              type="checkbox"
              :checked="!!card.accent"
              :disabled="editor.pastePending"
              :data-testid="`kpi-accent-${i}`"
              @change="patchKpi(card.id, { accent: ($event.target as HTMLInputElement).checked || undefined })"
            />
            强调卡（强调色描边）
          </label>
          <!-- Schema 1.5：独立数值色（strip 竖条 / plain 数字 / cards 数值同用） -->
          <div class="row">
            <label class="mini-label" :for="'kpi-color-' + card.id">数值色</label>
            <input
              :id="'kpi-color-' + card.id"
              type="color"
              class="mini-color"
              :value="card.color || '#2e4a3e'"
              :aria-label="'数值色 ' + card.label"
              @change="patchKpi(card.id, { color: ($event.target as HTMLInputElement).value })"
            />
            <PtButton variant="ghost" @click="patchKpi(card.id, { color: undefined })">跟随主题</PtButton>
          </div>
        </div>
        <PtButton
          variant="ghost"
          :disabled="kpiFull || editor.pastePending"
          data-testid="kpi-add"
          @click="addKpiCard"
        >
          添加统计卡
        </PtButton>
      </div>
    </section>

    <!-- ── 样式组（PX-16，默认收起）：改外观 ── -->
    <section class="group" data-testid="group-style">
      <button
        type="button"
        class="group-head"
        data-testid="group-head-style"
        :aria-expanded="panelGroupOpen.style"
        @click="togglePanelGroup('style')"
      >
        <i class="arrow" aria-hidden="true">{{ panelGroupOpen.style ? '▼' : '▶' }}</i>样式
      </button>
      <div v-show="panelGroupOpen.style" class="group-body">
        <div class="section">
          <h4>主题</h4>
          <div class="themes">
            <!-- PX-15：粘贴预览期禁用主题切换（置灰 + tooltip 说明，与 pastePending 其他禁用态同源） -->
            <PtTooltip
              v-for="id in themes"
              :key="id"
              :text="editor.pastePending ? '粘贴预览期间不能切换主题，先确认或取消粘贴' : `切换到${editor.themeLabel(id)}`"
            >
              <button
                type="button"
                class="theme-btn"
                :class="{ on: editor.current?.themeId === id }"
                :style="{ '--swatch': themeSwatch(id) }"
                :disabled="editor.pastePending"
                @click="editor.setTheme(id)"
              >
                <i />
                {{ editor.themeLabel(id) }}
              </button>
            </PtTooltip>
          </div>
          <PtTooltip :text="editor.pastePending ? '粘贴预览期间不能切换斑马纹' : '切换表格斑马纹'">
            <label class="zebra">
              <input
                type="checkbox"
                :checked="editor.current?.zebraOn !== false"
                :disabled="editor.pastePending"
                @change="editor.setZebra(($event.target as HTMLInputElement).checked)"
              />
              斑马纹
            </label>
          </PtTooltip>
        </div>

        <!-- 颜色自定义（FR-C1）：改的是当前主题的角色色，随改随生效 -->
        <div class="section">
          <h4>颜色</h4>
          <ColorField
            v-for="r in colorRoles"
            :key="r.key"
            :role="r.key"
            :label="r.label"
            :value="roleColorOf(editor.current, r.key).toLowerCase()"
            :overridden="isRoleOverridden(editor.current, r.key)"
            :disabled="editor.pastePending"
            @commit="(hex) => commitColor(r.key, hex)"
            @invalid="onInvalidColor"
          />
          <PtButton variant="ghost" :disabled="editor.pastePending" @click="resetColors">
            全部恢复预设
          </PtButton>
        </div>

        <!-- 格式微调（FR-C2）：全局档位 + 逐列列宽，超界由核内收口 -->
        <div class="section">
          <h4>格式微调</h4>
          <div class="field">
            <span>行高</span>
            <PtSegmented
              :options="rowTierOptions"
              :model-value="rowTier"
              :disabled="editor.pastePending"
              @update:model-value="(v) => editor.apply({ kind: 'setRowHeightTier', tier: v as 1 | 2 | 3 })"
            />
          </div>
          <div class="field">
            <span>字号</span>
            <PtSegmented
              :options="fontTierOptions"
              :model-value="fontTier"
              :disabled="editor.pastePending"
              @update:model-value="(v) => editor.apply({ kind: 'setFontSizeTier', tier: v as 1 | 2 | 3 })"
            />
          </div>
          <div class="field">
            <span>内边距</span>
            <PtSegmented
              :options="padTierOptions"
              :model-value="padTier"
              :disabled="editor.pastePending"
              @update:model-value="(v) => editor.apply({ kind: 'setPaddingTier', tier: v as 1 | 2 | 3 })"
            />
          </div>
          <div class="colwidths">
            <label v-for="item in colWidthInputs" :key="item.col" class="cw">
              第{{ item.col + 1 }}列
              <input
                type="number"
                min="64"
                max="360"
                :value="item.width"
                :disabled="editor.pastePending"
                :aria-label="`第${item.col + 1}列宽`"
                @change="commitColWidth(item.col, ($event.target as HTMLInputElement).value)"
              />
            </label>
          </div>
          <p class="hint">列宽范围 64～360，留空恢复默认。</p>
          <div class="section" data-testid="table-shape">
            <h4>表格形态</h4>
            <label class="mini-label">字体族</label>
            <div class="row" role="radiogroup" aria-label="字体族">
              <PtButton
                variant="ghost"
                :class="{ on: fontFamily === 'sans' }"
                :aria-pressed="fontFamily === 'sans'"
                :disabled="editor.pastePending"
                @click="patchStyle({ fontFamily: 'sans' })"
              >
                无衬线
              </PtButton>
              <PtButton
                variant="ghost"
                :class="{ on: fontFamily === 'serif' }"
                :aria-pressed="fontFamily === 'serif'"
                :disabled="editor.pastePending"
                @click="patchStyle({ fontFamily: 'serif' })"
              >
                衬线
              </PtButton>
            </div>
            <label class="mini-label">边框方案</label>
            <div class="row" role="radiogroup" aria-label="边框方案">
              <PtButton
                v-for="opt in [
                  { v: 'full', label: '全框' },
                  { v: 'rows', label: '仅横线' },
                  { v: 'cols', label: '仅竖线' },
                  { v: 'none', label: '无框' },
                ]"
                :key="'bs-' + opt.v"
                variant="ghost"
                :class="{ on: borderScheme === opt.v }"
                :aria-pressed="borderScheme === opt.v"
                :disabled="editor.pastePending"
                @click="patchStyle({ borderScheme: opt.v })"
              >
                {{ opt.label }}
              </PtButton>
            </div>
            <label class="mini-label">表头形状</label>
            <div class="row" role="radiogroup" aria-label="表头形状">
              <PtButton
                variant="ghost"
                :class="{ on: headerShape === 'flat' && !plainHeader }"
                :aria-pressed="headerShape === 'flat' && !plainHeader"
                :disabled="editor.pastePending"
                @click="patchStyle({ headerShape: 'flat', plainHeader: undefined })"
              >
                色块
              </PtButton>
              <PtButton
                variant="ghost"
                :class="{ on: plainHeader }"
                :aria-pressed="plainHeader"
                :disabled="editor.pastePending"
                @click="patchStyle({ plainHeader: true })"
              >
                无底色
              </PtButton>
              <PtButton
                variant="ghost"
                :class="{ on: headerShape === 'pill' }"
                :aria-pressed="headerShape === 'pill'"
                :disabled="editor.pastePending"
                @click="patchStyle({ headerShape: 'pill', plainHeader: undefined })"
              >
                药丸
              </PtButton>
            </div>
            <template v-if="headerShape === 'pill'">
              <label class="mini-label" for="pill-inset">药丸上下留边（px，越小越饱满）</label>
              <input
                id="pill-inset"
                class="num-sm"
                type="text"
                inputmode="numeric"
                :value="String(pillInsetV)"
                @change="
                  patchStyle({
                    pillInsetV: Number(($event.target as HTMLInputElement).value) || 0,
                  })
                "
              />
            </template>
          </div>
        </div>
      </div>
    </section>

    <!-- ── 结构组（PX-16，默认收起）：组头摘要卡常显，组体只留低频设置（增量设计 T03）── -->
    <section class="group" data-testid="group-structure">
      <button
        type="button"
        class="group-head"
        data-testid="group-head-structure"
        :aria-expanded="panelGroupOpen.structure"
        @click="togglePanelGroup('structure')"
      >
        <i class="arrow" aria-hidden="true">{{ panelGroupOpen.structure ? '▼' : '▶' }}</i>结构
      </button>
      <!-- 结构摘要卡：组头常显（组体收起也可见）；e2e 同步点 structure-summary -->
      <p class="structure-summary" data-testid="structure-summary">
        {{ rowCount }} 行 × {{ colCount }} 列 · {{ headerLevels }} 层表头
      </p>
      <div v-show="panelGroupOpen.structure" class="group-body">
        <div class="section">
          <p class="hint">
            加删行列与换位请用表格旁的行/列轨道：点序号选中整行/列，「+」插入，「…」打开菜单。
            行列上限 20 行 × 12 列；至少保留 1 行表头 + 1 行内容、1 列。
          </p>
          <div class="field">
            <span>表头层数</span>
            <PtSegmented
              :options="[
                { value: 1, label: '1 层' },
                { value: 2, label: '2 层' },
                { value: 3, label: '3 层' },
              ]"
              :model-value="headerLevels"
              :disabled="editor.pastePending"
              @update:model-value="setHeaderLevels"
            />
          </div>
        </div>

        <!-- 分组行动态化（编辑台二轮）：选中正文行 → 上方插入分组；清单点选 / 上移下移 / 整行删除 -->
        <div class="section">
          <h4>分组行</h4>
          <p class="hint">
            选中一个正文行后，可在它上方插入分组标题或分区色条（上限受 20 行约束）；
            已有分组行可上下移动或整行删除，也可以直接拖动画布上的区块把手换位。
          </p>
          <div class="row">
            <PtTooltip :text="canInsertGroupAbove ? '在选中行上方插入分组标题行' : '先在表格里选中一个正文行'">
              <PtButton
                variant="ghost"
                :disabled="!canInsertGroupAbove"
                data-testid="group-add"
                @click="insertGroupRow('groupHeader')"
              >
                插入分组标题
              </PtButton>
            </PtTooltip>
            <PtTooltip :text="canInsertGroupAbove ? '在选中行上方插入分区色条' : '先在表格里选中一个正文行'">
              <PtButton
                variant="ghost"
                :disabled="!canInsertGroupAbove"
                data-testid="section-add"
                @click="insertGroupRow('sectionBar')"
              >
                插入分区色条
              </PtButton>
            </PtTooltip>
          </div>
          <div v-if="groups.length" class="group-list" data-testid="group-list">
            <button
              v-for="(g, i) in groups"
              :key="g.blockId"
              type="button"
              class="group-item"
              :class="{ on: editor.selectedBlockId === g.blockId }"
              :data-testid="`group-item-${i}`"
              @click="selectGroup(g.blockId)"
            >
              <span class="g-name">{{ g.text || (g.type === 'groupHeader' ? '分组标题' : '分区') }}</span>
              <span class="g-pos">第 {{ g.anchorRow + 2 }} 行上方</span>
            </button>
          </div>
        </div>

        <!-- 合并/拆分弱化入口（主理人拍板保留）：主入口是画布选区浮动工具条 -->
        <div class="section">
          <h4>合并 / 拆分</h4>
          <!-- 上限数字读 layoutScales 常量单点（GC-21），随拍板值 6/8/30 同步；白名单口径按 PRD §5.5 -->
          <p class="hint">
            选中格子后也可用画布上的浮动工具条；一次最多合并 {{ MERGE_MAX_SPAN_ROWS }} 行或
            {{ MERGE_MAX_SPAN_COLS }} 列、每表最多 {{ MERGE_MAX_CLUSTERS }} 处，合并须在模板允许区内。
            模板固定的合并区不能动，拆分要选中整个合并区。
          </p>
          <div class="row">
            <PtTooltip :text="mergeGate.reason || '合并当前选区的格子'">
              <PtButton
                variant="ghost"
                :disabled="!mergeGate.ok"
                data-testid="merge-btn"
                @click="editor.mergeSelection()"
              >
                合并选区
              </PtButton>
            </PtTooltip>
            <PtTooltip :text="splitGate.reason || '拆分当前选中的合并区'">
              <PtButton
                variant="ghost"
                :disabled="!splitGate.ok"
                data-testid="split-btn"
                @click="editor.splitSelection()"
              >
                拆分
              </PtButton>
            </PtTooltip>
          </div>
        </div>

        <!-- 推荐列开关：只有选列/取消，最多一列（FR-23） -->
        <div v-if="recommendableCols.length" class="section">
          <h4>推荐列</h4>
          <p class="hint">最多标一列；再点一次取消推荐。</p>
          <div class="row">
            <PtTooltip
              v-for="c in recommendableCols"
              :key="c"
              text="把这一列标记为推荐列，再点一次取消"
            >
              <PtButton
                variant="ghost"
                :class="{ on: recommendCol === c }"
                :disabled="editor.pastePending"
                @click="toggleRecommend(c)"
              >
                {{ colLabels[c] }}<template v-if="recommendCol === c">（{{ RECOMMEND_BADGE_TEXT }}）</template>
              </PtButton>
            </PtTooltip>
          </div>
        </div>

        <!-- 删区块（动结构）从内容组拆出：编辑文字在「内容」，删除入口在这里。
             分组行区块走「删除分组行」（连槽位整行删，见内容组区块区），此处不再重复给入口 -->
        <div v-if="editor.selectedBlockId && !selectedBlockInGroupRow" class="section">
          <h4>区块操作</h4>
          <PtButton variant="danger" :disabled="editor.pastePending" @click="removeBlock">删除区块</PtButton>
        </div>
      </div>
    </section>
  </aside>
</template>

<style scoped>
.props {
  width: 260px;
  flex-shrink: 0;
  border-left: 1px solid var(--pt-border);
  padding: 12px;
  background: #fff;
  overflow: auto;
}
h3 {
  margin: 0;
  font-size: 14px;
}
.lead {
  font-size: 12px;
  color: #6b7280;
  margin: 4px 0 12px;
}
/* ── PX-16 分组折叠 ── */
.group {
  margin-bottom: 8px;
  border-top: 1px solid var(--pt-border);
}
.group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  border: 0;
  background: transparent;
  padding: 8px 2px;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--pt-muted);
  cursor: pointer;
  text-align: left;
}
.group-head .arrow {
  font-style: normal;
  font-size: 10px;
  flex-shrink: 0;
}
.group-body {
  padding: 0 2px 8px;
}
/* T03：结构摘要卡（组头常显，组体收起也可见） */
.structure-summary {
  margin: 0 2px 6px;
  font-size: 12px;
  color: var(--pt-muted);
  /* T10：行列层数计数对齐（属性式） */
  font-variant-numeric: tabular-nums;
}
.section {
  margin-bottom: 16px;
}
h4 {
  margin: 0 0 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
}
.themes {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.theme-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--pt-border);
  background: #fff;
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  font-size: 13px;
}
.theme-btn.on {
  border-color: var(--pt-primary);
  background: var(--pt-tag);
}
/* PX-15：粘贴预览期主题按钮置灰 */
.theme-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.theme-btn i {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  background: var(--swatch);
}
.zebra {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 8px;
  font-size: 13px;
}
textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--pt-border);
  border-radius: 8px;
  padding: 8px;
  font: inherit;
  resize: vertical;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.field {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.field > span {
  font-size: 12px;
  color: var(--pt-muted);
  width: 56px;
  flex-shrink: 0;
}
.colwidths {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.cw {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--pt-muted);
}
.cw input {
  width: 60px;
  border: 1px solid var(--pt-border);
  border-radius: 6px;
  padding: 3px 6px;
  font: inherit;
  font-size: 12px;
  /* T10：数值输入对齐（属性式） */
  font-variant-numeric: tabular-nums;
}
.row :deep(.on),
.on {
  border-color: var(--pt-primary);
  background: var(--pt-tag);
}
.num {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--pt-border);
  border-radius: 8px;
  padding: 8px;
  font: inherit;
  /* T10：数值输入对齐（属性式） */
  font-variant-numeric: tabular-nums;
}
.headline {
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--pt-muted);
}
/* R-3 图片区 */
.image-area {
  margin-bottom: 8px;
}
.image-area .thumb {
  display: block;
  max-width: 100%;
  max-height: 96px;
  border: 1px solid var(--pt-border);
  border-radius: 8px;
  object-fit: cover;
}
.file-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px dashed var(--pt-border);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  cursor: pointer;
  background: var(--pt-paper);
  /* T10：hover 轻反馈具名过渡（120~150ms，禁 all） */
  transition: border-color 130ms ease;
}
.file-btn input[type='file'] {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
@media (hover: hover) {
  .file-btn:hover {
    border-color: var(--pt-primary);
  }
}
@media (prefers-reduced-motion: reduce) {
  .file-btn {
    transition: none;
  }
}
.hint {
  font-size: 12px;
  color: #6b7280;
}
/* ── 编辑台二轮：表名输入 / 分组行底色 / 分组行清单 ── */
.caption-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--pt-border);
  border-radius: 8px;
  padding: 8px;
  font: inherit;
}
.caption-input:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.block-color {
  margin-top: 10px;
}
.block-color .lbl {
  display: block;
  font-size: 12px;
  color: var(--pt-muted);
  margin-bottom: 6px;
}
.swatches {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.swatch {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid var(--pt-border);
  cursor: pointer;
  padding: 0;
}
.swatch.on {
  outline: 2px solid var(--pt-primary);
  outline-offset: 1px;
}
.swatch:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.custom-color {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--pt-muted);
}
.custom-color input[type='color'] {
  width: 28px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--pt-border);
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}
.group-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}
.group-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  border: 1px solid var(--pt-border);
  border-radius: 8px;
  background: var(--pt-paper);
  padding: 6px 8px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}
.group-item.on {
  border-color: var(--pt-primary);
  background: var(--pt-tag);
}
.g-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.g-pos {
  color: var(--pt-muted);
  flex: none;
  font-variant-numeric: tabular-nums;
}
/* ── schema 1.2 扩展：单元格条形区 ── */
.bar-area {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed var(--pt-border);
}
.bar-area .field {
  margin-top: 6px;
}
.bar-area .field > span {
  width: 40px;
}
.bar-area input[type='number'] {
  width: 72px;
  border: 1px solid var(--pt-border);
  border-radius: 6px;
  padding: 4px 6px;
  font: inherit;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.bar-area input[type='color'] {
  width: 28px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--pt-border);
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}
/* ── schema 1.2 扩展：KPI 统计卡列表 ── */
.kpi-item {
  margin-bottom: 10px;
  padding: 8px;
  border: 1px solid var(--pt-border);
  border-radius: 8px;
}
.kpi-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 6px;
}
.kpi-item-name {
  font-size: 12px;
  color: var(--pt-muted);
  flex-shrink: 0;
}
.kpi-item-ops {
  display: flex;
  gap: 4px;
}
.kpi-field {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--pt-muted);
  margin-top: 6px;
}
.kpi-field input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--pt-border);
  border-radius: 6px;
  padding: 4px 6px;
  font: inherit;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.kpi-row {
  display: flex;
  gap: 6px;
}
.kpi-row .kpi-field {
  flex: 1;
}
.kpi-row .kpi-unit {
  flex: none;
  width: 40%;
}

.deco-fields {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}
.mini-label {
  font-size: 11px;
  color: var(--pt-muted);
  margin-top: 4px;
}
.mini-color {
  width: 34px;
  height: 30px;
  padding: 2px;
  border: 1px solid var(--pt-border);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}
.num-sm {
  width: 64px;
  border: 1px solid var(--pt-border);
  border-radius: 6px;
  padding: 5px 8px;
  font: inherit;
}
.deco-fields input,
.deco-fields textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--pt-border);
  border-radius: 6px;
  padding: 6px 8px;
  font: inherit;
}
</style>
