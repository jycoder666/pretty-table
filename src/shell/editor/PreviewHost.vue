<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import {
  loadRenderCore,
  type CoreHandle,
  type KpiCard,
  measureContentSize,
  findSlotAtVisual,
  findMergeAt,
  visualToLogicalRow,
  effectivePalette,
  effectiveKpiCards,
  kpiHeroStyle,
  kpiCardStyle,
  kpiValueStyle,
  kpiUnitStyle,
  kpiLabelStyle,
  kpiValueText,
  kpiStripStyle,
  kpiStripItemStyle,
  kpiStripLabelStyle,
  kpiStripValueStyle,
  hasPoster,
  posterWrapStyle,
  posterHeaderStyles,
  posterFooterStyles,
  posterPadding,
  posterColors,
  posterChipsWrapStyle,
  posterChipStyle,
  posterLegendStyle,
  type PosterSpec,
  type Palette,
} from '@/core'
import {
  editableCellAt,
  extendSelection,
  moveSelection,
  selectionToTsv,
  tabSelection,
  visualRowOfCell,
} from './cellNav'
import InlineEditor from './InlineEditor.vue'
import { useEditorStore } from '../stores/editor'
import SlotOverlay from '../dnd/SlotOverlay.vue'
import BlockDragHandle from '../dnd/BlockDragHandle.vue'
import {
  BLOCK_TYPE_LABEL,
  computeDropTargets,
  estimateCellRects,
  totalContentWidth,
  type CellRect,
  type DropTarget,
} from '../dnd/slotDnd'
import { usePlaceSession } from '../dnd/placeSession'
import { locateVisual } from './previewHit'
import { expandRectSelection, selectionCellRects, structuralRects } from './selection'
import SelectionToolbar from './SelectionToolbar.vue'
import StructureActionMenu from './StructureActionMenu.vue'
import PasteEntry from '../paste/PasteEntry.vue'
import {
  attachRailHost,
  resetRailGeometry,
  setRailScrollTop,
  syncRailGeometry,
} from './railGeometry'
import {
  closeStructureMenu,
  openStructureMenu,
  structureMenuState,
} from './structureMenu'
import {
  isExitStructuralKey,
  isMenuKey,
  isSelectColKey,
  isSelectRowKey,
} from './structureKeys'

const editor = useEditorStore()
const session = usePlaceSession()
const el = ref<HTMLDivElement | null>(null)
const host = ref<HTMLDivElement | null>(null)
const dropTargets = ref<DropTarget[]>([])
const hostOrigin = ref({ left: 0, top: 0 })
/** PX-04 v2：当前生效的格几何（渲染核视口坐标优先，未就绪回退纯算术） */
const cellRects = shallowRef<CellRect[][]>([])
let handle: CoreHandle | null = null
let offViewport: (() => void) | null = null
let offColResize: (() => void) | null = null
let rafId = 0
let scrollRafId = 0
// 缺陷②（T07）：window/祖先滚动容器的 rAF 合帧 id（与 host 内滚动的 scrollRafId 分开）
let winScrollRafId = 0
// T34：渲染核经 loadRenderCore 动态加载（VTable 独立 chunk）；卸载竞态用 disposed 收口
let disposed = false

/**
 * 当前格几何：渲染器权威坐标（滚动 / 冻结列 / 列宽调整感知）→ 回退 estimateCellRects。
 * PX-04 v2：纯算术几何与 VTable 内部滚动脱节（宽表横滚后点选/描边/落点错位），
 * 有核时一律问渲染器，无核（首帧/降级）才用同源算术兜底。
 */
function readGeometry(): CellRect[][] {
  if (!editor.current) return []
  const fromCore = handle?.getCellViewportRects()
  if (fromCore) return fromCore
  return estimateCellRects(editor.current)
}

function refreshTargets() {
  if (!editor.current) {
    cellRects.value = []
    dropTargets.value = []
    session.setCatalogTargets([])
    syncRailGeometry([], { left: 0, top: 0, width: 0, height: 0 }, { left: 0, top: 0 }, false)
    return
  }
  // 几何坐标系原点 = .vtable-root 原点；叠加层定位系原点 = 宿主 padding box，
  // 两者差即 offsetLeft/Top（当前布局为 0，CSS 变动时自动跟随）
  hostOrigin.value = { left: el.value?.offsetLeft ?? 0, top: el.value?.offsetTop ?? 0 }
  const rects = readGeometry()
  cellRects.value = rects
  dropTargets.value = computeDropTargets(editor.current, rects)
  session.setCatalogTargets(dropTargets.value)
  // A4：轨道几何桥整包同步（PreviewHost 是唯一写入方）；host border-box 视口矩形一并给出
  const hr = host.value?.getBoundingClientRect()
  syncRailGeometry(
    rects,
    hr ? { left: hr.left, top: hr.top, width: hr.width, height: hr.height } : { left: 0, top: 0, width: 0, height: 0 },
    hostOrigin.value,
    !!handle,
  )
}

/** 滚动 / 列宽拖拽 / 重绘完成 → rAF 合帧重算（叠加层与落点跟随视口） */
function scheduleRefresh() {
  if (rafId) return
  rafId = requestAnimationFrame(() => {
    rafId = 0
    refreshTargets()
  })
}

onMounted(async () => {
  if (!el.value || !editor.current) return
  const { mount } = await loadRenderCore()
  // 动态加载期间可能已卸载 / 切空：不再挂载
  if (disposed || !el.value || !editor.current) return
  handle = mount(el.value, {
    initial: editor.current,
    onError: (err) => editor.showToast(err.message),
  })
  // PX-04 v2：视口变化跟随；列宽拖拽结束落模型（一步撤销、可刷新后保留）
  offViewport = handle.onViewportChange(scheduleRefresh)
  offColResize = handle.onColResize((_col, widths) => editor.applyCanvasColWidths(widths))
  // A4：host 纵向 DOM 滚动不触发 VTable scroll 事件 → 独立监听写入轨道几何桥
  // （rAF 合帧，与 scheduleRefresh 同路；passive 不阻塞滚动）
  host.value?.addEventListener('scroll', onHostScroll, { passive: true })
  attachRailHost(host.value)
  refreshTargets()
  window.addEventListener('resize', refreshTargets)
  // 缺陷②（T07）：hostLeft/hostTop 是 refresh 时一次性视口坐标，页面级滚动后轨道/菜单错位。
  // scroll 不冒泡但走捕获——capture=true 覆盖 window 与任意祖先滚动容器；passive 不阻塞滚动。
  window.addEventListener('scroll', onWinScroll, { passive: true, capture: true })
})

