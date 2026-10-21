<script setup lang="ts">
import { computed, ref } from 'vue'
import { DialogRoot, DialogContent, DialogTitle, DialogPortal, DialogOverlay } from 'reka-ui'
import { exportHtml, loadRenderCore, measurePng } from '@/core'
import { useEditorStore } from '../stores/editor'
import { errorCopy } from '../editor/errorCopy'
import { pngMaxOverride } from '../debug/flags'
import { faultGate } from '../debug/fault'
import { getPngScale, setPngScale, type PngScale } from '../repo/prefs'
import { triggerBlobDownload } from './blobDownload'
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
  scaleAttn.value = false
}

/** 实时预估（只算不画）：约 W × H 像素 */
const estimate = computed(() =>
  editor.current ? measurePng(editor.current, pngScale.value) : null,
)

// ── PX-12：PNG 超像素门槛 → 按当前倍率给出具体的降倍建议 + 高亮倍率选项 ──
const scaleAttn = ref(false)

/** 按当前倍率生成白话建议（GC-25：不露错误码；交互层文案，不动核内门槛） */
function pngScaleAdvice(): string {
  if (pngScale.value === 3) return '图片太大：当前 3× 超限，请改用 2× 或 1× 后重试'
  if (pngScale.value === 2) return '图片太大：当前 2× 超限，请改用 1× 后重试'
  return '图片太大：当前已是最低倍率 1×，请精简表格内容后重试'
}

// ── PX-14：HTML 效果预览（GC-22：iframe sandbox="" 渲染导出产物，不注入页面文档） ──
const previewOpen = ref(false)
const previewHtml = ref('')

function openPreview() {
  if (!editor.current) return
  let r: ReturnType<typeof exportHtml>
  try {
    r = exportHtml(editor.current)
  } catch {
    editor.showToast(errorCopy('EXPORT_HTML_FAIL'))
    return
  }
  if (!r.ok) {
    editor.showToast(errorCopy(r.error.code, r.error.message))
    return
  }
  previewHtml.value = r.value
  previewOpen.value = true
}

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
  if (PT_DEBUG && faultGate('EXPORT_PNG_FAIL')) {
    editor.showToast(errorCopy('EXPORT_PNG_FAIL'))
    return
  }
  if (PT_DEBUG && faultGate('EXPORT_PNG_TOO_LARGE')) {
    scaleAttn.value = true
    editor.showToast(pngScaleAdvice())
    return
  }
  editor.exporting = true
  editor.showToast('正在生成图片…')
  try {
    // T34：exportPng 在渲染核动态 chunk 里（VTable），首次导出时按需加载
    const { exportPng } = await loadRenderCore()
    const r = await exportPng(editor.current, {
      scale: pngScale.value,
      transparent: pngTransparent.value,
      maxPixels: PT_DEBUG ? pngMaxOverride() : undefined,
    })
    if (!r.ok) {
      // PX-12：超像素门槛 → 具体降倍建议 + 高亮倍率选项；其余错误照常白话提示
      if (r.error.code === 'EXPORT_PNG_TOO_LARGE') {
        scaleAttn.value = true
        editor.showToast(pngScaleAdvice())
      } else {
        editor.showToast(errorCopy(r.error.code, r.error.message))
      }
      return
    }
    // blob URL 延迟释放（此前同步 revoke 在极端 CPU 饥饿下会抢在下载启动前
    // 失效 URL，导致静默丢下载——见 blobDownload.ts 文件头说明）
    triggerBlobDownload(r.value, `${editor.current.meta?.displayName ?? 'table'}.png`)
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
        <!-- PX-11：副标题改正向表述（不再提「无 Excel 导出」） -->
        <p>复制带样式的 HTML，或下载高清 PNG（与预览同源）。</p>

        <div class="png-opts">
          <div class="opt-row">
            <span class="opt-label">倍率</span>
            <div class="seg" role="radiogroup" aria-label="PNG 倍率" :class="{ attn: scaleAttn }">
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
          <!-- PX-14：HTML 效果预览（iframe sandbox 渲染导出产物） -->
          <PtTooltip text="先看看导出的 HTML 贴出去长什么样">
            <PtButton class="wide" variant="ghost" :disabled="editor.exporting" data-testid="html-preview-btn" @click="openPreview">
              预览
            </PtButton>
          </PtTooltip>
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

        <!-- PX-14：导出 HTML 效果预览小窗（GC-22：sandbox=""，禁脚本/同源，静态产物渲染） -->
        <div v-if="previewOpen" class="preview-overlay" data-testid="html-preview-overlay">
          <div
            class="preview-box"
            role="dialog"
            aria-modal="true"
            aria-label="导出 HTML 效果预览"
            data-testid="html-preview-box"
          >
            <div class="preview-head">
              <strong>效果预览</strong>
              <PtButton variant="ghost" data-testid="html-preview-close" @click="previewOpen = false">
                关闭
              </PtButton>
            </div>
            <iframe
              class="preview-frame"
              sandbox=""
              :srcdoc="previewHtml"
              aria-label="导出 HTML 效果预览"
              data-testid="html-preview-frame"
            />
            <p class="preview-note">以上为复制内容的实际效果示意，与粘贴到富文本编辑器一致。</p>
          </div>
        </div>
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
/* PX-12：超像素门槛报错后高亮倍率选项，引导降倍 */
.seg.attn {
  border-color: var(--pt-emphasis);
  box-shadow: 0 0 0 1px var(--pt-emphasis);
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
/* PX-14：HTML 效果预览小窗（叠在抽屉之上） */
.preview-overlay {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 35%);
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
}
.preview-box {
  background: #fff;
  border: 1px solid var(--pt-border);
  border-radius: 12px;
  padding: 16px;
  width: min(720px, 92vw);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 6px 18px rgb(0 0 0 / 12%);
}
.preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.preview-frame {
  width: 100%;
  height: 60vh;
  border: 1px solid var(--pt-border);
  border-radius: 8px;
  background: #fff;
}
.preview-note {
  margin: 0;
  font-size: 12px;
  color: var(--pt-muted);
}
</style>
