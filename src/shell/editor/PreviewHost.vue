<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { mount, type CoreHandle, findSlotAtVisual, findMergeAt, visualToLogicalRow } from '@/core'
import { useEditorStore } from '../stores/editor'
import SlotOverlay from '../dnd/SlotOverlay.vue'
import { computeDropTargets, estimateCellRects, type DropTarget } from '../dnd/slotDnd'
import { usePlaceSession } from '../dnd/placeSession'
import { locateVisual } from './previewHit'
import { expandRectSelection, selectionCellRects } from './selection'
import PasteEntry from '../paste/PasteEntry.vue'

const editor = useEditorStore()
const session = usePlaceSession()
const el = ref<HTMLDivElement | null>(null)
const host = ref<HTMLDivElement | null>(null)
const dropTargets = ref<DropTarget[]>([])
const hostOrigin = ref({ left: 0, top: 0 })
let handle: CoreHandle | null = null

function refreshTargets() {
  if (!editor.current || !host.value) {
    dropTargets.value = []
    session.setCatalogTargets([])
    return
  }
  hostOrigin.value = { left: 0, top: 0 }
  const cells = estimateCellRects(editor.current, { left: 0, top: 0 })
  dropTargets.value = computeDropTargets(editor.current, cells)
  session.setCatalogTargets(dropTargets.value)
}

onMounted(() => {
  if (!el.value || !editor.current) return
  handle = mount(el.value, {
    initial: editor.current,
    onError: (err) => editor.showToast(err.message),
  })
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
  window.removeEventListener('resize', refreshTargets)
  handle?.destroy()
  handle = null
})

function onClick(ev: MouseEvent) {
  if (session.overlayVisible.value) return
  if (!editor.current || !el.value) return
  const tableEl = el.value.querySelector('canvas')
  if (!tableEl) return
  const rect = tableEl.getBoundingClientRect()
  // PX-04：命中与渲染同源——生效列宽 / 行高档位 / 区块行都参与定位
  const pos = locateVisual(editor.current, ev.clientX - rect.left, ev.clientY - rect.top)
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

// R-2：选区可视化（壳叠加层描边，与 estimateCellRects 同源几何）
const selectionRects = computed(() => {
  if (!editor.current || !editor.selectionRange) return []
  return selectionCellRects(editor.current, editor.selectionRange)
})

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
  <div ref="host" class="preview-host" :class="{ 'drag-active': session.dragging.value }" @click="onClick">
    <!-- PX-09：悬浮粘贴按钮已并入顶部工具条（EditorPage header），预览区保持纯净 -->
    <div ref="el" class="vtable-root" />
    <!-- R-2：选区描边叠加层（纯壳，不刷核） -->
    <div
      v-for="(r, i) in selectionRects"
      :key="`sel-${i}`"
      class="selection-cell"
      :style="{
        left: r.left + 'px',
        top: r.top + 'px',
        width: r.width + 'px',
        height: r.height + 'px',
      }"
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
</style>