/** host 纵滚 → scrollTop 进几何桥（rAF 合帧，行轨道冻结对齐） */
function onHostScroll() {
  if (scrollRafId) return
  scrollRafId = requestAnimationFrame(() => {
    scrollRafId = 0
    setRailScrollTop(host.value?.scrollTop ?? 0)
    scheduleRefresh()
  })
}

/**
 * 缺陷②（T07）：window/祖先滚动容器滚动 → rAF 合帧重算 hostRect → 轨道几何桥整包刷新。
 * 菜单 pos 是响应式 computed（读 railGeometry），几何刷新即自动重锚；
 * 与 onHostScroll 各持独立 rAF id，host 内滚动路径不受影响（setRailScrollTop 语义不变）。
 */
function onWinScroll() {
  if (winScrollRafId) return
  winScrollRafId = requestAnimationFrame(() => {
    winScrollRafId = 0
    refreshTargets()
  })
}

watch(
  () => editor.state?.version,
  () => {
    if (handle && editor.current) handle.loadTemplate(editor.current)
    refreshTargets()
  },
)

onBeforeUnmount(() => {
  disposed = true
  window.removeEventListener('resize', refreshTargets)
  window.removeEventListener('scroll', onWinScroll, { capture: true })
  if (rafId) cancelAnimationFrame(rafId)
  if (scrollRafId) cancelAnimationFrame(scrollRafId)
  if (winScrollRafId) cancelAnimationFrame(winScrollRafId)
  host.value?.removeEventListener('scroll', onHostScroll)
  offViewport?.()
  offColResize?.()
  handle?.destroy()
  handle = null
  attachRailHost(null)
  resetRailGeometry()
})

function onClick(ev: MouseEvent) {
  // WP3：点画布顺手把焦点给画布，键盘（方向键 / Tab / 键入进编辑）才有落点。
  // VTable 在 canvas 上有自己的指针处理，点击不保证把焦点交给外层容器，这里显式聚焦。
  // 放在 suppressClick 判定之前：框选（拖选）结束也要能接着用键盘。
  focusCanvas()
  if (suppressClick) {
    suppressClick = false
    return
  }
  if (session.overlayVisible.value) return
  if (!editor.current || !el.value) return
  const rect = el.value.getBoundingClientRect()
  const localX = ev.clientX - rect.left
  const localY = ev.clientY - rect.top
  // PX-04 v2：命中直接问渲染器（滚动 / 冻结列 / 列宽调整感知）；渲染核未就绪时回退同源算术
  const pos = handle ? handle.hitTest(localX, localY) : locateVisual(editor.current, localX, localY)
  if (!pos) return
  const { row, col } = pos
  const found = findSlotAtVisual(editor.current, row, col)
  if (found.isBlockSlot && found.slotId) {
    const b = editor.current.blocks.find((x) => x.slotId === found.slotId)
    editor.selectedBlockId = b?.id ?? null
    editor.selectedSlotId = null
    return
  }
  editor.selectedSlotId = found.slotId
  editor.selectedBlockId = null
  const logical = visualToLogicalRow(editor.current, row)
  if (logical === null) {
    editor.selectionRange = null
    return
  }
  // R-2：Shift+点终点 → 与既有选区起点围成矩形（点起点 → 普通点击 → Shift 点终点）
  if (ev.shiftKey && editor.selectionRange) {
    editor.selectionRange = expandRectSelection(editor.selectionRange, logical, col)
    return
  }
  const merge = findMergeAt(editor.current.layout, logical, col)
  if (merge) editor.selectionRange = merge
  else editor.selectionRange = { start: [logical, col], end: [logical, col] }
}

// R-2：选区可视化（壳叠加层描边；几何来自渲染核视口坐标，无核回退同源算术）。
// BugFix（T03 居中布局）：rect 坐标系原点 = .vtable-root；叠加层定位系 = .preview-host
// padding box——两者差 = hostOrigin（offsetLeft/Top），必须加上。旧布局 offset 恒 0 掩盖了该换算。
function toHostRects(rects: { left: number; top: number; width: number; height: number }[]) {
  const o = hostOrigin.value
  return rects.map((r) => ({
    left: r.left + o.left,
    top: r.top + o.top,
    width: r.width,
    height: r.height,
  }))
}

const selectionRects = computed(() => {
  if (!editor.current || !editor.selectionRange) return []
  return toHostRects(selectionCellRects(editor.current, editor.selectionRange, cellRects.value))
})

// A5：整行/整列选择高亮叠加层（浅色；几何与描边同源，随内容滚动）。
// T02：rangeEnd 存在时高亮整段区间（区间内跨行合并区照常并块）
const structuralOverlay = computed(() => {
  const inst = editor.current
  const s = editor.structuralSelection
  if (!inst || !s) return []
  return toHostRects(structuralRects(inst, s.axis, s.index, cellRects.value, s.rangeEnd))
})

/**
 * e2e 确定性同步点（A6 规则 5 / T02 区间扩展）：单选 'row:3' / 'col:2'（格式不变），
 * 区间 'row:1-3'（0 基 [index, rangeEnd]），无选择 ''。
 */
const structuralLabel = computed(() => {
  const s = editor.structuralSelection
  if (!s) return ''
  if (s.rangeEnd !== undefined && s.rangeEnd !== s.index) return `${s.axis}:${s.index}-${s.rangeEnd}`
  return `${s.axis}:${s.index}`
})

