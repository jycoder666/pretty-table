<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { DragDropProvider, DragOverlay } from '@dnd-kit/vue'
import { useEditorStore } from '../stores/editor'
import { useLibraryStore } from '../stores/library'
import { applyThemeCssVars } from '../theme/applyCssVars'
import { effectivePalette } from '@/core'
import BlockLibrary from '../editor/BlockLibrary.vue'
import PreviewHost from '../editor/PreviewHost.vue'
import PropertyPanel from '../editor/PropertyPanel.vue'
import StructureRail from '../editor/StructureRail.vue'
import EditorToolbar from '../editor/EditorToolbar.vue'
import SaveTemplateDialog from '../editor/SaveTemplateDialog.vue'
import ExportDrawer from '../export/ExportDrawer.vue'
import PtButton from '../ui/PtButton.vue'
import PtTooltip from '../ui/PtTooltip.vue'
import ConfirmDialog from '../ui/ConfirmDialog.vue'
import { confirmAction } from '../ui/confirm'
import { pointerOnlySensors, readBlockDrag } from '../dnd/dndKitAdapter'
import { usePlaceSession } from '../dnd/placeSession'
import { BLOCK_TYPE_LABEL, computeDropTargets, estimateCellRects, resolveDrop } from '../dnd/slotDnd'
import { shouldRedo, shouldUndo } from '../editor/undoHotkey'
import { openLibraryRail } from '../editor/libraryRail'

const editor = useEditorStore()
const library = useLibraryStore()
const session = usePlaceSession()
const saveOpen = ref(false)
const exportOpen = ref(false)
const previewRef = ref<InstanceType<typeof PreviewHost> | null>(null)
const ghostLabel = ref('')

watch(
  // themeId（换主题）+ version（含 setThemeToken 颜色覆盖）任一变化都重刷 CSS 变量（FR-C1）
  () => [editor.current?.themeId, editor.state?.version],
  () => {
    if (editor.current) applyThemeCssVars(editor.current.themeId, effectivePalette(editor.current))
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
    return
  }
  // PX-13 / E3：Ctrl/Cmd+Z 撤销；Ctrl+Y / Ctrl/Cmd+Shift+Z 重做（绑定在编辑台层，不全局污染）。
  // 键识别 / 输入框聚焦 / 粘贴预览期 / 链空由 shouldUndo / shouldRedo 收口（内含键判定，不重复判定）
  if (shouldUndo(e, editor, document.activeElement)) {
    e.preventDefault()
    editor.undo()
    return
  }
  if (shouldRedo(e, editor, document.activeElement)) {
    e.preventDefault()
    editor.redo()
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

async function back() {
  if (editor.dirty) {
    // PX-05：确认走统一确认弹窗，按钮写明「离开」而非歧义的「确定」
    const go = await confirmAction({
      title: '离开编辑台',
      message: '离开后，没另存为模板的改动只保留最近一份，可下次打开时继续',
      confirmText: '离开',
      danger: true,
    })
    if (!go) return
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
  const go = await confirmAction({
    title: '丢弃当前草稿',
    message: '不恢复，将重新选模板，当前草稿会被丢弃。确定？',
    confirmText: '丢弃，重新选模板',
    danger: true,
  })
  if (!go) return
  await editor.discardRestored()
}

function onDragStart(event: { operation: { source?: { data?: unknown } | null } }) {
  const payload = readBlockDrag(event.operation.source?.data)
  // R-1：把拖拽类型带进会话（SlotOverlay 按 accept 匹配高亮 / 弱化）
  session.setDragging(true, payload?.type)
  // T03：起拖即展开左栏（窄栏态不挡拖放）
  openLibraryRail()
  session.cancelPlace()
  ghostLabel.value = payload ? BLOCK_TYPE_LABEL[payload.type] : '区块'
  previewRef.value?.refreshTargets?.()
}

function onDragEnd(event: {
  canceled: boolean
  operation: { source?: { data?: unknown } | null; target?: { id?: string | number } | null }
}) {
  session.setDragging(false)
  ghostLabel.value = ''
  if (event.canceled) return
  const payload = readBlockDrag(event.operation.source?.data)
  if (!payload || !editor.current) return
  const type = payload.type

  const targetId = event.operation.target?.id
  const targets =
    session.catalogTargets.value.length > 0
      ? session.catalogTargets.value
      : computeDropTargets(editor.current, estimateCellRects(editor.current))
  const hit =
    targetId != null ? (targets.find((t) => t.blockSlotId === String(targetId)) ?? null) : null

  // WP4：表内区块拖动（把手拖到别的槽位）——空槽移动、占用则互换，都走核内 moveBlock
  if (payload.blockId) {
    if (!hit) {
      editor.showToast('请拖到表内虚线槽位')
      return
    }
    if (hit.blockSlotId === payload.fromSlotId) return // 原地放下：不动也不提示
    editor.moveBlock(payload.blockId, hit.blockSlotId)
    return
  }

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
          <!-- PX-09：粘贴入口并入顶部工具条，预览区不再被悬浮按钮遮挡 -->
          <EditorToolbar />
          <!-- E3：撤销/重做按钮随 canUndo/canRedo 置灰；粘贴预览期双双禁用（FR-17） -->
          <PtTooltip text="撤销上一步操作">
            <PtButton
              variant="ghost"
              :disabled="!editor.undoEnabled || editor.pastePending"
              @click="editor.undo()"
              >撤销</PtButton
            >
          </PtTooltip>
          <PtTooltip text="重做被撤销的操作">
            <PtButton
              variant="ghost"
              :disabled="!editor.redoEnabled || editor.pastePending"
              @click="editor.redo()"
              >重做</PtButton
            >
          </PtTooltip>
          <PtTooltip text="把当前表格另存为我的模板（图片一起保存）">
            <PtButton variant="ghost" :disabled="editor.pastePending" @click="saveOpen = true">另存为模板</PtButton>
          </PtTooltip>
          <PtTooltip text="复制带样式的 HTML 或导出 PNG">
            <PtButton :disabled="editor.exporting || editor.pastePending" @click="exportOpen = true">导出</PtButton>
          </PtTooltip>
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
        <!-- T03 stage 布局：列轨道条（上，冻结式）+ 行轨道条（左，冻结式）+ PreviewHost；
             轨道条在滚动容器外，几何经 railGeometry 桥同步（A4） -->
        <main class="center">
          <div class="stage">
            <div class="col-rail-strip" data-testid="col-rail-strip">
              <StructureRail axis="col" />
            </div>
            <div class="stage-body">
              <div class="row-rail-strip" data-testid="row-rail-strip">
                <StructureRail axis="row" />
              </div>
              <PreviewHost ref="previewRef" />
            </div>
          </div>
        </main>
        <PropertyPanel />
      </div>

      <SaveTemplateDialog
        v-model:open="saveOpen"
        :default-name="`${editor.current.meta?.displayName ?? '模板'} 副本`"
        @save="onSave"
      />
      <ExportDrawer v-model:open="exportOpen" />
      <!-- PX-05：统一确认弹窗（离开编辑台 / 丢弃草稿） -->
      <ConfirmDialog />
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
/* T03 stage 布局（A4）：轨道条冻结在滚动容器外 */
.stage {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}
.col-rail-strip {
  height: 28px;
  flex-shrink: 0;
  position: relative;
}
.stage-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.row-rail-strip {
  width: 28px;
  flex-shrink: 0;
  position: relative;
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
