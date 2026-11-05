<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { canAddCol, canAddRow, moveGate } from '@/core'
import { useEditorStore } from '../stores/editor'
import {
  RAIL_SIZE,
  colRailItems,
  railGeometry,
  rowRailItems,
  type RailItem,
  type StructuralAxis,
} from './railGeometry'
import { openStructureMenu } from './structureMenu'
import { useStructureActions } from './useStructureActions'
import {
  RAIL_DRAG_THRESHOLD,
  boundaryIsHome,
  boundaryToTarget,
  pickBoundary,
  railDrag,
  resetRailDrag,
} from './railDnd'
import { usePlaceSession } from '../dnd/placeSession'
import PtTooltip from '../ui/PtTooltip.vue'

/**
 * 行/列轨道（增量设计 A2，轴参数化一套组件两用）：
 * - 序号内容只有 1/2/3…、A/B/C…（MUST NOT 读取业务表头或首列文案，A4 防误判）
 * - 点击序号 = 选中整行/整列（structuralSelection，互斥清空既有选区）
 * - Shift+点击 = 从当前锚点扩展区间选择（T02；无拖选手势——手势仲裁见 A5/PRD §5.1）
 * - 序号项即换位把手（T03）：按下位移 >4px 进入拖拽，指示线实时预检（moveGate），
 *   非法落点松手回弹 + 白话原因；手势状态机全在 railDnd.ts（壳层，不进核/VTable）
 * - 悬停或选中态浮现 +（默认后插）与 …（打开结构菜单）；浮现工具条渲染在裁剪层之外
 *   （行项贴 host 左缘外、列项贴 host 上缘外），不挤动序号布局
 * - 表头行可选中；区块行无逻辑行号 → 天然无轨道项（rowRailItems 映射跳过）
 * - 粘贴预览期整体禁用（pointer-events:none + disabled + tooltip「请先确认或取消粘贴」）；
 *   放置模式（区块放置/拖拽中）把手同样禁用
 * 几何全部来自 railGeometry（不自算）；非导出壳层。
 */
const props = defineProps<{ axis: StructuralAxis }>()

const editor = useEditorStore()
const actions = useStructureActions()
const session = usePlaceSession()

const root = ref<HTMLElement | null>(null)
const stripLeft = ref(0)
const stripTop = ref(0)
/** 悬停项（浮现工具条跟随；与选中态任一满足即显示） */
const hoverIndex = ref<number | null>(null)

const MINIS_W = 44

function measure() {
  const r = root.value?.getBoundingClientRect()
  stripLeft.value = r?.left ?? 0
  stripTop.value = r?.top ?? 0
}

onMounted(() => {
  measure()
  window.addEventListener('resize', measure)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', measure)
  // 拖拽中途卸载（换模板/回库页）→ 会话复位，防悬挂指示线
  resetRailDrag()
})

// 几何刷新 / 纵滚后重量一次条位置，防布局漂移错位（静止时为零开销）
watch(
  () => [railGeometry.cellRects, railGeometry.scrollTop, railGeometry.hostLeft],
  () => measure(),
)

const items = computed<RailItem[]>(() => {
  const inst = editor.current
  if (!inst) return []
  return props.axis === 'row' ? rowRailItems(inst) : colRailItems(inst)
})

/** 当前结构选择在本轴上的区间（store 写入已归一化：index=min ≤ hi=rangeEnd） */
const selRange = computed(() => {
  const s = editor.structuralSelection
  if (!s || s.axis !== props.axis) return null
  return { lo: s.index, hi: s.rangeEnd ?? s.index }
})

/** 锚点项（浮现工具条显示依据；与既有单选口径一致） */
const selectedIndex = computed(() => selRange.value?.lo ?? -1)

function isItemInRange(i: number): boolean {
  const r = selRange.value
  return !!r && i >= r.lo && i <= r.hi
}

const locked = computed(() => editor.pastePending)
/** 放置模式 / 区块拖拽中：轨道把手让位（A5 约束 6） */
const placeOverlay = computed(() => session.overlayVisible.value)
const plusDisabled = computed(
  () =>
    locked.value ||
    !editor.current ||
    (props.axis === 'row' ? !canAddRow(editor.current) : !canAddCol(editor.current)),
)
const plusTip = computed(() =>
  locked.value
    ? '请先确认或取消粘贴'
    : props.axis === 'row'
      ? '在这一行后面插入一行'
      : '在这一列后面插入一列',
)
const menuTip = computed(() => (locked.value ? '请先确认或取消粘贴' : '插入、删除或移动'))

