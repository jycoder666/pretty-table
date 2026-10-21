<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '../stores/editor'
import {
  isEmphasizable,
  PALETTES,
  MARK_GLYPH,
  MARK_LABEL,
  RECOMMEND_BADGE_TEXT,
  ROLE_KEYS,
  ROLE_LABELS,
  isRoleOverridden,
  roleColorOf,
  canAddRow,
  canAddCol,
  clampColWidth,
  colWidthAt,
  hasContentInRow,
  hasContentInCol,
  type RoleColorKey,
  type StructuralIntent,
  type ThemeId,
  type Emphasis,
  type MarkValue,
  type SlotValue,
} from '@/core'
import PtButton from '../ui/PtButton.vue'
import PtSegmented from '../ui/PtSegmented.vue'
import ColorField from './ColorField.vue'

const editor = useEditorStore()

const themes: ThemeId[] = ['T-A', 'T-B', 'T-C']
const themeSwatch = (id: ThemeId) => PALETTES[id].primary

// ── 颜色自定义（FR-C1）：六角色，提交走 setThemeToken / resetThemeTokens ──
const colorRoles: { key: RoleColorKey; label: string }[] = ROLE_KEYS.map((key) => ({
  key,
  label: ROLE_LABELS[key],
}))

function commitColor(role: RoleColorKey, hex: string | null) {
  editor.apply({ kind: 'setThemeToken', token: role, value: hex })
}

function onInvalidColor() {
  editor.showToast('颜色格式不对，请填 6 位十六进制，例如 #1f7a8c')
}

function resetColors() {
  editor.apply({ kind: 'resetThemeTokens' })
}

// ── 格式微调（FR-C2）：行高/字号/内边距三档 + 逐列列宽 ──
const tierOptions = (a: string, b: string, c: string) => [
  { value: 1, label: a },
  { value: 2, label: b },
  { value: 3, label: c },
]

const rowTierOptions = tierOptions('紧凑', '标准', '宽松')
const fontTierOptions = tierOptions('小', '标准', '大')
const padTierOptions = tierOptions('紧', '标准', '松')

const rowTier = computed(() => editor.current?.layout.style?.rowHeightTier ?? 2)
const fontTier = computed(() => editor.current?.layout.style?.fontSizeTier ?? 2)
const padTier = computed(() => editor.current?.layout.style?.paddingTier ?? 2)

const colWidthInputs = computed(() => {
  const n = editor.current?.layout.colCount ?? 0
  return Array.from({ length: n }, (_, c) => ({
    col: c,
    width: editor.current ? colWidthAt(editor.current, c) : 140,
  }))
})

function commitColWidth(col: number, raw: string) {
  const t = raw.trim()
  if (t === '') {
    // 留空 = 该列回默认宽（colWidths 置 null）
    editor.apply({ kind: 'setColWidth', col, width: null })
    return
  }
  const n = Number(t)
  if (!Number.isFinite(n)) {
    editor.showToast('列宽请填数字（64～360），留空恢复默认')
    return
  }
  editor.apply({ kind: 'setColWidth', col, width: clampColWidth(n) })
}

// ── 结构编辑（FR-C3）：行列增删 + 表头层级 ──
const rowCount = computed(() => editor.current?.layout.slotGrid?.length ?? 0)
const colCount = computed(() => editor.current?.layout.colCount ?? 0)
const headerLevels = computed(() => editor.current?.layout.headerLevels ?? 1)
const canAddRowNow = computed(() => (editor.current ? canAddRow(editor.current) : false))
const canAddColNow = computed(() => (editor.current ? canAddCol(editor.current) : false))

/** 删行/删列目标：选中格所在行/列；未选中时删最后一行/列 */
const targetRow = computed(() => {
  const sel = editor.selectionRange
  return sel ? Math.min(sel.start[0], rowCount.value - 1) : rowCount.value - 1
})
const targetCol = computed(() => {
  const sel = editor.selectionRange
  return sel ? Math.min(sel.start[1], colCount.value - 1) : colCount.value - 1
})

/** 结构变化后原选区/选中槽可能已被 remap，清空防悬挂引用 */
function applyStruct(intent: StructuralIntent): boolean {
  const okApplied = editor.apply(intent)
  if (okApplied) {
    editor.selectionRange = null
    editor.selectedSlotId = null
    editor.selectedBlockId = null
  }
  return okApplied
}

function addRow() {
  if (canAddRowNow.value) applyStruct({ kind: 'addRow' })
}

function removeRow() {
  const r = targetRow.value
  if (r < headerLevels.value || r >= rowCount.value) return
  // Q-9：删非空行列先二次确认（连带删除，不可恢复）
  if (
    hasContentInRow(editor.current!, r) &&
    !confirm(`删除第 ${r + 1} 行后，这一行的内容会一起删掉，不可恢复。确定删除？`)
  ) {
    return
  }
  applyStruct({ kind: 'removeRow', row: r })
}