// A13-2（假设口径）：表格窄于可用宽时 mount 元素动态宽度居中（width: min(100%, 总宽)），
// 超宽回 100% 走 VTable 内部横滚——只改容器宽度，绝不缩放（UX-S07/S10 回归保护）。
const mountStyle = computed(() => {
  const inst = editor.current
  if (!inst) return undefined
  const base: Record<string, string> = {
    width: `min(100%, ${Math.ceil(totalContentWidth(inst))}px)`,
    margin: '0 auto',
  }
  // Schema 1.3 海报模式：表格按内容全高呈现（设计稿一比一；无海报保持既有 400px 内滚行为）
  if (posterSpec.value) {
    const m = measureContentSize(inst)
    base.height = `${m.height + 2}px`
  }
  return base
})

// ── Schema 1.2 扩展：KPI 统计卡 hero 区（表格上方一排等宽卡片，无卡片零占位）──
// 样式与导出同源：卡片底/边框/文字色全部经 kpiCards.ts 样式函数从 palettes 派生。
const kpiCards = computed<KpiCard[]>(() =>
  editor.current ? effectiveKpiCards(editor.current) : [],
)

const kpiPalette = computed(() => effectivePalette(editor.current))

const kpiHeroWrapStyle = computed(() => {
  const inst = editor.current
  if (!inst) return undefined
  return {
    width: `min(100%, ${Math.ceil(totalContentWidth(inst))}px)`,
    margin: '12px auto 0',
  }
})

function kpiRowStyleOf(): string {
  const pal = kpiPalette.value
  return pal ? kpiHeroStyle(pal) : ''
}

function kpiCardStyleOf(card: KpiCard): string {
  const pal = kpiPalette.value
  return pal ? kpiCardStyle(card, pal) : ''
}

function kpiValueStyleOf(card: KpiCard): string {
  const pal = kpiPalette.value
  return pal ? kpiValueStyle(card, pal) : ''
}

function kpiUnitStyleOf(): string {
  const pal = kpiPalette.value
  return pal ? kpiUnitStyle(pal) : ''
}

function kpiLabelStyleOf(): string {
  const pal = kpiPalette.value
  return pal ? kpiLabelStyle(pal) : ''
}

// ── Schema 1.3：strip 统计条形态（细分隔条；样式与 HTML/PNG 同源 kpiCards.ts）──
const kpiIsStrip = computed(() => editor.current?.kpiStyle === 'strip')

function kpiStripRowStyleOf(): string {
  const pal = kpiPalette.value
  return pal ? kpiStripStyle(pal) : ''
}

function kpiStripItemStyleOf(card: KpiCard, index: number): string {
  const pal = kpiPalette.value
  return pal ? kpiStripItemStyle(card, pal, index) : ''
}

function kpiStripLabelStyleOf(): string {
  const pal = kpiPalette.value
  return pal ? kpiStripLabelStyle(pal) : ''
}

function kpiStripValueStyleOf(card: KpiCard): string {
  const pal = kpiPalette.value
  return pal ? kpiStripValueStyle(card, pal) : ''
}

// ── Schema 1.3：海报层（预览 DOM 与 HTML/PNG 三方同源 posterStyle.ts）──
const posterSpec = computed<PosterSpec | undefined>(() =>
  editor.current && hasPoster(editor.current) ? editor.current.poster : undefined,
)
const posterPalette = computed<Palette | null>(() =>
  posterSpec.value ? effectivePalette(editor.current) : null,
)
const isPoster = computed(() => Boolean(posterSpec.value && posterPalette.value))

const posterSheetStyle = computed(() => {
  const p = posterSpec.value
  const pal = posterPalette.value
  if (!p || !pal || !editor.current) return undefined
  const innerW = Math.ceil(totalContentWidth(editor.current))
  const pad = posterPadding(p)
  return {
    ...cssTextToStyle(posterWrapStyle(p, pal)),
    // 海报是定尺寸画板：固定自然宽，窄窗由宿主横向滚动整体平移（与宽屏同一张图），
    // 绝不 min(100%,…) 跟容器收缩——否则统计条换行、VTable 画布被裁、标题折行全部错位
    width: `${innerW + pad * 2}px`,
    margin: '12px auto',
    boxSizing: 'border-box' as const,
  }
})

const posterHdr = computed(() =>
  posterSpec.value && posterPalette.value
    ? posterHeaderStyles(posterSpec.value, posterPalette.value)
    : null,
)
const posterFtr = computed(() =>
  posterSpec.value && posterPalette.value
    ? posterFooterStyles(posterSpec.value, posterPalette.value)
    : null,
)

const posterHasHeader = computed(() => {
  const p = posterSpec.value
  return Boolean(p && (p.kicker || p.title || p.subtitle || p.metaLines?.length))
})
function posterChipsWrapStyleOf(): string {
  const pal = posterPalette.value
  return pal ? posterChipsWrapStyle(pal) : ''
}

function posterChipStyleOf(index: number): string {
  const pal = posterPalette.value
  return pal ? posterChipStyle(pal, index) : ''
}

function posterLegendStyleOf(): string {
  const pal = posterPalette.value
  return pal ? posterLegendStyle(pal) : ''
}

const posterHasFooter = computed(() => {
  const p = posterSpec.value
  return Boolean(p && (p.footerLines?.length || p.pageBadge))
})

/** 内联样式文本 → Vue style 对象（posterWrapStyle 产出 CSS 文本，含 background-image） */
function cssTextToStyle(css: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const decl of css.split(';')) {
    const i = decl.indexOf(':')
    if (i <= 0) continue
    const key = decl
      .slice(0, i)
      .trim()
      .replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase())
    out[key] = decl.slice(i + 1).trim()
  }
  return out
}


