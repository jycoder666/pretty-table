<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '../stores/editor'
import { isEmphasizable, PALETTES, type ThemeId, type Emphasis } from '@/core'
import PtButton from '../ui/PtButton.vue'

const editor = useEditorStore()

const themes: ThemeId[] = ['T-A', 'T-B', 'T-C']
const themeSwatch = (id: ThemeId) => PALETTES[id].primary

const slotText = computed({
  get() {
    if (!editor.selectedSlotId || !editor.current) return ''
    const v = editor.current.slots[editor.selectedSlotId]
    if (v && typeof v === 'object' && 'text' in v) return String(v.text ?? '')
    return v === undefined || v === null ? '' : String(v)
  },
  set(v: string) {
    if (editor.selectedSlotId) editor.setSlotText(editor.selectedSlotId, v)
  },
})

const blockText = computed({
  get() {
    if (!editor.selectedBlockId || !editor.current) return ''
    const b = editor.current.blocks.find((x) => x.id === editor.selectedBlockId)
    if (!b) return ''
    return String(b.props?.text ?? b.props?.label ?? '')
  },
  set(v: string) {
    editor.updateBlockText(v)
  },
})

const canEmphasize = computed(() => {
  if (!editor.current || !editor.selectedSlotId) return false
  return isEmphasizable(editor.current, editor.selectedSlotId)
})

function toggleEm(kind: Emphasis) {
  if (!editor.selectedSlotId || !editor.current) return
  const v = editor.current.slots[editor.selectedSlotId]
  const cur =
    v && typeof v === 'object' && 'emphasize' in v
      ? Array.isArray(v.emphasize)
        ? [...v.emphasize]
        : v.emphasize
          ? [v.emphasize]
          : []
      : []
  const next = cur.includes(kind) ? cur.filter((x) => x !== kind) : [...cur, kind]
  editor.setEmphasis(next as Emphasis[])
}

function removeBlock() {
  if (!confirm('删除后预览会同步更新，确定删除此区块？')) return
  editor.removeSelectedBlock()
}
</script>

<template>
  <aside class="props">
    <h3>属性</h3>
    <p class="lead">一键换表头、分区与强调色</p>

    <div class="section">
      <h4>主题</h4>
      <div class="themes">
        <button
          v-for="id in themes"
          :key="id"
          type="button"
          class="theme-btn"
          :class="{ on: editor.current?.themeId === id }"
          :style="{ '--swatch': themeSwatch(id) }"
          @click="editor.setTheme(id)"
        >
          <i />
          {{ editor.themeLabel(id) }}
        </button>
      </div>
      <label class="zebra">
        <input
          type="checkbox"
          :checked="editor.current?.zebraOn !== false"
          @change="editor.setZebra(($event.target as HTMLInputElement).checked)"
        />
        斑马纹
      </label>
    </div>

    <div v-if="editor.selectedSlotId" class="section">
      <h4>槽位文案</h4>
      <p class="mono">{{ editor.selectedSlotId }}</p>
      <textarea v-model="slotText" rows="3" />
      <div class="row">
        <PtButton variant="ghost" @click="editor.setAlign('left')">左</PtButton>
        <PtButton variant="ghost" @click="editor.setAlign('center')">中</PtButton>
        <PtButton variant="ghost" @click="editor.setAlign('right')">右</PtButton>
      </div>
      <div class="row">
        <PtButton variant="ghost" :disabled="!canEmphasize" @click="toggleEm('red')">红字</PtButton>
        <PtButton variant="ghost" :disabled="!canEmphasize" @click="toggleEm('bold')">加粗</PtButton>
        <PtButton variant="ghost" :disabled="!canEmphasize" @click="toggleEm('bg')">底色</PtButton>
      </div>
      <p v-if="!canEmphasize" class="hint">此处由模板固定，不能强调</p>
    </div>

    <div v-if="editor.selectedBlockId" class="section">
      <h4>区块</h4>
      <textarea v-model="blockText" rows="2" />
      <PtButton variant="danger" @click="removeBlock">删除区块</PtButton>
    </div>

    <div class="section">
      <h4>合并 / 拆分</h4>
      <p class="hint">仅在模板允许区内操作；锁定合并不可拆。</p>
      <div class="row">
        <PtButton variant="ghost" @click="editor.mergeSelection()">合并选区</PtButton>
        <PtButton variant="ghost" @click="editor.splitSelection()">拆分</PtButton>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.props {
  width: 260px;
  flex-shrink: 0;
  border-left: 1px solid var(--pt-border);
  padding: 12px;
  background: #fff;
  overflow: auto;
}
h3 {
  margin: 0;
  font-size: 14px;
}
.lead {
  font-size: 12px;
  color: #6b7280;
  margin: 4px 0 12px;
}
.section {
  margin-bottom: 16px;
}
h4 {
  margin: 0 0 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
}
.themes {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.theme-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--pt-border);
  background: #fff;
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  font-size: 13px;
}
.theme-btn.on {
  border-color: var(--pt-primary);
  background: var(--pt-tag);
}
.theme-btn i {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  background: var(--swatch);
}
.zebra {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 8px;
  font-size: 13px;
}
textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--pt-border);
  border-radius: 8px;
  padding: 8px;
  font: inherit;
  resize: vertical;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.mono {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  color: #6b7280;
}
.hint {
  font-size: 12px;
  color: #6b7280;
}
</style>