function addCol() {
  if (canAddColNow.value) applyStruct({ kind: 'addCol' })
}

function removeCol() {
  const c = targetCol.value
  if (c < 0 || c >= colCount.value) return
  if (
    hasContentInCol(editor.current!, c) &&
    !confirm(`删除第 ${c + 1} 列后，这一列的内容会一起删掉，不可恢复。确定删除？`)
  ) {
    return
  }
  applyStruct({ kind: 'removeCol', col: c })
}

function setHeaderLevels(v: number) {
  applyStruct({ kind: 'setHeaderLevel', levels: v as 1 | 2 | 3 })
}

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

    <!-- 颜色自定义（FR-C1）：改的是当前主题的角色色，随改随生效 -->
    <div class="section">
      <h4>颜色</h4>
      <ColorField
        v-for="r in colorRoles"
        :key="r.key"
        :role="r.key"
        :label="r.label"
        :value="roleColorOf(editor.current, r.key).toLowerCase()"
        :overridden="isRoleOverridden(editor.current, r.key)"
        :disabled="editor.pastePending"
        @commit="(hex) => commitColor(r.key, hex)"
        @invalid="onInvalidColor"
      />
      <PtButton variant="ghost" :disabled="editor.pastePending" @click="resetColors">
        全部恢复预设
      </PtButton>
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

    <!-- 格式微调（FR-C2）：全局档位 + 逐列列宽，超界由核内收口 -->
    <div class="section">
      <h4>格式微调</h4>
      <div class="field">
        <span>行高</span>
        <PtSegmented
          :options="rowTierOptions"
          :model-value="rowTier"
          :disabled="editor.pastePending"
          @update:model-value="(v) => editor.apply({ kind: 'setRowHeightTier', tier: v as 1 | 2 | 3 })"
        />
      </div>
      <div class="field">
        <span>字号</span>
        <PtSegmented
          :options="fontTierOptions"
          :model-value="fontTier"
          :disabled="editor.pastePending"
          @update:model-value="(v) => editor.apply({ kind: 'setFontSizeTier', tier: v as 1 | 2 | 3 })"
        />
      </div>
      <div class="field">
        <span>内边距</span>
        <PtSegmented
          :options="padTierOptions"
          :model-value="padTier"
          :disabled="editor.pastePending"
          @update:model-value="(v) => editor.apply({ kind: 'setPaddingTier', tier: v as 1 | 2 | 3 })"
        />
      </div>
      <div class="colwidths">
        <label v-for="item in colWidthInputs" :key="item.col" class="cw">
          第{{ item.col + 1 }}列
          <input
            type="number"
            min="64"
            max="360"
            :value="item.width"
            :disabled="editor.pastePending"
            :aria-label="`第${item.col + 1}列宽`"
            @change="commitColWidth(item.col, ($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>
      <p class="hint">列宽范围 64～360，留空恢复默认。</p>
    </div>

    <!-- 结构编辑（FR-C3）：行列增删 / 表头层级；达上限置灰，删非空先确认 -->
    <div class="section">
      <h4>结构</h4>
      <p class="hint">删行/删列删的是选中格所在的行列；未选中时删最后一行/列。</p>
      <div class="row">
        <PtButton
          variant="ghost"
          :disabled="!canAddRowNow || editor.pastePending"
          title="在表格末尾加一行"
          @click="addRow"
        >
          加一行
        </PtButton>
        <PtButton
          variant="ghost"
          :disabled="editor.pastePending"
          :title="`删除第 ${targetRow + 1} 行`"
          @click="removeRow"
        >
          删行
        </PtButton>
      </div>
      <div class="row">
        <PtButton
          variant="ghost"
          :disabled="!canAddColNow || editor.pastePending"
          title="在表格末尾加一列"
          @click="addCol"
        >
          加一列
        </PtButton>
        <PtButton
          variant="ghost"
          :disabled="editor.pastePending"
          :title="`删除第 ${targetCol + 1} 列`"
          @click="removeCol"
        >
          删列
        </PtButton>
      </div>
      <div class="field">
        <span>表头层数</span>
        <PtSegmented
          :options="[
            { value: 1, label: '1 层' },
            { value: 2, label: '2 层' },
            { value: 3, label: '3 层' },
          ]"
          :model-value="headerLevels"
          :disabled="editor.pastePending"
          @update:model-value="setHeaderLevels"
        />
      </div>
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
.field {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.field > span {
  font-size: 12px;
  color: var(--pt-muted);
  width: 56px;
  flex-shrink: 0;
}
.colwidths {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.cw {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--pt-muted);
}
.cw input {
  width: 60px;
  border: 1px solid var(--pt-border);
  border-radius: 6px;
  padding: 3px 6px;
  font: inherit;
  font-size: 12px;
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