/** WP1：合并/拆分成功后描边闪一次（flashKey 归零即停，可重复触发） */
const flashing = computed(() => editor.flashKey > 0)
/** 工具条定位用宿主可视高度（上方空间不足时改贴选区下沿） */
const hostHeight = computed(() => el.value?.clientHeight ?? 0)

/**
 * WP4：已占用槽位的拖动把手。位置直接用 dropTargets 的权威几何
 * （与落点判定同一份数据，拖到自己身上不会错位）。
 * 左栏标签贴在该行首列，把手跟首列走。
 */
const blockHandles = computed(() => {
  const inst = editor.current
  if (!inst) return []
  const out: Array<{
    blockId: string
    slotId: string
    type: import('@/core').BlockType
    label: string
    rect: CellRect
  }> = []
  for (const b of inst.blocks) {
    const def = inst.layout.blockSlots.find((d) => d.id === b.slotId)
    if (!def) continue
    const t = dropTargets.value.find((x) => x.blockSlotId === b.slotId)
    if (!t) continue
    out.push({
      blockId: b.id,
      slotId: b.slotId,
      type: b.type,
      label: BLOCK_TYPE_LABEL[b.type] ?? '区块',
      rect: t.rect,
    })
  }
  return out
})

const occupiedSlotIds = computed(() => editor.current?.blocks.map((b) => b.slotId) ?? [])

// ── WP3：就地编辑（双击 / 直接键入）──
// 浮层位置来自渲染核权威几何（滚动时随 cellRects 重算跟随）；提交走既有文字会话
// （同槽连续输入合并一步撤销，PX-03 口径）。
interface EditState {
  row: number
  col: number
  slotId: string
  value: string
  typedEntry: boolean
}
const editing = ref<EditState | null>(null)

// T04（灵活操作升级 A6）：图片格双击替换的隐藏文件选择器。
// fileInputSlot 记录唤起时的目标槽（change 时用，避免中途选中态漂移改错格）。
const canvasImageInput = ref<HTMLInputElement | null>(null)
let fileInputSlot: string | null = null

const editingRect = computed<CellRect | null>(() => {
  const e = editing.value
  const inst = editor.current
  if (!e || !inst) return null
  // BugFix（合并区就地编辑）：编辑格落在合并区上时，浮层必须覆盖**整个合并区**的外接矩形——
  // 此前只取左上单格 rect，合并后输入框仍是原格大小、内容宽度跟着受限。
  // 取法与选区描边同源（selectionCellRects 会把同属一个合并区的格并成一块）。
  const merge = findMergeAt(inst.layout, e.row, e.col)
  const parts = merge
    ? selectionCellRects(inst, merge, cellRects.value)
    : (() => {
        const vr = visualRowOfCell(inst, e.row)
        const r = vr === null ? undefined : cellRects.value[vr]?.[e.col]
        return r ? [r] : []
      })()
  if (parts.length === 0) return null
  let left = Number.POSITIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let right = 0
  let bottom = 0
  for (const r of parts) {
    left = Math.min(left, r.left)
    top = Math.min(top, r.top)
    right = Math.max(right, r.left + r.width)
    bottom = Math.max(bottom, r.top + r.height)
  }
  // 与描边/工具条同源换算（rect 原点 = .vtable-root，叠加层原点 = host padding box）
  const o = hostOrigin.value
  return { left: left + o.left, top: top + o.top, width: right - left, height: bottom - top }
})

/** 浮层文本对齐与格内文案同源（编辑中不跳位） */
const editableAlign = computed(() => {
  const inst = editor.current
  const e = editing.value
  if (!inst || !e) return 'left' as const
  const t = editableCellAt(inst, e.row, e.col)
  return t.kind === 'text' ? t.align : ('left' as const)
})

/**
 * 打开就地编辑：把「不可编辑」的三类原因用白话讲清，不做无声忽略。
 * T04（灵活操作升级 A6）：image 分支按来源分流——指针双击（viaKeyboard=false）选中该格并
 * 唤起隐藏文件选择器（写入链复用 store.uploadImage 三连闸，零新逻辑）；键盘来源
 * （Enter / 直接键入，viaKeyboard=true）保留白话 toast、不弹系统弹窗
 * （评审拍板 A12-6：文件选择只在指针双击手势内，键盘用户换图走右栏或双击）。
 */
function openEditor(row: number, col: number, typedChar?: string, viaKeyboard = false): boolean {
  const inst = editor.current
  if (!inst) return false
  const target = editableCellAt(inst, row, col)
  if (target.kind === 'readonly') {
    editor.showToast('这一格由模板固定，不能改')
    return false
  }
  if (target.kind === 'image') {
    // 图片槽 id 与 cellNav.editableCellAt 同源取锚点格（合并区落左上）
    const merge = findMergeAt(inst.layout, row, col)
    const sid = inst.layout.slotGrid?.[merge ? merge.start[0] : row]?.[merge ? merge.start[1] : col]
    if (viaKeyboard || !sid) {
      editor.showToast('图片格请在右栏换图')
      return false
    }
    editor.selectedSlotId = sid
    editor.selectedBlockId = null
    fileInputSlot = sid
    canvasImageInput.value?.click()
    return true
  }
  if (target.kind === 'typed') {
    editor.showToast('这一格请在右栏改数值或标记')
    return false
  }
  if (target.kind === 'empty') return false
  editing.value = {
    row,
    col,
    slotId: target.slotId,
    value: typedChar === undefined ? target.text : typedChar,
    typedEntry: typedChar !== undefined,
  }
  editor.selectedSlotId = target.slotId
  editor.selectedBlockId = null
  return true
}

function onCommitEdit(text: string, move: 'down' | 'right' | 'left' | 'none') {
  const e = editing.value
  editing.value = null
  if (!e) return
  editor.setSlotText(e.slotId, text)
  focusCanvas()
  if (move === 'none') return
  const inst = editor.current
  if (!inst || !editor.selectionRange) return
  editor.selectionRange =
    move === 'down'
      ? moveSelection(inst, editor.selectionRange, 1, 0)
      : tabSelection(inst, editor.selectionRange, move === 'left')
  syncPanelToRange()
}

