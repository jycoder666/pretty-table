<script setup lang="ts">
import { computed, ref } from 'vue'
import { DialogRoot, DialogContent, DialogTitle, DialogPortal, DialogOverlay } from 'reka-ui'
import {
  exportCsv,
  exportHtml,
  exportText,
  instanceToJSON,
  loadRenderCore,
  measurePng,
  PNG_PAD,
} from '@/core'
import { useEditorStore } from '../stores/editor'
import { useLibraryStore } from '../stores/library'
import { blobToCoverDataUrl } from './cover'
import { errorCopy } from '../editor/errorCopy'
import { pngMaxOverride } from '../debug/flags'
import { faultGate } from '../debug/fault'
import { getPngScale, setPngScale, type PngScale } from '../repo/prefs'
import { triggerBlobDownload } from './blobDownload'
// 与本地处理函数 copyHtml 同名，导入时改名避免遮蔽（否则调用会递归到自身）
import { copyHtml as writeClipboard } from './clipboard'
import PtButton from '../ui/PtButton.vue'
import PtTooltip from '../ui/PtTooltip.vue'

const open = defineModel<boolean>('open', { default: false })
const editor = useEditorStore()
const library = useLibraryStore()
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

// ── P4 PNG 尺寸档位：自动 / 1080 宽（小红书）/ 1200 宽（公众号）。
// 选中目标宽时倍率由「目标宽 /（内容宽 + 2×留白）」推算（2 位小数、clamp 0.5–4），
// 倍率 seg 组禁用；切回「自动」恢复手动三档 ──
type SizePreset = 'auto' | '1080' | '1200'
const sizePreset = ref<SizePreset>('auto')

function choosePreset(p: SizePreset) {
  sizePreset.value = p
  scaleAttn.value = false
}

/** 内容宽（与倍率无关，取一次供档位换算） */
const contentSize = computed(() =>
  editor.current ? measurePng(editor.current, 1) : null,
)

/** 档位等效倍率；自动档为 null（沿用 pngScale 手动三档） */
const presetScale = computed<number | null>(() => {
  if (sizePreset.value === 'auto' || !contentSize.value) return null
  const target = Number(sizePreset.value)
  const raw = target / (contentSize.value.contentWidth + PNG_PAD * 2)
  // 四舍五入保留 2 位小数，clamp 到核内支持的 0.5–4 区间
  return Math.min(4, Math.max(0.5, Math.round(raw * 100) / 100))
})

/** 实际生效倍率：档位推算优先，自动档沿用用户倍率（预估与下载同源单点） */
const activeScale = computed(() => presetScale.value ?? pngScale.value)

/** 实时预估（只算不画）：约 W × H 像素 */
const estimate = computed(() =>
  editor.current ? measurePng(editor.current, activeScale.value) : null,
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
    // text/plain 风味用 TSV（设计增量 §5.2）：文本导出失败时退回 HTML 源码，不挡主流程
    const t = exportText(editor.current)
    try {
      await writeClipboard(r.value, t.ok ? t.value : r.value)
      editor.showToast('已复制到剪贴板')
    } catch {
      htmlFallback.value = r.value
      editor.showToast('浏览器没有允许写入剪贴板，请在下方框里全选后手动复制')
    }
  } catch {
    editor.showToast(errorCopy('EXPORT_HTML_FAIL'))
  } finally {
    editor.exporting = false
  }
}

async function downloadPng() {
  const blob = await renderPngBlob()
  if (!blob) return
  // blob URL 延迟释放（此前同步 revoke 在极端 CPU 饥饿下会抢在下载启动前
  // 失效 URL，导致静默丢下载——见 blobDownload.ts 文件头说明）
  triggerBlobDownload(blob, `${editor.current?.meta?.displayName ?? 'table'}.png`)
  editor.showToast('PNG 已下载')
  // Schema 1.5：导出的图自动成为模板封面（缩略写 meta.cover，库页卡片展示；
  // 非阻塞、失败静默——封面是附属数据，不影响导出主流程）
  const tplId = editor.current?.templateId
  if (tplId) {
    blobToCoverDataUrl(blob).then((cover) => {
      if (cover) void library.setTemplateCover(tplId, cover)
    })
  }
}

