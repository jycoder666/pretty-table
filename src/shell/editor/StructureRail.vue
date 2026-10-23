<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { canAddCol, canAddRow } from '@/core'
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
import PtTooltip from '../ui/PtTooltip.vue'

/**
 * 行/列轨道（增量设计 A2，轴参数化一套组件两用）：
 * - 序号内容只有 1/2/3…、A/B/C…（MUST NOT 读取业务表头或首列文案，A4 防误判）
 * - 点击序号 = 选中整行/整列（structuralSelection，互斥清空既有选区）
 * - 悬停或选中态浮现 +（默认后插）与 …（打开结构菜单）；浮现工具条渲染在裁剪层之外
 *   （行项贴 host 左缘外、列项贴 host 上缘外），不挤动序号布局
 * - 表头行可选中；区块行无逻辑行号 → 天然无轨道项（rowRailItems 映射跳过）
 * - 粘贴预览期整体禁用（pointer-events:none + disabled + tooltip「请先确认或取消粘贴」）
 * 几何全部来自 railGeometry（不自算）；非导出壳层。
 */
const props = defineProps<{ axis: StructuralAxis }>()

const editor = useEditorStore()
const actions = useStructureActions()

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

const selectedIndex = computed(() => {
  const s = editor.structuralSelection
  return s && s.axis === props.axis ? s.index : -1
})

const locked = computed(() => editor.pastePending)
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

function select(item: RailItem) {
  editor.structuralSelection = { axis: props.axis, index: item.index }
}

function onPlus(item: RailItem) {
  if (plusDisabled.value) return
  if (props.axis === 'row') void actions.insertRowAt(item.index, false)
  else void actions.insertColAt(item.index, false)
}

function onMenu(item: RailItem) {
  if (locked.value) return
  openStructureMenu(props.axis, item.index)
}
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
        :class="{ on: selectedIndex === item.index, header: item.header }"
        :style="labelStyle(item)"
        :data-testid="`rail-${axis}-${item.index}`"
        @click="select(item)"
        @mouseenter="hoverIndex = item.index"
      >
        {{ item.label }}
      </button>
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
  cursor: pointer;
  padding: 0;
}
.rail-label.header {
  font-weight: 600;
}
.rail-label:hover,
.rail-label.on {
  background: var(--pt-tag);
  color: var(--pt-primary);
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
  z-index: 6;
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
}
.rail-mini:hover:not(:disabled) {
  background: var(--pt-tag);
}
.rail-mini:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