/**
 * 键盘移动选区后把右栏选中槽同步过来。
 * 点击/框选/就地编辑都会同步选中槽，键盘独缺这一步——面板停在旧格上，
 * 接着用面板改文案就改错了格（「编辑不灵活」的一种）。
 */
function syncPanelToRange() {
  const inst = editor.current
  const sel = editor.selectionRange
  if (!inst || !sel) return
  const vr = visualRowOfCell(inst, sel.start[0])
  if (vr === null) {
    editor.selectedSlotId = null
    editor.selectedBlockId = null
    return
  }
  const found = findSlotAtVisual(inst, vr, sel.start[1])
  editor.selectedSlotId = found.isBlockSlot ? null : found.slotId
  editor.selectedBlockId = null
}

function onCancelEdit() {
  editing.value = null
  focusCanvas()
}

/**
 * T04：隐藏文件选择器 change → store.uploadImage（核内 canSetImage / validateImageDataUrl /
 * checkImageBudget 三连闸 + errorCopy 白话 toast，一次 setSlot 意图一张快照）。
 * 读走即清空 input.value：同一文件连续替换两次也能再次触发 change。
 */
function onCanvasImageChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  input.value = ''
  const sid = fileInputSlot
  fileInputSlot = null
  if (!file || !sid) return
  void editor.uploadImage(sid, file)
}

function onDblClick(ev: MouseEvent) {
  if (session.overlayVisible.value || editor.pastePending) return
  if (!editor.current || !el.value) return
  const rect = el.value.getBoundingClientRect()
  const x = ev.clientX - rect.left
  const y = ev.clientY - rect.top
  const pos = handle ? handle.hitTest(x, y) : locateVisual(editor.current, x, y)
  if (!pos) return
  // leftTag 格（区块贴在首列）：双击选中区块，不进被盖住的原格就地编辑
  const tagHit = findSlotAtVisual(editor.current, pos.row, pos.col)
  if (tagHit.isBlockSlot && tagHit.slotId && visualToLogicalRow(editor.current, pos.row) !== null) {
    const b = editor.current.blocks.find((x2) => x2.slotId === tagHit.slotId)
    if (b && b.type === 'leftTag') {
      editor.selectedBlockId = b.id
      editor.selectedSlotId = null
      return
    }
  }
  const logical = visualToLogicalRow(editor.current, pos.row)
  if (logical === null) return
  const merge = findMergeAt(editor.current.layout, logical, pos.col)
  if (merge) {
    editor.selectionRange = merge
    openEditor(merge.start[0], merge.start[1])
    return
  }
  editor.selectionRange = { start: [logical, pos.col], end: [logical, pos.col] }
  openEditor(logical, pos.col)
}

// ── WP3：画布键盘（方向键移动 / Shift 扩选 / Tab 跳格 / 键入进编辑 / 复制粘贴）──
const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
}

function focusCanvas() {
  el.value?.focus({ preventScroll: true })
}

async function onKeydown(ev: KeyboardEvent) {
  if (editing.value) return
  if (session.overlayVisible.value || editor.pastePending) return
  const inst = editor.current
  if (!inst) return

  // ── 结构快捷键（增量设计 A7）：在方向键与直接键入分支之前（Space 长 1 会撞键入分支）──
  // ① Shift+Space → 整行选择
  if (isSelectRowKey(ev)) {
    ev.preventDefault()
    editor.structuralSelection = { axis: 'row', index: editor.selectionRange?.start[0] ?? 0 }
    return
  }
  // ② Ctrl/Cmd+Space → 整列选择
  if (isSelectColKey(ev)) {
    ev.preventDefault()
    editor.structuralSelection = { axis: 'col', index: editor.selectionRange?.start[1] ?? 0 }
    return
  }
  // ③ Shift+F10 / ContextMenu 键 → 结构菜单（无结构选择时先以当前格所在行建立整行选择）
  if (isMenuKey(ev)) {
    ev.preventDefault()
    const s = editor.structuralSelection
    if (s) {
      openStructureMenu(s.axis, s.index, s.rangeEnd ?? null)
    } else {
      const row = editor.selectionRange?.start[0] ?? 0
      editor.structuralSelection = { axis: 'row', index: row }
      openStructureMenu('row', row)
    }
    return
  }
  // ④ Esc：结构菜单开 → 关菜单；整行/列选择 → 回首格单元格选择（A6 规则 3）
  if (isExitStructuralKey(ev)) {
    if (structureMenuState.open) {
      ev.preventDefault()
      closeStructureMenu()
      return
    }
    const s = editor.structuralSelection
    if (s) {
      ev.preventDefault()
      editor.structuralSelection = null
      editor.selectionRange =
        s.axis === 'row'
          ? { start: [s.index, 0], end: [s.index, 0] }
          : { start: [0, s.index], end: [0, s.index] }
      syncPanelToRange()
      return
    }
  }

  const delta = ARROWS[ev.key]
  if (delta) {
    ev.preventDefault()
    if (!editor.selectionRange) {
      // 无选区：键盘从左上角起步，避免「按了没反应」
      editor.selectionRange = { start: [0, 0], end: [0, 0] }
      syncPanelToRange()
      return
    }
    editor.selectionRange = ev.shiftKey
      ? extendSelection(inst, editor.selectionRange, delta[0], delta[1])
      : moveSelection(inst, editor.selectionRange, delta[0], delta[1])
    syncPanelToRange()
    return
  }

  if (ev.key === 'Tab') {
    ev.preventDefault()
    editor.selectionRange = editor.selectionRange
      ? tabSelection(inst, editor.selectionRange, ev.shiftKey)
      : { start: [0, 0], end: [0, 0] }
    syncPanelToRange()
    return
  }

  if (ev.key === 'Enter') {
    ev.preventDefault()
    const sel = editor.selectionRange ?? { start: [0, 0], end: [0, 0] }
    editor.selectionRange = sel
    // 键盘来源（T04 A12-6）：图片格保留白话 toast，不弹系统文件选择器
    openEditor(sel.start[0], sel.start[1], undefined, true)
    return
  }

  if (ev.key === 'Delete' || ev.key === 'Backspace') {
    ev.preventDefault()
    editor.clearSelection()
    return
  }

  if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'c' || ev.key === 'C')) {
    if (!editor.selectionRange) return
    ev.preventDefault()
    const tsv = selectionToTsv(inst, editor.selectionRange)
    if (tsv === '') {
      editor.showToast('选区内没有可复制的文字')
      return
    }
    try {
      await navigator.clipboard.writeText(tsv)
      editor.showToast('已复制到剪贴板')
    } catch {
      editor.showToast('复制失败，请用鼠标选中文字复制')
    }
    return
  }

  if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'v' || ev.key === 'V')) {
    ev.preventDefault()
    let text = ''
    try {
      text = await navigator.clipboard.readText()
    } catch {
      editor.showToast('读不到剪贴板，请用顶部「粘贴」按钮')
      return
    }
    if (!text) return
    // 粘贴起点 = 选区左上格（与鼠标点击选格同口径），走既有预览/确认流程
    const sel = editor.selectionRange
    if (sel) {
      const vr = visualRowOfCell(inst, sel.start[0])
      if (vr !== null) {
        const anchor = findSlotAtVisual(inst, vr, sel.start[1])
        if (anchor.slotId) editor.selectedSlotId = anchor.slotId
      }
    }
    editor.pasteStart({ text })
    return
  }

  // 直接键入进编辑（TH-C1）：可打印单字符 + 无修饰键
  if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && ev.key.length === 1 && editor.selectionRange) {
    ev.preventDefault()
    // 键盘来源（T04 A12-6）：图片格保留白话 toast，不弹系统文件选择器
    openEditor(editor.selectionRange.start[0], editor.selectionRange.start[1], ev.key, true)
  }
}

