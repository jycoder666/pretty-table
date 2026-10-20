<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { DragDropProvider, DragOverlay } from '@dnd-kit/vue'
import { useEditorStore } from '../stores/editor'
import { useLibraryStore } from '../stores/library'
import { applyThemeCssVars } from '../theme/applyCssVars'
import BlockLibrary from '../editor/BlockLibrary.vue'
import PreviewHost from '../editor/PreviewHost.vue'
import PropertyPanel from '../editor/PropertyPanel.vue'
import SaveTemplateDialog from '../editor/SaveTemplateDialog.vue'
import ExportDrawer from '../export/ExportDrawer.vue'
import PtButton from '../ui/PtButton.vue'
import { pointerOnlySensors, readBlockType } from '../dnd/dndKitAdapter'
import { usePlaceSession } from '../dnd/placeSession'
import { computeDropTargets, estimateCellRects, resolveDrop } from '../dnd/slotDnd'

const editor = useEditorStore()
const library = useLibraryStore()
const session = usePlaceSession()
const saveOpen = ref(false)
const exportOpen = ref(false)
const previewRef = ref<InstanceType<typeof PreviewHost> | null>(null)
const ghostLabel = ref('')

watch(
  () => editor.current?.themeId,
  (id) => {
    if (id) applyThemeCssVars(id)
  },
  { immediate: true },
)

function beforeUnload(e: BeforeUnloadEvent) {
  if (!editor.dirty) return
  e.preventDefault()
  e.returnValue = ''
}

function onGlobalKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && session.active.value) {
    e.preventDefault()
    session.cancelPlace()
  }
}

onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload)
  window.addEventListener('keydown', onGlobalKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnload)
  window.removeEventListener('keydown', onGlobalKey)
})

function back() {
  if (editor.dirty) {
    const ok = confirm('离开后，没另存为模板的改动只保留最近一份，可下次打开时继续')
    if (!ok) return
  }
  session.cancelPlace()
  editor.goLibrary()
}

async function onSave(name: string) {
  if (!editor.current) return
  const exists = library.mine.some((t) => t.meta?.displayName === name)
  try {
    await library.saveAsTemplate(editor.current, name)
    editor.markSaved()
    if (exists) editor.showToast('已保存（存在同名模板，已另存为新卡）')
    else editor.showToast('已另存为我的模板')
  } catch (e) {
    const err = e as { details?: { reason?: string } }
    if (err?.details?.reason === 'quota') editor.showToast('我的模板已满，请先删除不用的')
    else editor.showToast('保存失败，请重试')
  }
}

async function discardRestore() {
  if (!confirm('不恢复，将重新选模板，当前草稿会被丢弃。确定？')) return
  await editor.discardRestored()
}

function onDragStart(event: { operation: { source?: { data?: unknown } | null } }) {
  session.setDragging(true)
  session.cancelPlace()
  const type = readBlockType(event.operation.source?.data)
  ghostLabel.value =
    type === 'sectionBar' ? '分区色条' : type === 'groupHeader' ? '分组标题行' : '区块'
  previewRef.value?.refreshTargets?.()
}

function onDragEnd(event: {
  canceled: boolean
  operation: { source?: { data?: unknown } | null; target?: { id?: string | number } | null }
}) {
  session.setDragging(false)
  ghostLabel.value = ''
  if (event.canceled) return
  const type = readBlockType(event.operation.source?.data)
  if (!type || !editor.current) return

  const targetId = event.operation.target?.id
  const targets =
    session.catalogTargets.value.length > 0
      ? session.catalogTargets.value
      : computeDropTargets(editor.current, estimateCellRects(editor.current))
  const hit =
    targetId != null ? (targets.find((t) => t.blockSlotId === String(targetId)) ?? null) : null
  const resolved = resolveDrop(hit, type)
  if ('reject' in resolved) {
    editor.showToast(
      resolved.reject === 'BLOCK_TYPE_REJECT' ? '这里不能放这个区块' : '请放到表内虚线槽位',
    )
    return
  }
  if (resolved.kind !== 'addBlock') return
  const slotId = resolved.block.slotId
  const occupied = editor.current.blocks.some((b) => b.slotId === slotId)
  editor.addBlock(type, slotId)
  editor.showToast(occupied ? '已替换原区块' : '已放入区块')
}
</script>

<template>
  <DragDropProvider
    v-if="editor.current"
    :sensors="pointerOnlySensors"
    @dragStart="onDragStart"
    @dragEnd="onDragEnd"
  >
    <div class="editor">
      <header class="bar">
        <div class="left">
          <PtButton variant="ghost" @click="back">← 模板库</PtButton>
          <strong>{{ editor.current.meta?.displayName ?? '编辑台' }}</strong>
        </div>
        <div class="right">
          <PtButton variant="ghost" :disabled="!editor.undoEnabled" @click="editor.undo()">撤销</PtButton>
          <PtButton variant="ghost" :disabled="editor.pastePending" @click="saveOpen = true">另存为模板</PtButton>
          <PtButton :disabled="editor.exporting || editor.pastePending" @click="exportOpen = true">导出</PtButton>
        </div>
      </header>

      <div v-if="editor.banner" class="banner">
        {{ editor.banner }}
        <PtButton v-if="editor.restorePrompt" variant="ghost" @click="discardRestore"
          >不恢复，重新选模板</PtButton
        >
      </div>

      <div class="body">
        <BlockLibrary />
        <main class="center">
          <PreviewHost ref="previewRef" />
        </main>
        <PropertyPanel />
      </div>

      <SaveTemplateDialog
        v-model:open="saveOpen"
        :default-name="`${editor.current.meta?.displayName ?? '模板'} 副本`"
        @save="onSave"
      />
      <ExportDrawer v-model:open="exportOpen" />
    </div>

    <DragOverlay>
      <div v-if="ghostLabel" class="ghost">{{ ghostLabel }}</div>
    </DragOverlay>
  </DragDropProvider>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f3f4f6;
}
.bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #fff;
  border-bottom: 1px solid var(--pt-border);
}
.left,
.right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  background: var(--pt-tag);
  color: var(--pt-tag-text);
  font-size: 13px;
}
.body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.center {
  flex: 1;
  padding: 12px;
  min-width: 0;
  display: flex;
}
.ghost {
  padding: 8px 12px;
  border: 1px dashed var(--pt-primary);
  border-radius: 8px;
  background: #fff;
  font-size: 13px;
  box-shadow: 0 4px 12px rgb(0 0 0 / 12%);
  opacity: 0.92;
}
</style>