/** 模板 JSON 导出（跨设备同步）：核内 instanceToJSON 规范化 → blob 下载 .pretty-table.json */
function downloadJson() {
  if (!editor.current) return
  let r: ReturnType<typeof instanceToJSON>
  try {
    r = instanceToJSON(editor.current)
  } catch {
    editor.showToast('这张表读不出来，无法导出 JSON')
    return
  }
  if (!r.ok) {
    editor.showToast('这张表读不出来，无法导出 JSON')
    return
  }
  const blob = new Blob([r.value], { type: 'application/json' })
  triggerBlobDownload(blob, `${editor.current?.meta?.displayName ?? 'table'}.pretty-table.json`)
  editor.showToast('模板 JSON 已下载')
}

/** P4 CSV 导出：纯数据网格（核内静态纯函数，无需 loadRenderCore）→ blob 下载 .csv */
function downloadCsv() {
  if (!editor.current) return
  let r: ReturnType<typeof exportCsv>
  try {
    r = exportCsv(editor.current)
  } catch {
    editor.showToast('这张表读不出来，无法导出 CSV')
    return
  }
  if (!r.ok) {
    editor.showToast(r.error.message)
    return
  }
  const blob = new Blob([r.value], { type: 'text/csv;charset=utf-8' })
  triggerBlobDownload(blob, `${editor.current.meta?.displayName ?? 'table'}.csv`)
  editor.showToast('CSV 已下载')
}

/**
 * 新标签页打开（取证路径）：生成同一 PNG 后以 blob URL 直开图片页，
 * 供无法触发下载的环境（部分内嵌浏览器/受管控 WebView）截图取证；
 * 不改变「导出 PNG」按钮行为。URL 延迟 60s 释放，保证新标签来得及加载。
 */
