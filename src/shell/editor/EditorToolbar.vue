<script setup lang="ts">
import { ref } from 'vue'
import { useEditorStore } from '../stores/editor'
import PtButton from '../ui/PtButton.vue'

/** 工具条「粘贴表格内容」按钮（交互 §1.1 / S11）：clipboard.readText 被拒时弹手动粘贴框 */
const editor = useEditorStore()
const manualOpen = ref(false)

async function onToolbarPaste() {
  try {
    const text = await navigator.clipboard.readText()
    if (text && text.trim() !== '') {
      editor.pasteStart({ text })
      return
    }
    manualOpen.value = true
  } catch {
    // 浏览器拒绝读剪贴板（S11）→ 弹「在这里粘贴（Ctrl+V）」小框，仍走 paste 事件
    manualOpen.value = true
  }
}

function onManualPaste(e: ClipboardEvent) {
  const text = e.clipboardData?.getData('text/plain') ?? ''
  e.preventDefault()
  manualOpen.value = false
  if (text.trim() !== '') editor.pasteStart({ text })
}

function onManualClose() {
  manualOpen.value = false
}
</script>

<template>
  <div class="paste-toolbar" @click.stop>
    <PtButton
      variant="ghost"
      :disabled="!editor.selectedSlotId || editor.pastePending"
      :title="editor.selectedSlotId ? '以选中格为起点，粘贴一块表格内容' : '先点一个格子作为起点'"
      data-testid="paste-toolbar-btn"
      @click="onToolbarPaste"
    >
      粘贴表格内容
    </PtButton>

    <!-- S11 手动粘贴小框 -->
    <div v-if="manualOpen" class="manual-box" data-testid="paste-manual-box">
      <p class="manual-title">在这里粘贴（Ctrl+V）</p>
      <textarea
        data-testid="paste-manual-input"
        rows="3"
        @paste="onManualPaste"
      />
      <PtButton variant="ghost" data-testid="paste-manual-close" @click="onManualClose">
        关闭
      </PtButton>
    </div>
  </div>
</template>

<style scoped>
/* PX-09：不再悬浮在预览区上（已并入顶部工具条），改为顶栏内联排布 */
.paste-toolbar {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}
.manual-box {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--pt-border);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 6px 18px rgb(0 0 0 / 12%);
  width: 260px;
}
.manual-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}
.manual-box textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--pt-border);
  border-radius: 8px;
  padding: 8px;
  font: inherit;
  resize: vertical;
}
</style>
