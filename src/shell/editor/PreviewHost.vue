<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { mount, type CoreHandle, findSlotAtVisual, findMergeAt, visualToLogicalRow } from '@/core'
import { useEditorStore } from '../stores/editor'
import SlotOverlay from '../dnd/SlotOverlay.vue'
import { computeDropTargets, estimateCellRects, type DropTarget } from '../dnd/slotDnd'
import { usePlaceSession } from '../dnd/placeSession'

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
  const x = ev.clientX - rect.left
  const y = ev.clientY - rect.top
  const labelW = 120
  const colW = 140
  const rowH = 36
  const col = x < labelW ? 0 : 1 + Math.floor((x - labelW) / colW)
  const row = Math.floor(y / rowH)
  if (col < 0 || row < 0) return
  const hit = findSlotAtVisual(editor.current, row, col)
  if (hit.isBlockSlot && hit.slotId) {
    const b = editor.current.blocks.find((x) => x.slotId === hit.slotId)
    editor.selectedBlockId = b?.id ?? null
    editor.selectedSlotId = null
    return
  }
  editor.selectedSlotId = hit.slotId
  editor.selectedBlockId = null
  const logical = visualToLogicalRow(editor.current, row)
  if (logical === null) {
    editor.selectionRange = null
    return
  }
  const merge = findMergeAt(editor.current.layout, logical, col)
  if (merge) editor.selectionRange = merge
  else editor.selectionRange = { start: [logical, col], end: [logical, col] }
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
  <div ref="host" class="preview-host" @click="onClick">
    <div ref="el" class="vtable-root" />
    <SlotOverlay
      :targets="dropTargets"
      :host-left="hostOrigin.left"
      :host-top="hostOrigin.top"
      @place="onPlace"
      @cancel="onCancelPlace"
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
}
</style>