// ── WP2：框选（指针拖出矩形选区）──
// 设计增量原口径「明确不做拖选」在本期修订为「支持拖选」：Shift 扩选不可发现，
// 而框选是表格类工具的通用手势。位移 >4px 才进入拖选（<4px 仍是点击选格）；
// 放置模式 / 粘贴预览期禁用；指针位于 VTable 列宽热区（渲染器已把容器 cursor 置为
// col-resize / row-resize）时让位给列宽拖拽，两个手势不互抢。
const DRAG_THRESHOLD = 4
let dragStart: { x: number; y: number } | null = null
let dragAnchorVisual: { row: number; col: number } | null = null
let dragAnchorLogical: { row: number; col: number } | null = null
let dragging = false
let suppressClick = false

function localPoint(ev: PointerEvent): { x: number; y: number } | null {
  const rect = el.value?.getBoundingClientRect()
  return rect ? { x: ev.clientX - rect.left, y: ev.clientY - rect.top } : null
}

/** 容器坐标 → 逻辑格（命中问渲染器，与 onClick 同源；区块行 / 越界返回 null） */
function logicalAtPoint(x: number, y: number): { visual: number; logical: number; col: number } | null {
  if (!editor.current) return null
  const pos = handle ? handle.hitTest(x, y) : locateVisual(editor.current, x, y)
  if (!pos) return null
  const logical = visualToLogicalRow(editor.current, pos.row)
  return logical === null ? null : { visual: pos.row, logical, col: pos.col }
}

/**
 * 指针是否正压在列宽/行高热区上。
 * 热区光标由 VTable 写在**它自建的容器**（`.vtable-root`）上，canvas 继承得到——
 * 读 `.preview-host` 的 inline style 恒为空（早期实现即栽在这里：列宽拖拽与框选同时起手）。
 * 故必须问 canvas 的计算样式。
 */
function resizeHotZoneActive(): boolean {
  const node = el.value?.querySelector('canvas') ?? el.value
  if (!node) return false
  const cursor = getComputedStyle(node).cursor
  return cursor === 'col-resize' || cursor === 'row-resize'
}

function onPointerDown(ev: PointerEvent) {
  if (ev.button !== 0) return
  if (session.overlayVisible.value || editor.pastePending) return
  if (resizeHotZoneActive()) return
  const p = localPoint(ev)
  if (!p) return
  const at = logicalAtPoint(p.x, p.y)
  if (!at) return
  dragStart = p
  dragAnchorVisual = { row: at.visual, col: at.col }
  dragAnchorLogical = { row: at.logical, col: at.col }
  dragging = false
}

function onPointerMove(ev: PointerEvent) {
  if (!dragStart || !dragAnchorLogical) return
  const p = localPoint(ev)
  if (!p) return
  if (!dragging) {
    if (Math.abs(p.x - dragStart.x) < DRAG_THRESHOLD && Math.abs(p.y - dragStart.y) < DRAG_THRESHOLD) {
      return
    }
    // 真正起拖前再判一次热区：热区光标是「渲染器处理过指针移动」才挂上的，
    // 直接按在边界上（无先hover）时 pointerdown 那一刻还读不到
    if (resizeHotZoneActive()) {
      dragStart = null
      return
    }
    dragging = true
    el.value?.setPointerCapture(ev.pointerId)
  }
  const at = logicalAtPoint(p.x, p.y)
  if (!at) return
  // 起点 → 当前点围成矩形（逐轴归一化，四方向都能拉）
  editor.selectionRange = expandRectSelection(
    { start: [dragAnchorLogical.row, dragAnchorLogical.col], end: [dragAnchorLogical.row, dragAnchorLogical.col] },
    at.logical,
    at.col,
  )
}

