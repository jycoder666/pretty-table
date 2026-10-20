<script setup lang="ts">
import { ref } from 'vue'
import { DialogRoot, DialogContent, DialogTitle, DialogPortal, DialogOverlay } from 'reka-ui'
import { exportHtml, exportPng } from '@/core'
import { useEditorStore } from '../stores/editor'
import { errorCopy } from '../editor/errorCopy'
import { pngMaxOverride } from '../debug/flags'
import { faultGate } from '../debug/fault'
import { copyText } from './clipboard'
import PtButton from '../ui/PtButton.vue'

const open = defineModel<boolean>('open', { default: false })
const editor = useEditorStore()
const htmlFallback = ref<string | null>(null)

async function copyHtml() {
  if (!editor.current) return
  if (faultGate('EXPORT_HTML_FAIL')) {
    editor.showToast(errorCopy('EXPORT_HTML_FAIL'))
    return
  }
  editor.exporting = true
  htmlFallback.value = null
  try {
    const r = exportHtml(editor.current)
    if (!r.ok) {
      editor.showToast(errorCopy(r.error.code, r.error.message))
      return
    }
    try {
      await copyText(r.value)
      editor.showToast('已复制 HTML')
    } catch {
      htmlFallback.value = r.value
      editor.showToast('无法写入剪贴板，请手动全选复制下方 HTML')
    }
  } catch {
    editor.showToast(errorCopy('EXPORT_HTML_FAIL'))
  } finally {
    editor.exporting = false
  }
}

async function downloadPng() {
  if (!editor.current) return
  if (faultGate('EXPORT_PNG_FAIL')) {
    editor.showToast(errorCopy('EXPORT_PNG_FAIL'))
    return
  }
  editor.exporting = true
  editor.showToast('正在生成图片…')
  try {
    const r = await exportPng(editor.current, {
      scale: 2,
      maxPixels: pngMaxOverride(),
    })
    if (!r.ok) {
      editor.showToast(errorCopy(r.error.code, r.error.message))
      return
    }
    const url = URL.createObjectURL(r.value)
    const a = document.createElement('a')
    a.href = url
    a.download = `${editor.current.meta?.displayName ?? 'table'}.png`
    a.click()
    URL.revokeObjectURL(url)
    editor.showToast('PNG 已下载')
  } catch {
    editor.showToast(errorCopy('EXPORT_PNG_FAIL'))
  } finally {
    editor.exporting = false
  }
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="overlay" />
      <DialogContent class="drawer">
        <DialogTitle>导出</DialogTitle>
        <p>复制带样式的 HTML，或下载 2× PNG（与预览同源）。无 Excel 导出。</p>
        <div class="actions">
          <PtButton :disabled="editor.exporting" @click="copyHtml">复制 HTML</PtButton>
          <PtButton :disabled="editor.exporting" @click="downloadPng">导出 PNG</PtButton>
          <PtButton variant="ghost" @click="open = false">关闭</PtButton>
        </div>
        <textarea
          v-if="htmlFallback"
          class="fallback"
          readonly
          :value="htmlFallback"
          rows="8"
          @focus="($event.target as HTMLTextAreaElement).select()"
        />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 35%);
  z-index: 40;
}
.drawer {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: min(360px, 92vw);
  background: #fff;
  padding: 24px;
  z-index: 50;
  border-left: 1px solid var(--pt-border);
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 20px;
}
.fallback {
  margin-top: 14px;
  width: 100%;
  box-sizing: border-box;
  font: 12px/1.4 ui-monospace, monospace;
  border: 1px solid var(--pt-border);
  border-radius: 8px;
  padding: 8px;
  resize: vertical;
}
</style>
