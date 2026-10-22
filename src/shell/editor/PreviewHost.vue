<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import {
  loadRenderCore,
  type CoreHandle,
  findSlotAtVisual,
  findMergeAt,
  visualToLogicalRow,
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
  type CellRect,
  type DropTarget,
} from '../dnd/slotDnd'
import { usePlaceSession } from '../dnd/placeSession'
import { locateVisual } from './previewHit'
import { expandRectSelection, selectionCellRects } from './selection'
import SelectionToolbar from './SelectionToolbar.vue'
import PasteEntry from '../paste/PasteEntry.vue'

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
    return
  }
  // 几何坐标系原点 = .vtable-root 原点；叠加层定位系原点 = 宿主 padding box，
  // 两者差即 offsetLeft/Top（当前布局为 0，CSS 变动时自动跟随）
  hostOrigin.value = { left: el.value?.offsetLeft ?? 0, top: el.value?.offsetTop ?? 0 }
  const rects = readGeometry()
  cellRects.value = rects
  dropTargets.value = computeDropTargets(editor.current, rects)
  session.setCatalogTargets(dropTargets.value)
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
  refreshTargets()
  window.addEventListener('resize', refreshTargets)
})

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
  if (rafId) cancelAnimationFrame(rafId)
  offViewport?.()
  offColResize?.()
  handle?.destroy()
  handle = null
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

// R-2：选区可视化（壳叠加层描边；几何来自渲染核视口坐标，无核回退同源算术）
const selectionRects = computed(() => {
  if (!editor.current || !editor.selectionRange) return []
  return selectionCellRects(editor.current, editor.selectionRange, cellRects.value)
})

/** WP1：合并/拆分成功后描边闪一次（flashKey 归零即停，可重复触发） */
const flashing = computed(() => editor.flashKey > 0)
/** 工具条定位用宿主可视高度（上方空间不足时改贴选区下沿） */
const hostHeight = computed(() => el.value?.clientHeight ?? 0)

/**
 * WP4：已占用槽位的拖动把手。位置直接用 dropTargets 的权威几何
 * （与落点判定同一份数据，拖到自己身上不会错位）。
 * 左栏标签块（rowHint left-N）不参与：它不占独立行，dropTargets 里是「停在表下」
 * 的占位矩形，拿它当把手位置会飘到表格外面——宁可没有把手，也不给错位置。
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
    if (!def || /^left-\d+$/.test(def.rowHint ?? '')) continue
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

const editingRect = computed<CellRect | null>(() => {
  const e = editing.value
  const inst = editor.current
  if (!e || !inst) return null
  const vr = visualRowOfCell(inst, e.row)
  if (vr === null) return null
  return cellRects.value[vr]?.[e.col] ?? null
})

/** 浮层文本对齐与格内文案同源（编辑中不跳位） */
const editableAlign = computed(() => {
  const inst = editor.current
  const e = editing.value
  if (!inst || !e) return 'left' as const
  const t = editableCellAt(inst, e.row, e.col)
  return t.kind === 'text' ? t.align : ('left' as const)
})

/** 打开就地编辑：把「不可编辑」的三类原因用白话讲清，不做无声忽略 */
function openEditor(row: number, col: number, typedChar?: string): boolean {
  const inst = editor.current
  if (!inst) return false
  const target = editableCellAt(inst, row, col)
  if (target.kind === 'readonly') {
    editor.showToast('这一格由模板固定，不能改')
    return false
  }
  if (target.kind === 'image') {
    editor.showToast('图片格请在右栏换图')
    return false
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

function onDblClick(ev: MouseEvent) {
  if (session.overlayVisible.value || editor.pastePending) return
  if (!editor.current || !el.value) return
  const rect = el.value.getBoundingClientRect()
  const x = ev.clientX - rect.left
  const y = ev.clientY - rect.top
  const pos = handle ? handle.hitTest(x, y) : locateVisual(editor.current, x, y)
  if (!pos) return
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
    openEditor(sel.start[0], sel.start[1])
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
    openEditor(editor.selectionRange.start[0], editor.selectionRange.start[1], ev.key)
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
    @click="onClick"
  >
    <!-- PX-09：悬浮粘贴按钮已并入顶部工具条（EditorPage header），预览区保持纯净 -->
    <div
      ref="el"
      class="vtable-root"
      tabindex="0"
      data-testid="preview-canvas"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @dblclick="onDblClick"
      @keydown="onKeydown"
    />
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
    />
    <SlotOverlay
      :targets="dropTargets"
      :host-left="hostOrigin.left"
      :host-top="hostOrigin.top"
      @place="onPlace"
      @cancel="onCancelPlace"
    />
    <PasteEntry />
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
  outline: none;
}
/* WP3：键盘操作要求画布可聚焦——只给键盘用户可见的焦点圈（:focus-visible） */
.vtable-root:focus-visible {
  box-shadow: inset 0 0 0 2px var(--pt-primary);
}
/* R-1：拖拽进行中非目标区弱化（低透明度），松手恢复 */
.preview-host.drag-active .vtable-root {
  opacity: 0.55;
}
.selection-cell {
  position: absolute;
  z-index: 3;
  box-sizing: border-box;
  border: 2px solid var(--pt-primary);
  background: color-mix(in srgb, var(--pt-primary) 10%, transparent);
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