/** 序号的条内坐标（A4：行项 y 冻结对齐减 scrollTop；列项 x 贴 VTable 内部横滚） */
function labelStyle(item: RailItem): Record<string, string> {
  const geo = railGeometry
  if (props.axis === 'row') {
    return {
      top: `${geo.hostTop - stripTop.value + item.top - geo.scrollTop}px`,
      left: '0',
      width: `${RAIL_SIZE}px`,
      height: `${item.height}px`,
    }
  }
  return {
    left: `${geo.hostLeft - stripLeft.value + item.left}px`,
    top: '0',
    width: `${item.width}px`,
    height: `${RAIL_SIZE}px`,
  }
}

/** 浮现工具条的条内坐标（裁剪层之外）：行项贴条右缘外，列项贴条下缘外 */
function minisStyle(item: RailItem): Record<string, string> {
  const geo = railGeometry
  if (props.axis === 'row') {
    return {
      top: `${geo.hostTop - stripTop.value + item.top - geo.scrollTop}px`,
      left: `${geo.hostLeft - stripLeft.value}px`,
      width: `${MINIS_W}px`,
      height: `${Math.max(item.height, RAIL_SIZE)}px`,
    }
  }
  return {
    left: `${Math.max(0, geo.hostLeft - stripLeft.value + item.left + item.width - MINIS_W)}px`,
    top: `${geo.hostTop - stripTop.value}px`,
    width: `${MINIS_W}px`,
    height: `${RAIL_SIZE}px`,
  }
}

function isVisible(item: RailItem): boolean {
  return hoverIndex.value === item.index || selectedIndex.value === item.index
}

/** T02：普通点击 = 单选（锚点）；Shift+点击 = 从当前锚点扩展区间 [min, max]（同轴） */
function onSelect(item: RailItem, ev: MouseEvent) {
  if (suppressClick) {
    suppressClick = false
    return
  }
  if (locked.value) return
  const cur = editor.structuralSelection
  if (ev.shiftKey && cur && cur.axis === props.axis) {
    editor.structuralSelection = {
      axis: props.axis,
      index: Math.min(cur.index, item.index),
      rangeEnd: Math.max(cur.index, item.index),
    }
    return
  }
  editor.structuralSelection = { axis: props.axis, index: item.index }
}

function onPlus(item: RailItem) {
  if (plusDisabled.value) return
  if (props.axis === 'row') void actions.insertRowAt(item.index, false)
  else void actions.insertColAt(item.index, false)
}

/** T02：点击项落在当前区间选择内 → 菜单作用于整个区间；否则作用于单项 */
function onMenu(item: RailItem) {
  if (locked.value) return
  const r = selRange.value
  if (r && item.index >= r.lo && item.index <= r.hi) {
    openStructureMenu(props.axis, r.lo, r.hi > r.lo ? r.hi : null)
  } else {
    openStructureMenu(props.axis, item.index)
  }
}

// ── T03：换位把手（指针自实现；会话状态在 railDnd.ts，几何全读 railGeometry）──

let pressItem: RailItem | null = null
const pressStart = ref<{ x: number; y: number } | null>(null)
/** 拖拽结束后的 click 抑制（复用 PreviewHost suppressClick 范式） */
let suppressClick = false

function onLabelPointerDown(item: RailItem, ev: PointerEvent) {
  if (ev.button !== 0) return
  if (locked.value || placeOverlay.value) return
  // 新手势开始：清掉上一手势可能残留的点击抑制（pointercancel 等路径 click 不触发时防吞下一点选）
  suppressClick = false
  pressItem = item
  pressStart.value = { x: ev.clientX, y: ev.clientY }
}

/** client 坐标 → 轨道项同一坐标系（host 内容坐标；行轴补 scrollTop 冻结对齐修正） */
function contentPoint(ev: PointerEvent): { x: number; y: number } {
  const geo = railGeometry
  return props.axis === 'row'
    ? { x: 0, y: ev.clientY - geo.hostTop + geo.scrollTop }
    : { x: ev.clientX - geo.hostLeft, y: 0 }
}

function updateDrop(ev: PointerEvent) {
  const p = contentPoint(ev)
  const boundary = pickBoundary(items.value, props.axis, p.x, p.y)
  railDrag.boundary = boundary
  const inst = editor.current
  if (!inst) {
    railDrag.legal = false
    railDrag.reason = ''
    return
  }
  if (boundaryIsHome(railDrag.from, boundary)) {
    // 原位：不显示指示线（松手无声结束）
    railDrag.legal = false
    railDrag.reason = ''
    return
  }
  const to = boundaryToTarget(railDrag.from, boundary)
  const gate = moveGate(inst, props.axis === 'row' ? 0 : 1, railDrag.from, to)
  railDrag.legal = gate.ok
  railDrag.reason = gate.ok ? '' : gate.error.message
}

