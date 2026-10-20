<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { MARK_GLYPH, formatNumber, parseMark, parseNumeric } from '@/core'
import { useEditorStore } from '../stores/editor'
import { estimateCellRects } from '../dnd/slotDnd'
import PtButton from '../ui/PtButton.vue'

/**
 * 粘贴入口与预览（交互 §1.2，P1 先看后写）：
 * - 主入口：选中可写槽（描边态、非输入态）Ctrl/Cmd+V → 预览高亮 + 确认/取消
 * - 输入态里的粘贴走浏览器原生，只进当前格
 * - 预览期间不写 store：全屏守卫禁用其它操作，点守卫 = 取消
 */
const editor = useEditorStore()
const preview = computed(() => editor.pastePreview)

function isEditableTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  if (!el || typeof el.tagName !== 'string') return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true
}

function onWindowPaste(e: ClipboardEvent) {
  if (editor.pastePending) return
  if (isEditableTarget(e.target)) return // 输入态走原生（只进当前格）
  if (!editor.selectedSlotId) return
  const data = e.clipboardData
  if (!data) return
  const text = data.getData('text/plain') ?? ''
  const html = data.getData('text/html') ?? ''
  if (text.trim() === '' && html.trim() === '') {
    e.preventDefault()
    editor.showToast('剪贴板里没有可用的表格文字。请在 Excel / WPS 里选中单元格复制后再粘贴')
    return
  }
  e.preventDefault()
  editor.pasteStart({ text, html })
}

function onKey(e: KeyboardEvent) {
  if (!editor.pastePending) return
  if (e.key === 'Escape') editor.cancelPaste()
  else if (e.key === 'Enter') editor.confirmPaste()
}

onMounted(() => {
  window.addEventListener('paste', onWindowPaste)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('paste', onWindowPaste)
  window.removeEventListener('keydown', onKey)
})

// ── 覆盖层：目标格半透明主题浅色 + 新值浅灰斜体；起点格加粗描边（交互 ②）──
const rects = computed(() => (editor.current ? estimateCellRects(editor.current) : []))

function displayFor(
  slotId: string,
  raw: string,
  kind: 'value' | 'empty',
): { text: string; asText: boolean; clearing: boolean } {
  const inst = editor.current
  if (!inst) return { text: raw, asText: false, clearing: false }
  if (kind === 'empty') return { text: '（将清空）', asText: false, clearing: true }
  const def = inst.slotDefs?.[slotId]
  const k = def?.kind ?? 'text'
  if (k === 'mark') {
    const m = parseMark(raw)
    if (m) return { text: MARK_GLYPH[m], asText: false, clearing: false }
    return { text: raw, asText: true, clearing: false }
  }
  if (k === 'number') {
    const r = parseNumeric(raw, def?.format ?? 'number')
    if (r.ok) {
      return {
        text: formatNumber(r.value, def ?? { format: 'number' }),
        asText: false,
        clearing: false,
      }
    }
    return { text: raw, asText: true, clearing: false }
  }
  return { text: raw, asText: false, clearing: false }
}

const previewCells = computed(() => {
  const p = preview.value
  if (!p) return []
  return p.plan.cells.map((c) => {
    const d = c.slotId
      ? displayFor(c.slotId, c.raw, c.kind)
      : { text: c.raw, asText: false, clearing: false }
    const rect = rects.value[c.row]?.[c.col] ?? null
    return {
      key: `${c.row}-${c.col}`,
      left: rect?.left ?? 0,
      top: rect?.top ?? 0,
      width: rect?.width ?? 0,
      height: rect?.height ?? 0,
      hasRect: rect !== null,
      text: d.text,
      asText: d.asText,
      clearing: d.clearing,
      isAnchor: c.row === p.plan.anchor[0] && c.col === p.plan.anchor[1],
    }
  })
})

const previewBarText = computed(() => {
  const p = preview.value
  if (!p) return ''
  let t = `将填入 ${p.plan.size.h} 行 × ${p.plan.size.w} 列，共 ${p.plan.cells.length} 格`
  if (p.emptyCount > 0) t += `；其中 ${p.emptyCount} 格为空，确认后会清空`
  for (const notice of p.plan.notices) t += `；${notice.message}`
  return t
})
</script>

<template>
  <div>
    <!-- 预览期间全屏守卫：点击任意处 = 取消；合并/对齐/强调/拖区块/导出均被其挡住（交互 §1.2） -->
    <div
      v-if="preview"
      class="paste-guard"
      data-testid="paste-guard"
      @click="editor.cancelPaste()"
    />

    <!-- 落位高亮覆盖层（壳叠加层，不刷核） -->
    <div
      v-for="cell in previewCells"
      v-show="cell.hasRect"
      :key="cell.key"
      class="paste-cell"
      :class="{ clearing: cell.clearing, 'as-text': cell.asText, anchor: cell.isAnchor }"
      :style="{
        left: cell.left + 'px',
        top: cell.top + 'px',
        width: cell.width + 'px',
        height: cell.height + 'px',
      }"
    >
      <span v-if="cell.asText" class="as-text-badge">按文字</span>
      <i>{{ cell.text }}</i>
    </div>

    <!-- 预览条（表格上方贴边）：确认 Enter / 取消 Esc -->
    <div v-if="preview" class="paste-bar" data-testid="paste-bar" @click.stop>
      <span data-testid="paste-bar-text">{{ previewBarText }}</span>
      <PtButton data-testid="paste-confirm" @click="editor.confirmPaste()">确认写入</PtButton>
      <PtButton variant="ghost" data-testid="paste-cancel" @click="editor.cancelPaste()">
        取消
      </PtButton>
    </div>
  </div>
</template>

<style scoped>
.paste-guard {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: transparent;
  cursor: default;
}
.paste-cell {
  position: absolute;
  z-index: 30;
  box-sizing: border-box;
  border: 1px dashed var(--pt-primary);
  background: var(--pt-tag);
  opacity: 0.85;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0 6px;
  overflow: hidden;
  font-size: 12px;
  pointer-events: none;
}
.paste-cell.anchor {
  border: 2px solid var(--pt-primary);
  font-weight: 700;
}
.paste-cell i {
  font-style: italic;
  color: #6b7280;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.paste-cell.clearing i {
  font-style: normal;
}
.paste-cell.as-text {
  border-style: solid;
}
.as-text-badge {
  flex-shrink: 0;
  font-size: 10px;
  color: #6b7280;
  border: 1px solid var(--pt-border);
  border-radius: 4px;
  padding: 0 3px;
  background: #fff;
}
.paste-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  background: var(--pt-tag);
  color: var(--pt-tag-text);
  font-size: 13px;
  border-bottom: 1px solid var(--pt-border);
}
</style>