function onPointerUp(ev: PointerEvent) {
  if (dragging) {
    suppressClick = true
    // 面板选中态落到选区起点格（与点击选格口径一致，避免拖完还停在上一次选中的格）
    if (editor.current && dragAnchorVisual) {
      const found = findSlotAtVisual(editor.current, dragAnchorVisual.row, dragAnchorVisual.col)
      editor.selectedSlotId = found.isBlockSlot ? null : found.slotId
      editor.selectedBlockId = null
    }
  }
  if (el.value?.hasPointerCapture(ev.pointerId)) el.value.releasePointerCapture(ev.pointerId)
  dragStart = null
  dragAnchorVisual = null
  dragAnchorLogical = null
  dragging = false
}

function onPlace(slotId: string) {
  const type = session.blockType.value
  if (!type) return
  const occupied = editor.current?.blocks.some((b) => b.slotId === slotId)
  editor.addBlock(type, slotId)
  session.cancelPlace()
  editor.showToast(occupied ? '已替换原区块' : '已放入区块')
}

function onCancelPlace() {
  session.cancelPlace()
}

function onFill(slotId: string, type: import('@/core').BlockType) {
  const occupied = editor.current?.blocks.some((b) => b.slotId === slotId)
  editor.addBlock(type, slotId)
  editor.showToast(occupied ? '已替换原区块' : '已放入区块')
}

function onSlotHint(message: string) {
  editor.showToast(message)
}

defineExpose({
  getHandle: () => handle,
  getDropTargets: () => dropTargets.value,
  refreshTargets,
})
</script>

<template>
  <div
    ref="host"
    class="preview-host"
    :class="{ 'drag-active': session.dragging.value }"
    :data-pt-selected-slot="editor.selectedSlotId ?? ''"
    :data-pt-structural="structuralLabel"
    @click="onClick"
  >
    <!-- PX-09：悬浮粘贴按钮已并入顶部工具条（EditorPage header），预览区保持纯净 -->
    <!-- Schema 1.3：海报层 sheet（bg + 标题区 + 注脚区；与 HTML/PNG 三方同源 posterStyle.ts） -->
    <div v-if="isPoster" class="poster-sheet" :style="posterSheetStyle" data-testid="poster-sheet">
      <div v-if="posterHasHeader && posterHdr" :style="posterHdr.wrap">
        <div>
          <p v-if="posterSpec?.kicker" :style="posterHdr.kicker">{{ posterSpec.kicker }}</p>
          <h1 v-if="posterSpec?.title" :style="posterHdr.title">{{ posterSpec.title }}</h1>
          <p v-if="posterSpec?.subtitle" :style="posterHdr.subtitle">{{ posterSpec.subtitle }}</p>
          <div v-if="posterSpec?.chips?.length" :style="posterChipsWrapStyleOf()">
            <span v-for="(chip, i) in posterSpec.chips" :key="`pc-${i}`" :style="posterChipStyleOf(i)">{{ chip }}</span>
          </div>
          <p v-if="posterSpec?.legend" :style="posterLegendStyleOf()">{{ posterSpec.legend }}</p>
        </div>
        <div v-if="posterSpec?.metaLines?.length" :style="posterHdr.meta">
          <div v-for="(line, i) in posterSpec.metaLines" :key="`pm-${i}`">{{ line }}</div>
        </div>
      </div>
      <!-- Schema 1.2 扩展：KPI 统计卡 hero 区（表格上方；无卡片 v-if 零占位；strip 形态分支） -->
      <div v-if="kpiCards.length" class="kpi-hero" :style="kpiHeroWrapStyle" data-testid="kpi-hero">
        <div v-if="kpiIsStrip" :style="kpiStripRowStyleOf()">
          <div v-for="(card, i) in kpiCards" :key="card.id" :style="kpiStripItemStyleOf(card, i)">
            <p :style="kpiStripLabelStyleOf()">{{ card.label }}</p>
            <div :style="kpiStripValueStyleOf(card)">
              {{ kpiValueText(card) }}<span v-if="card.unit" :style="kpiUnitStyleOf()"> {{ card.unit }}</span>
            </div>
          </div>
        </div>
        <div v-else :style="kpiRowStyleOf()">
          <div v-for="card in kpiCards" :key="card.id" :style="kpiCardStyleOf(card)">
            <div :style="kpiValueStyleOf(card)">
              {{ kpiValueText(card) }}<span v-if="card.unit" :style="kpiUnitStyleOf()"> {{ card.unit }}</span>
            </div>
            <p :style="kpiLabelStyleOf()">{{ card.label }}</p>
          </div>
        </div>
      </div>
      <div
        ref="el"
        class="vtable-root"
        tabindex="0"
        data-testid="preview-canvas"
        :style="mountStyle"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @dblclick="onDblClick"
        @keydown="onKeydown"
      />
      <div v-if="posterHasFooter && posterFtr" :style="posterFtr.wrap">
        <div v-if="posterSpec?.footerLines?.length" :style="posterFtr.line">
          <div v-for="(line, i) in posterSpec.footerLines" :key="`pf-${i}`">{{ line }}</div>
        </div>
        <div v-else></div>
        <div v-if="posterSpec?.pageBadge" :style="posterFtr.badge">{{ posterSpec.pageBadge }}</div>
      </div>
    </div>
    <!-- 无海报层：原结构（kpi hero + 画布），老模板渲染零回归 -->
    <template v-else>
      <div v-if="kpiCards.length" class="kpi-hero" :style="kpiHeroWrapStyle" data-testid="kpi-hero">
        <div v-if="kpiIsStrip" :style="kpiStripRowStyleOf()">
          <div v-for="(card, i) in kpiCards" :key="card.id" :style="kpiStripItemStyleOf(card, i)">
            <p :style="kpiStripLabelStyleOf()">{{ card.label }}</p>
            <div :style="kpiStripValueStyleOf(card)">
              {{ kpiValueText(card) }}<span v-if="card.unit" :style="kpiUnitStyleOf()"> {{ card.unit }}</span>
            </div>
          </div>
        </div>
        <div v-else :style="kpiRowStyleOf()">
          <div v-for="card in kpiCards" :key="card.id" :style="kpiCardStyleOf(card)">
            <div :style="kpiValueStyleOf(card)">
              {{ kpiValueText(card) }}<span v-if="card.unit" :style="kpiUnitStyleOf()"> {{ card.unit }}</span>
            </div>
            <p :style="kpiLabelStyleOf()">{{ card.label }}</p>
          </div>
        </div>
      </div>
      <div
        ref="el"
        class="vtable-root"
        tabindex="0"
        data-testid="preview-canvas"
        :style="mountStyle"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @dblclick="onDblClick"
        @keydown="onKeydown"
      />
    </template>
    <!-- R-2：选区描边叠加层（纯壳，不刷核）；WP1：合并/拆分成功后闪一次 -->
    <div
      v-for="(r, i) in selectionRects"
      :key="`sel-${i}`"
      class="selection-cell"
      :class="{ flash: flashing }"
      :style="{
        left: r.left + 'px',
        top: r.top + 'px',
        width: r.width + 'px',
        height: r.height + 'px',
      }"
    />
    <!-- A5：整行/整列选择浅色高亮叠加层（在描边层之下） -->
    <div
      v-for="(r, i) in structuralOverlay"
      :key="`stl-${i}`"
      class="structural-cell"
      :style="{
        left: r.left + 'px',
        top: r.top + 'px',
        width: r.width + 'px',
        height: r.height + 'px',
      }"
    />
    <!-- WP1：选区工具条（合并/拆分/清空），位置来自渲染核权威几何 -->
    <SelectionToolbar :rects="selectionRects" :host-height="hostHeight" />
    <!-- WP3：就地编辑浮层（双击 / 直接键入；位置随视口重算跟随） -->
    <InlineEditor
      v-if="editing && editingRect"
      :key="`edit-${editing.row}-${editing.col}`"
      :rect="editingRect"
      :value="editing.value"
      :align="editableAlign"
      :typed-entry="editing.typedEntry"
      @commit="onCommitEdit"
      @cancel="onCancelEdit"
    />
    <!-- WP4：表内区块拖动把手（空槽 = 移动，已占用 = 互换）。
         放置模式/拖拽中让位：置为 inert（不抢指针、不挡落点判定） -->
    <BlockDragHandle
      v-for="h in blockHandles"
      :key="`bh-${h.blockId}`"
      :block-id="h.blockId"
      :slot-id="h.slotId"
      :type="h.type"
      :label="h.label"
      :rect="h.rect"
      :host-left="hostOrigin.left"
      :host-top="hostOrigin.top"
      :class="{ inert: session.overlayVisible.value }"
      :disabled="editor.pastePending"
    />
    <SlotOverlay
      :targets="dropTargets"
      :occupied-slot-ids="occupiedSlotIds"
      :host-left="hostOrigin.left"
      :host-top="hostOrigin.top"
      @place="onPlace"
      @cancel="onCancelPlace"
      @fill="onFill"
      @hint="onSlotHint"
    />
    <!-- A2：结构菜单浮层（鼠标轨道 … 与键盘 Shift+F10 共用；关闭即卸载） -->
    <StructureActionMenu />
    <PasteEntry />
    <!-- T04：图片格双击替换的隐藏文件选择器（视觉隐藏，裁剪范式同 PropertyPanel .file-btn input） -->
    <input
      ref="canvasImageInput"
      class="canvas-image-input"
      type="file"
      accept="image/jpeg,image/png,image/webp,image/gif"
      data-testid="canvas-image-input"
      @change="onCanvasImageChange"
    />
  </div>