function onLabelPointerMove(item: RailItem, ev: PointerEvent) {
  if (!pressStart.value || !pressItem || pressItem.index !== item.index) return
  if (!railDrag.active) {
    const dx = Math.abs(ev.clientX - pressStart.value.x)
    const dy = Math.abs(ev.clientY - pressStart.value.y)
    // 4px 阈值内仍是点选（不误拖）
    if (dx < RAIL_DRAG_THRESHOLD && dy < RAIL_DRAG_THRESHOLD) return
    railDrag.active = true
    railDrag.axis = props.axis
    railDrag.from = pressItem.index
    railDrag.boundary = -1
    railDrag.legal = false
    railDrag.reason = ''
    ;(ev.currentTarget as HTMLElement | null)?.setPointerCapture(ev.pointerId)
  }
  updateDrop(ev)
}

function releaseCapture(ev: PointerEvent) {
  const node = ev.currentTarget as HTMLElement | null
  if (node?.hasPointerCapture?.(ev.pointerId)) node.releasePointerCapture(ev.pointerId)
}

function onLabelPointerUp(ev: PointerEvent) {
  releaseCapture(ev)
  if (!railDrag.active) {
    pressStart.value = null
    pressItem = null
    return
  }
  const from = railDrag.from
  const home = railDrag.boundary < 0 || boundaryIsHome(from, railDrag.boundary)
  const to = home ? from : boundaryToTarget(from, railDrag.boundary)
  const legal = railDrag.legal
  const reason = railDrag.reason
  resetRailDrag()
  suppressClick = true
  pressStart.value = null
  pressItem = null
  if (home) return // 原位：无声结束
  if (legal && to !== from) {
    const moved = props.axis === 'row' ? editor.moveRow(from, to) : editor.moveCol(from, to)
    // 选择跟随被移动对象（Toast 由 store 产出「已上移/已下移」）
    if (moved) editor.structuralSelection = { axis: props.axis, index: to }
    return
  }
  // 非法落点：回弹（未发生移动即回弹）+ 白话原因 toast（moveGate message 同源）
  editor.showToast(reason || '这里挪不动——先解除结构限制再试')
}

function onLabelPointerCancel(ev: PointerEvent) {
  releaseCapture(ev)
  if (railDrag.active) resetRailDrag()
  pressStart.value = null
  pressItem = null
}

/** 指示线条内几何：边界处相邻 item 矩形（几何全读 railGeometry item 序列，不自算） */
const dropLine = computed<{ left: number; top: number; width: number; height: number } | null>(() => {
  if (!railDrag.active || railDrag.axis !== props.axis) return null
  if (railDrag.boundary < 0 || boundaryIsHome(railDrag.from, railDrag.boundary)) return null
  const list = items.value
  if (list.length === 0) return null
  const geo = railGeometry
  const b = Math.min(railDrag.boundary, list.length)
  const prev = b > 0 ? list[b - 1] : null
  const next = b < list.length ? list[b] : null
  if (props.axis === 'row') {
    const edge =
      prev && next
        ? (prev.top + prev.height + next.top) / 2
        : prev
          ? prev.top + prev.height
          : (next?.top ?? 0)
    return {
      left: 0,
      top: geo.hostTop - stripTop.value + edge - geo.scrollTop,
      width: RAIL_SIZE,
      height: 2,
    }
  }
  const edge =
    prev && next
      ? (prev.left + prev.width + next.left) / 2
      : prev
        ? prev.left + prev.width
        : (next?.left ?? 0)
  return {
    left: geo.hostLeft - stripLeft.value + edge,
    top: 0,
    width: 2,
    height: RAIL_SIZE,
  }
})
</script>

