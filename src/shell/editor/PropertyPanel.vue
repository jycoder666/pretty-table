<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '../stores/editor'
import {
  isEmphasizable,
  PALETTES,
  MARK_GLYPH,
  MARK_LABEL,
  RECOMMEND_BADGE_TEXT,
  type ThemeId,
  type Emphasis,
  type MarkValue,
  type SlotValue,
} from '@/core'
import PtButton from '../ui/PtButton.vue'

const editor = useEditorStore()

const themes: ThemeId[] = ['T-A', 'T-B', 'T-C']
const themeSwatch = (id: ThemeId) => PALETTES[id].primary

const marks: Record<MarkValue, string> = { ...MARK_LABEL }
const glyphs: Record<MarkValue, string> = { ...MARK_GLYPH }

function slotDisplay(v: SlotValue | undefined): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'object') {
    if ('mark' in v) return v.mark ? MARK_LABEL[v.mark] : ''
    if ('num' in v) return v.num === null || v.num === undefined ? '' : String(v.num)
    return String(v.text ?? '')
  }
  return String(v)
}

const slotText = computed({
  get() {
    if (!editor.selectedSlotId || !editor.current) return ''
    return slotDisplay(editor.current.slots[editor.selectedSlotId])
  },
  set(v: string) {
    if (editor.selectedSlotId) editor.setSlotText(editor.selectedSlotId, v)
  },
})

/** 选中槽的声明类型（schema 1.1）；缺省按 text */
const slotKind = computed<'text' | 'number' | 'mark'>(() => {
  const sid = editor.selectedSlotId
  if (!editor.current || !sid) return 'text'
  return editor.current.slotDefs?.[sid]?.kind ?? 'text'
})

const markValue = computed<MarkValue | null>(() => {
  const sid = editor.selectedSlotId
  const v = sid && editor.current ? editor.current.slots[sid] : undefined
  return v && typeof v === 'object' && 'mark' in v ? v.mark : null
})

/** 三选一：再点当前项即取消（存 null，显示为空槽） */
function setMark(m: MarkValue | null) {
  if (!editor.selectedSlotId) return
  editor.apply({ kind: 'setSlot', slotId: editor.selectedSlotId, value: { mark: m } })
}

const numText = computed({
  get() {
    const sid = editor.selectedSlotId
    const v = sid && editor.current ? editor.current.slots[sid] : undefined
    const n = v && typeof v === 'object' && 'num' in v ? v.num : null
    return n === null || n === undefined ? '' : String(n)
  },
  set(v: string) {
    if (!editor.selectedSlotId) return
    const t = v.trim()
    const n = t === '' ? null : Number(t)
    editor.apply({
      kind: 'setSlot',
      slotId: editor.selectedSlotId,
      value: { num: n !== null && Number.isFinite(n) ? n : null },
    })
  },
})

// ── 推荐列（FR-23）：最多一列，再点取消；无自定义符号/颜色入口 ──
const recommendableCols = computed<number[]>(() => editor.current?.layout.recommendableCols ?? [])
const recommendCol = computed<number | null>(() => editor.current?.highlight?.recommendCol ?? null)

const colLabels = computed<Record<number, string>>(() => {
  const inst = editor.current
  const out: Record<number, string> = {}
  if (!inst) return out
  const headerRow = (inst.layout.headerLevels ?? 1) - 1
  for (const c of recommendableCols.value) {
    const sid = inst.layout.slotGrid?.[headerRow]?.[c]
    out[c] = (sid && slotDisplay(inst.slots[sid])) || `第 ${c + 1} 列`
  }
  return out
})

function toggleRecommend(col: number) {
  editor.apply({ kind: 'setRecommendCol', col: recommendCol.value === col ? null : col })
}

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
      <!-- 三态符号槽：只有三选一，无自定义符号/颜色入口（OUT-13 / TC-PT-075） -->
      <template v-if="slotKind === 'mark'">
        <div class="row" role="radiogroup" aria-label="支持状态">
          <PtButton
            v-for="(label, k) in marks"
            :key="k"
            variant="ghost"
            :class="{ on: markValue === k }"
            :aria-pressed="markValue === k"
            :disabled="editor.pastePending"
            @click="setMark(markValue === k ? null : (k as MarkValue))"
          >
            {{ glyphs[k as MarkValue] }} {{ label }}
          </PtButton>
        </div>
        <p class="hint">符号与颜色随主题，不支持自定义。</p>
      </template>
      <!-- 数值槽：只能改数字，格式由模板决定 -->
      <template v-else-if="slotKind === 'number'">
        <input
          class="num"
          :value="numText"
          type="text"
          inputmode="decimal"
          placeholder="填写数字"
          @change="numText = ($event.target as HTMLInputElement).value"
        />
      </template>
      <template v-else>
        <textarea v-model="slotText" rows="3" @blur="editor.endTextSession()" />
      </template>
      <div class="row">
        <PtButton variant="ghost" :disabled="editor.pastePending" @click="editor.setAlign('left')">左</PtButton>
        <PtButton variant="ghost" :disabled="editor.pastePending" @click="editor.setAlign('center')">中</PtButton>
        <PtButton variant="ghost" :disabled="editor.pastePending" @click="editor.setAlign('right')">右</PtButton>
      </div>
      <div class="row">
        <PtButton variant="ghost" :disabled="!canEmphasize || editor.pastePending" @click="toggleEm('red')">红字</PtButton>
        <PtButton variant="ghost" :disabled="!canEmphasize || editor.pastePending" @click="toggleEm('bold')">加粗</PtButton>
        <PtButton variant="ghost" :disabled="!canEmphasize || editor.pastePending" @click="toggleEm('bg')">底色</PtButton>
      </div>
      <p v-if="!canEmphasize" class="hint">此处由模板固定，不能强调</p>
    </div>

    <!-- 推荐列开关：只有选列/取消，最多一列（FR-23） -->
    <div v-if="recommendableCols.length" class="section">
      <h4>推荐列</h4>
      <p class="hint">最多标一列；再点一次取消推荐。</p>
      <div class="row">
        <PtButton
          v-for="c in recommendableCols"
          :key="c"
          variant="ghost"
          :class="{ on: recommendCol === c }"
          :disabled="editor.pastePending"
          @click="toggleRecommend(c)"
        >
          {{ colLabels[c] }}<template v-if="recommendCol === c">（{{ RECOMMEND_BADGE_TEXT }}）</template>
        </PtButton>
      </div>
    </div>

    <div v-if="editor.selectedBlockId" class="section">
      <h4>区块</h4>
      <textarea v-model="blockText" rows="2" @blur="editor.endTextSession()" />
      <PtButton variant="danger" :disabled="editor.pastePending" @click="removeBlock">删除区块</PtButton>
    </div>

    <div class="section">
      <h4>合并 / 拆分</h4>
      <p class="hint">仅在模板允许区内操作；锁定合并不可拆。</p>
      <div class="row">
        <PtButton variant="ghost" :disabled="editor.pastePending" @click="editor.mergeSelection()">合并选区</PtButton>
        <PtButton variant="ghost" :disabled="editor.pastePending" @click="editor.splitSelection()">拆分</PtButton>
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
.row :deep(.on),
.on {
  border-color: var(--pt-primary);
  background: var(--pt-tag);
}
.num {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--pt-border);
  border-radius: 8px;
  padding: 8px;
  font: inherit;
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