async function openPngInTab() {
  const blob = await renderPngBlob()
  if (!blob) return
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank', 'noopener')
  if (!win) {
    editor.showToast('浏览器拦截了新窗口，请允许弹窗后重试')
    URL.revokeObjectURL(url)
    return
  }
  editor.showToast('已在新标签页打开')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** PNG 生成共用体（下载 / 新标签页打开同源）：门槛与白话提示口径一致 */
async function renderPngBlob(): Promise<Blob | null> {
  if (!editor.current) return null
  if (PT_DEBUG && faultGate('EXPORT_PNG_FAIL')) {
    editor.showToast(errorCopy('EXPORT_PNG_FAIL'))
    return null
  }
  if (PT_DEBUG && faultGate('EXPORT_PNG_TOO_LARGE')) {
    scaleAttn.value = true
    editor.showToast(pngScaleAdvice())
    return null
  }
  editor.exporting = true
  editor.showToast('正在生成图片…')
  try {
    // T34：exportPng 在渲染核动态 chunk 里（VTable），首次导出时按需加载
    const { exportPng } = await loadRenderCore()
    const r = await exportPng(editor.current, {
      // P4：档位模式下用等效倍率（自动档 = 手动三档选择）
      scale: activeScale.value,
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
      return null
    }
    return r.value
  } catch {
    editor.showToast(errorCopy('EXPORT_PNG_FAIL'))
    return null
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
        <p>复制带样式的 HTML，下载高清 PNG（与预览同源）；导出 JSON 可在另一台设备导入还原。</p>

        <div class="png-opts">
          <!-- P4：尺寸档位（目标宽单选；选中后倍率由目标宽推算并锁定手动倍率） -->
          <div class="opt-row">
            <span class="opt-label">尺寸档位</span>
            <div class="seg" role="radiogroup" aria-label="PNG 尺寸档位">
              <button
                v-for="p in [
                  { key: 'auto', label: '自动' },
                  { key: '1080', label: '1080 宽·小红书' },
                  { key: '1200', label: '1200 宽·公众号' },
                ] as const"
                :key="p.key"
                type="button"
                class="seg-btn"
                :class="{ on: sizePreset === p.key }"
                :aria-pressed="sizePreset === p.key"
                :disabled="editor.exporting"
                @click="choosePreset(p.key)"
              >
                {{ p.label }}
              </button>
            </div>
          </div>
          <div class="opt-row">
            <span class="opt-label">倍率</span>
            <div
              class="seg"
              role="radiogroup"
              aria-label="PNG 倍率"
              :class="{ attn: scaleAttn }"
            >
              <button
                v-for="s in scales"
                :key="s"
                type="button"
                class="seg-btn"
                :class="{ on: sizePreset === 'auto' && pngScale === s }"
                :aria-pressed="sizePreset === 'auto' && pngScale === s"
                :disabled="editor.exporting || sizePreset !== 'auto'"
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
          <p v-if="estimate" class="estimate">
            约 {{ estimate.outWidth }} × {{ estimate.outHeight }} 像素<template v-if="presetScale">（{{ presetScale }}×）</template>
          </p>
        </div>

        <div class="actions">
          <!-- PX-14：HTML 效果预览（iframe sandbox 渲染导出产物） -->
          <PtTooltip text="先看看导出的 HTML 贴出去长什么样">
            <PtButton class="wide" variant="ghost" :disabled="editor.exporting" data-testid="html-preview-btn" @click="openPreview">
              预览
            </PtButton>
          </PtTooltip>
          <PtTooltip text="自带标题和表头，粘到公众号、邮件、文档里结构不乱">
            <PtButton class="wide" :disabled="editor.exporting" @click="copyHtml">复制 HTML</PtButton>
          </PtTooltip>
          <PtTooltip text="按当前倍率导出 PNG 图片（与预览同源）">
            <PtButton class="wide" :disabled="editor.exporting" @click="downloadPng">导出 PNG</PtButton>
          </PtTooltip>
          <!-- P4：CSV 纯数据导出（BOM + RFC 4180，贴回表格软件不乱码） -->
          <PtTooltip text="下载纯数据 CSV 文件（无样式），可在表格软件中打开">
            <PtButton
              class="wide"
              variant="ghost"
              :disabled="editor.exporting"
              data-testid="export-csv-btn"
              @click="downloadCsv"
            >
              导出 CSV
            </PtButton>
          </PtTooltip>
          <PtTooltip text="下载模板 JSON 文件，在另一台设备的模板库导入即可还原这张表">
            <PtButton
              class="wide"
              variant="ghost"
              :disabled="editor.exporting"
              data-testid="export-json-btn"
              @click="downloadJson"
            >
              导出 JSON
            </PtButton>
          </PtTooltip>
          <PtTooltip text="在新标签页直接打开图片，用于无法下载时取证">
            <PtButton
              class="wide"
              variant="ghost"
              :disabled="editor.exporting"
              data-testid="png-open-tab"
              @click="openPngInTab"
            >
              新标签页打开
            </PtButton>
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
  z-index: var(--pt-z-drawer);
}
.drawer {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: min(360px, 92vw);
  background: #fff;
  padding: 24px;
  z-index: var(--pt-z-dialog);
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
  /* T10：倍率数字对齐（属性式） */
  font-variant-numeric: tabular-nums;
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
  /* T10：导出尺寸数字对齐（属性式） */
  font-variant-numeric: tabular-nums;
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
/* PX-14：HTML 效果预览小窗（叠在抽屉之上；60 档无 dialog 语义命中，取 toolbar 档保序，见设计 A8 登记） */
.preview-overlay {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 35%);
  z-index: var(--pt-z-toolbar);
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