<template>
  <div
    ref="root"
    class="struct-rail"
    :class="{ inert: locked }"
    :aria-label="axis === 'row' ? '行轨道' : '列轨道'"
    @mouseleave="hoverIndex = null"
  >
    <!-- 裁剪层：序号项（纵滚出界的项被裁掉；工具条在其外不受裁剪） -->
    <div class="rail-clip">
      <button
        v-for="item in items"
        :key="`${axis}-${item.index}`"
        type="button"
        class="rail-label"
        :class="{ on: isItemInRange(item.index), header: item.header }"
        :style="labelStyle(item)"
        :data-testid="`rail-${axis}-${item.index}`"
        @click="onSelect(item, $event)"
        @pointerdown="onLabelPointerDown(item, $event)"
        @pointermove="onLabelPointerMove(item, $event)"
        @pointerup="onLabelPointerUp($event)"
        @pointercancel="onLabelPointerCancel($event)"
        @mouseenter="hoverIndex = item.index"
      >
        {{ item.label }}
      </button>
      <!-- T03 拖拽插入指示线：合法=主色、非法=警示色、原位=不显示（静态显示即线索，无动画） -->
      <div
        v-if="dropLine"
        class="rail-drop-line"
        :class="{ bad: !railDrag.legal }"
        :style="{
          left: dropLine.left + 'px',
          top: dropLine.top + 'px',
          width: dropLine.width + 'px',
          height: dropLine.height + 'px',
        }"
      />
    </div>
    <!-- 浮现工具条（+/…）：悬停或选中态显示 -->
    <template v-for="item in items" :key="`m-${axis}-${item.index}`">
      <span
        v-if="isVisible(item)"
        class="rail-minis"
        :style="minisStyle(item)"
        @mouseenter="hoverIndex = item.index"
      >
        <PtTooltip :text="plusTip">
          <button
            type="button"
            class="rail-mini"
            :data-testid="`rail-${axis}-plus-${item.index}`"
            :disabled="plusDisabled"
            @click="onPlus(item)"
          >+</button>
        </PtTooltip>
        <PtTooltip :text="menuTip">
          <button
            type="button"
            class="rail-mini"
            :data-testid="`rail-${axis}-menu-${item.index}`"
            :disabled="locked"
            @click="onMenu(item)"
          >…</button>
        </PtTooltip>
      </span>
    </template>
  </div>
</template>

<style scoped>
.struct-rail {
  position: absolute;
  inset: 0;
  user-select: none;
}
/* 裁剪层：序号项纵滚出界即裁掉 */
.rail-clip {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
/* 粘贴预览期整条禁用（复用 .inert 范式） */
.inert {
  pointer-events: none;
  opacity: 0.35;
}
.rail-label {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  font-size: 11px;
  color: var(--pt-muted);
  /* 序号项即换位把手（PRD §5.3：悬停显示抓取光标） */
  cursor: grab;
  padding: 0;
  touch-action: none;
  /* T10：hover 轻反馈具名过渡（120~150ms，禁 all） */
  transition: background 130ms ease, color 130ms ease;
}
.rail-label.header {
  font-weight: 600;
}
.rail-label.on {
  background: var(--pt-tag);
  color: var(--pt-primary);
}
@media (hover: hover) {
  .rail-label:hover {
    background: var(--pt-tag);
    color: var(--pt-primary);
  }
}
/* 拖拽插入指示线：合法主色 / 非法警示色；纯静态显示（线索本身即反馈，无动画） */
.rail-drop-line {
  position: absolute;
  background: var(--pt-primary);
  pointer-events: none;
  z-index: var(--pt-z-float);
}
.rail-drop-line.bad {
  background: var(--pt-emphasis);
}
/* 浮现工具条：贴轨道条外缘（行右缘 / 列下缘），覆盖在表格上方，不挤动布局 */
.rail-minis {
  position: absolute;
  display: flex;
  align-items: stretch;
  background: var(--pt-paper);
  border: 1px solid var(--pt-border);
  border-radius: 6px;
  box-shadow: 0 2px 8px rgb(0 0 0 / 12%);
  z-index: var(--pt-z-float);
  overflow: hidden;
}
.rail-minis :deep(.pt-tooltip-trigger) {
  flex: 1;
  min-width: 0;
}
.rail-mini {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--pt-primary);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  /* T10：hover 轻反馈具名过渡（120~150ms，禁 all） */
  transition: background 130ms ease;
}
@media (hover: hover) {
  .rail-mini:hover:not(:disabled) {
    background: var(--pt-tag);
  }
}
.rail-mini:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
/* T11：窄视口/触屏 44px 命中区（视觉不变：负 margin 抵消 padding 撑出的命中框；
   minis 容器放开裁剪让命中区出框，悬停底色改由按钮自带圆角） */
@media (hover: none), (max-width: 480px) {
  .rail-minis {
    overflow: visible;
  }
  .rail-mini {
    min-width: 44px;
    min-height: 44px;
    margin: -10px;
    border-radius: 6px;
  }
  .rail-label::after {
    /* 序号项命中区向四向撑 8px（相邻项轻叠；横向受 .rail-clip 裁剪止于轨道条宽） */
    content: '';
    position: absolute;
    inset: -8px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .rail-label,
  .rail-mini {
    transition: none;
  }
}
</style>
