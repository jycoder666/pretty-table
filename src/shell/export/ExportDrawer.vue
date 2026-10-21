<script setup lang="ts">
import { computed, ref } from 'vue'
import { DialogRoot, DialogContent, DialogTitle, DialogPortal, DialogOverlay } from 'reka-ui'
import { exportHtml, exportPng, measurePng } from '@/core'
import { useEditorStore } from '../stores/editor'
import { errorCopy } from '../editor/errorCopy'
import { pngMaxOverride } from '../debug/flags'
import { faultGate } from '../debug/fault'
import { getPngScale, setPngScale, type PngScale } from '../repo/prefs'
import { copyText } from './clipboard'
import PtButton from '../ui/PtButton.vue'
import PtTooltip from '../ui/PtTooltip.vue'

const open = defineModel<boolean>('open', { default: false })
const editor = useEditorStore()
const htmlFallback = ref<string | null>(null)

/** GC-19：调试开关构建期常量；生产构建折叠为 false，调试调用被摇树 */
const PT_DEBUG = import.meta.env.VITE_PT_DEBUG === '1' || import.meta.env.DEV

// ── PNG 选项（T27）：倍率 1/2/3（默认 2，记住上次选择）+ 透明底 ──
const scales: readonly PngScale[] = [1, 2, 3]
const pngScale = ref<PngScale>(getPngScale())
const pngTransparent = ref(false)

function chooseScale(s: PngScale) {
  pngScale.value = s
  setPngScale(s)
}

/** 实时预估（只算不画）：约 W × H 像素 */
const estimate = computed(() =>
  editor.current ? measurePng(editor.current, pngScale.value) : null,
)

async function copyHtml() {
  if (!editor.current) return
  if (PT_DEBUG && faultGate('EXPORT_HTML_FAIL')) {
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
  if (PT_DEBUG && (faultGate('EXPORT_PNG_FAIL') || faultGate('EXPORT_PNG_TOO_LARGE'))) {
    editor.showToast(errorCopy('EXPORT_PNG_TOO_LARGE'))
    return
  }
  editor.exporting = true
  editor.showToast('正在生成图片…')
  try {
    const r = await exportPng(editor.current, {
      scale: pngScale.value,
      transparent: pngTransparent.value,
      maxPixels: PT_DEBUG ? pngMaxOverride() : undefined,
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
        <p>复制带样式的 HTML，或下载 PNG（与预览同源）。无 Excel 导出。</p>

        <div class="png-opts">
          <div class="opt-row">
            <span class="opt-label">倍率</span>
            <div class="seg" role="radiogroup" aria-label="PNG 倍率">
              <button
                v-for="s in scales"
                :key="s"
                type="button"
                class="seg-btn"
                :class="{ on: pngScale === s }"
                :aria-pressed="pngScale === s"
                :disabled="editor.exporting"
                @click="chooseScale(s)"
              >
                {{ s }}×
              </button>
            </div>
          </div>
          <label class="opt-row check">
            <input
              type="checkbox"
              :checked="pngTransparent"
              :disabled="editor.exporting"
              @change="pngTransparent = ($event.target as HTMLInputElement).checked"
            />
            透明底（表格外留白透明）
          </label>
          <p v-if="estimate" class="estimate">约 {{ estimate.outWidth }} × {{ estimate.outHeight }} 像素</p>
        </div>

        <div class="actions">
          <PtTooltip text="复制带样式的 HTML，粘贴到支持富文本的编辑器">
            <PtButton class="wide" :disabled="editor.exporting" @click="copyHtml">复制 HTML</PtButton>
          </PtTooltip>
          <PtTooltip text="按当前倍率导出 PNG 图片（与预览同源）">
            <PtButton class="wide" :disabled="editor.exporting" @click="downloadPng">导出 PNG</PtButton>
          </PtTooltip>
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
.png-opts {
  margin-top: 14px;
  padding: 12px;
  border: 1px solid var(--pt-border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.opt-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.opt-label {
  font-size: 13px;
  color: #374151;
}
.seg {
  display: inline-flex;
  border: 1px solid var(--pt-border);
  border-radius: 8px;
  overflow: hidden;
}
.seg-btn {
  border: none;
  background: #fff;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
}
.seg-btn + .seg-btn {
  border-left: 1px solid var(--pt-border);
}
.seg-btn.on {
  background: var(--pt-tag);
  color: var(--pt-tag-text);
  font-weight: 600;
}
.seg-btn:disabled {
  cursor: default;
  opacity: 0.6;
}
.check {
  font-size: 13px;
  color: #374151;
}
.estimate {
  margin: 0;
  font-size: 12px;
  color: var(--pt-muted);
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 20px;
}
/* PtTooltip 包裹后按钮撑满整行 */
.actions :deep(.pt-tooltip-trigger),
.actions button {
  width: 100%;
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