</template>

<style scoped>
.preview-host {
  position: relative;
  flex: 1;
  min-height: 420px;
  background: var(--pt-paper);
  border: 1px solid var(--pt-border);
  border-radius: 10px;
  overflow: auto;
  transition: opacity 250ms ease;
}
.vtable-root {
  width: 100%;
  min-height: 400px;
  transition: opacity 200ms ease;
}
/* T04：隐藏文件选择器（1px clip 裁剪，视觉零占位；点击由 openEditor image 分支程序化触发） */
.canvas-image-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
/* WP3：键盘操作要求画布可聚焦——焦点环色/宽走 main.css 全局单点；画布外描边会被
   .canvas-shell 的 overflow 裁剪，故仅把 offset 取负让环画在画布内 */
.vtable-root:focus-visible {
  outline-offset: -3px;
}
/* R-1：拖拽进行中非目标区弱化（低透明度），松手恢复 */
.preview-host.drag-active .vtable-root {
  opacity: 0.55;
}
.selection-cell {
  position: absolute;
  z-index: var(--pt-z-overlay);
  box-sizing: border-box;
  border: 2px solid var(--pt-primary);
  background: color-mix(in srgb, var(--pt-primary) 10%, transparent);
  pointer-events: none;
}
/* A5：整行/整列选择浅色高亮（同 overlay 机制：host 内绝对定位、随内容滚动） */
.structural-cell {
  position: absolute;
  z-index: var(--pt-z-content);
  box-sizing: border-box;
  background: color-mix(in srgb, var(--pt-primary) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--pt-primary) 35%, transparent);
  pointer-events: none;
}
/* WP4：拖拽 / 放置模式下区块把手让位（不抢指针事件，也不挡槽位落点） */
.inert {
  pointer-events: none;
  opacity: 0.35;
}
/* WP1 成功反馈：描边闪一次（TH-F3 ≤200ms），class 由 flashKey 开关触发重放。
   只用主题 token 合成（无新色值）：加粗内填 + 外圈光环各收一次 */
.selection-cell.flash {
  animation: pt-selection-flash 200ms ease-out;
}
@keyframes pt-selection-flash {
  0% {
    background: color-mix(in srgb, var(--pt-primary) 38%, transparent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--pt-primary) 45%, transparent);
  }
  100% {
    background: color-mix(in srgb, var(--pt-primary) 10%, transparent);
    box-shadow: 0 0 0 0 transparent;
  }
}
@media (prefers-reduced-motion: reduce) {
  .selection-cell.flash {
    animation: none;
  }
}
</style>
