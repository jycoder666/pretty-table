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
  canMerge,
  canSplit,
  canSetImage,
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
import PtTooltip from '../ui/PtTooltip.vue'
import PtSegmented from '../ui/PtSegmented.vue'
import ConfirmDialog from '../ui/ConfirmDialog.vue'
import { confirmAction } from '../ui/confirm'
import { panelGroupOpen, togglePanelGroup } from './panelGroups'
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

async function removeRow() {
  const r = targetRow.value
  if (r < headerLevels.value || r >= rowCount.value) return
  // Q-9：删非空行列先二次确认（连带删除，不可恢复）；PX-05：走统一确认弹窗
  if (hasContentInRow(editor.current!, r)) {
    const go = await confirmAction({
      title: `删除第 ${r + 1} 行`,
      message: `删除第 ${r + 1} 行后，这一行的内容会一起删掉，不可恢复。确定删除？`,
      confirmText: '删除',
      danger: true,
    })
    if (!go) return
  }
  applyStruct({ kind: 'removeRow', row: r })
}

function addCol() {
  if (canAddColNow.value) applyStruct({ kind: 'addCol' })
}

async function removeCol() {
  const c = targetCol.value
  if (c < 0 || c >= colCount.value) return
  if (hasContentInCol(editor.current!, c)) {
    const go = await confirmAction({
      title: `删除第 ${c + 1} 列`,
      message: `删除第 ${c + 1} 列后，这一列的内容会一起删掉，不可恢复。确定删除？`,
      confirmText: '删除',
      danger: true,
    })
    if (!go) return
  }
  applyStruct({ kind: 'removeCol', col: c })
}

function setHeaderLevels(v: number) {
  applyStruct({ kind: 'setHeaderLevel', levels: v as 1 | 2 | 3 })
}

// ── PX-08：合并 / 拆分按钮随选区实时置灰（核内 mergeGuard 同源判定） ──
interface MergeGate {
  ok: boolean
  /** 不可用时的一句白话原因（挂按钮 title） */
  reason: string
}

const mergeGate = computed<MergeGate>(() => {
  const inst = editor.current
  if (!inst || editor.pastePending) {
    return { ok: false, reason: editor.pastePending ? '粘贴预览期间不可操作' : '先打开一张表格' }
  }
  if (!editor.selectionRange) {
    return { ok: false, reason: '先在预览里选中格子：点起点格后按住 Shift 点终点格，选一块矩形区域' }
  }
  const r = canMerge(inst.layout, editor.selectionRange)
  return r.ok ? { ok: true, reason: '' } : { ok: false, reason: r.error.message }
})

const splitGate = computed<MergeGate>(() => {
  const inst = editor.current
  if (!inst || editor.pastePending) {
    return { ok: false, reason: editor.pastePending ? '粘贴预览期间不可操作' : '先打开一张表格' }
  }
  if (!editor.selectionRange) {
    return { ok: false, reason: '先在预览里选中一个已合并的格子再拆分' }
  }
  const r = canSplit(inst.layout, editor.selectionRange)
  return r.ok ? { ok: true, reason: '' } : { ok: false, reason: r.error.message }
})

const marks: Record<MarkValue, string> = { ...MARK_LABEL }
const glyphs: Record<MarkValue, string> = { ...MARK_GLYPH }

function slotDisplay(v: SlotValue | undefined): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'object') {
    if ('mark' in v) return v.mark ? MARK_LABEL[v.mark] : ''
    if ('num' in v) return v.num === null || v.num === undefined ? '' : String(v.num)
    if ('image' in v) return ''
    return String(v.text ?? '')
  }
  return String(v)
}

// ── R-3 图片区（交互升级 T04）：可设图的 text 槽显示上传/替换/移除 ──

/** 选中槽当前是否已设图 */
const selectedImage = computed<string | null>(() => {
  const sid = editor.selectedSlotId
  const v = sid && editor.current ? editor.current.slots[sid] : undefined
  return v && typeof v === 'object' && 'image' in v ? v.image : null
})

/** 图片能力闸（核内 canSetImage 同源）：存在于 slotGrid、非 readonly、非 locked、kind text/缺省 */
const canImage = computed(() => {
  const inst = editor.current
  const sid = editor.selectedSlotId
  if (!inst || !sid || editor.pastePending) return false
  return canSetImage(inst, sid).ok
})

function onImageFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // 清空以便同一文件可重复选择
  const sid = editor.selectedSlotId
  if (!file || !sid) return
  void editor.uploadImage(sid, file)
}

// ── PX-07：标题改人话——内容摘要 / 行列位置，禁止露出内部 ID（u 序号 / r2c3） ──
const SUMMARY_LIMIT = 8

/** 内容摘要：前 8 字，超出截断加 … */
function summarizeText(s: string): string {
  if (!s) return ''
  const chars = [...s]
  return chars.length > SUMMARY_LIMIT ? chars.slice(0, SUMMARY_LIMIT).join('') + '…' : s
}

/** 槽位在 slotGrid 里的位置（0 基行列）；找不到返回 null */
function slotPosOf(slotId: string): [number, number] | null {
  const grid = editor.current?.layout.slotGrid
  if (!grid) return null
  for (let r = 0; r < grid.length; r++) {
    const c = grid[r]?.indexOf(slotId) ?? -1
    if (c >= 0) return [r, c]
  }
  return null
}

const slotHeadline = computed<string>(() => {
  const sid = editor.selectedSlotId
  if (!sid || !editor.current) return ''
  // R-3：图片槽 headline 显示「图片」（PX-07 人话，不露 data URL）
  const v = editor.current.slots[sid]
  if (v && typeof v === 'object' && 'image' in v) return '图片'
  const summary = summarizeText(slotDisplay(v))
  if (summary) return `当前内容：${summary}`
  const pos = slotPosOf(sid)
  return pos ? `第 ${pos[0] + 1} 行 · 第 ${pos[1] + 1} 列` : ''
})

const blockHeadline = computed<string>(() => {
  const bid = editor.selectedBlockId
  if (!bid || !editor.current) return ''
  const b = editor.current.blocks.find((x) => x.id === bid)
  const text = summarizeText(String(b?.props?.label ?? b?.props?.text ?? ''))
  if (text) return `当前内容：${text}`
  // 空区块 → 人话位置：优先查 slotGrid，再退回区块槽 rowHint（QA Low 修复：
  // after-N 的 N 是 0 基锚点行，区块行插在该行之后 → 1 基展示为第 N+2 行，
  // 与 core/adapter/toOption.ts buildVisualRows 的可视行插入位置同源）
  const pos = b ? slotPosOf(b.slotId) : null
  if (pos) return `区块 · 第 ${pos[0] + 1} 行`
  const hint = editor.current.layout.blockSlots.find((s) => s.id === b?.slotId)?.rowHint
  const m = typeof hint === 'string' ? /^after-(\d+)$/.exec(hint) : null
  return m ? `区块 · 第 ${Number(m[1]) + 2} 行` : '区块'
})

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

// ── R-4 区块样式档位（QA Bug #2 收尾）：leftTag 深浅 2 档 / emphFooter 字号 2 档 ──
// 档位语义与渲染单点对齐：toOption.styleForCell（1=tag 深底或常规字号，2=zebra 浅底或 +2px），
// 导出 model.ts emphFooterStyle 消费同一档位；写入走既有 updateBlock 意图（一意图一张撤销快照）。
const selectedBlock = computed(() => {
  const bid = editor.selectedBlockId
  return bid && editor.current ? (editor.current.blocks.find((x) => x.id === bid) ?? null) : null
})

const blockTierVisible = computed(() => {
  const b = selectedBlock.value
  return b !== null && (b.type === 'leftTag' || b.type === 'emphFooter')
})

const blockTierOptions = computed<{ value: number; label: string }[]>(() => {
  const b = selectedBlock.value
  if (!b) return []
  return b.type === 'leftTag'
    ? [
        { value: 1, label: '深色底' },
        { value: 2, label: '浅色底' },
      ]
    : [
        { value: 1, label: '常规' },
        { value: 2, label: '略大' },
      ]
})

const blockTier = computed(() => (selectedBlock.value?.props?.styleTier === 2 ? 2 : 1))

function setBlockTier(v: number) {
  const b = selectedBlock.value
  if (!b || v === blockTier.value) return
  editor.apply({ kind: 'updateBlock', blockId: b.id, props: { styleTier: v as 1 | 2 } })
}

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

async function removeBlock() {
  const go = await confirmAction({
    title: '删除区块',
    message: '删除后预览会同步更新，确定删除此区块？',
    confirmText: '删除',
    danger: true,
  })
  if (!go) return
  editor.removeSelectedBlock()
}
</script>

<template>
  <aside class="props">
    <h3>属性</h3>
    <p class="lead">一键换表头、分区与强调色</p>

    <!-- ── 内容组（PX-16，默认展开）：改的是格子里有什么 ── -->
    <section class="group" data-testid="group-content">
      <button
        type="button"
        class="group-head"
        data-testid="group-head-content"
        :aria-expanded="panelGroupOpen.content"
        @click="togglePanelGroup('content')"
      >
        <i class="arrow" aria-hidden="true">{{ panelGroupOpen.content ? '▼' : '▶' }}</i>内容
      </button>
      <div v-show="panelGroupOpen.content" class="group-body">
        <div v-if="editor.selectedSlotId" class="section">
          <h4>槽位文案</h4>
          <!-- PX-07：人话标题（内容摘要 / 行列位置），不露内部 ID -->
          <p class="headline" data-testid="slot-headline">{{ slotHeadline }}</p>
          <!-- R-3 图片区：可设图的 text 槽（含已设图）显示上传/替换/移除 -->
          <div v-if="canImage || selectedImage" class="image-area" data-testid="image-area">
            <template v-if="selectedImage">
              <img class="thumb" :src="selectedImage" alt="已设置的图片" data-testid="image-thumb" />
              <div class="row">
                <PtTooltip text="换一张图片放进这个格子">
                  <label class="file-btn">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      data-testid="image-file-replace"
                      @change="onImageFile"
                    />
                    替换图片
                  </label>
                </PtTooltip>
                <PtTooltip text="移除这张图片，格子恢复为文字格">
                  <PtButton
                    variant="ghost"
                    data-testid="image-remove"
                    :disabled="editor.pastePending"
                    @click="editor.removeImage(editor.selectedSlotId!)"
                  >
                    移除图片
                  </PtButton>
                </PtTooltip>
              </div>
            </template>
            <template v-else>
              <PtTooltip text="上传一张图片放进这个格子">
                <label class="file-btn">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    data-testid="image-file"
                    @change="onImageFile"
                  />
                  上传图片
                </label>
              </PtTooltip>
            </template>
            <p class="hint">PNG / JPG / WebP / GIF，单张 2MB 内；动图按第一帧显示。</p>
          </div>
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
            <textarea v-if="!selectedImage" v-model="slotText" rows="3" @blur="editor.endTextSession()" />
          </template>
          <div class="row">
            <PtButton variant="ghost" :disabled="editor.pastePending" @click="editor.setAlign('left')">左</PtButton>
            <PtButton variant="ghost" :disabled="editor.pastePending" @click="editor.setAlign('center')">中</PtButton>
            <PtButton variant="ghost" :disabled="editor.pastePending" @click="editor.setAlign('right')">右</PtButton>
          </div>
          <div class="row">
            <PtTooltip text="给选中格子加红字">
              <PtButton variant="ghost" :disabled="!canEmphasize || editor.pastePending" @click="toggleEm('red')">红字</PtButton>
            </PtTooltip>
            <PtTooltip text="加粗选中格子">
              <PtButton variant="ghost" :disabled="!canEmphasize || editor.pastePending" @click="toggleEm('bold')">加粗</PtButton>
            </PtTooltip>
            <PtTooltip text="给选中格子加底色">
              <PtButton variant="ghost" :disabled="!canEmphasize || editor.pastePending" @click="toggleEm('bg')">底色</PtButton>
            </PtTooltip>
          </div>
          <p v-if="!canEmphasize" class="hint">此处由模板固定，不能强调</p>
        </div>

        <div v-if="editor.selectedBlockId" class="section">
          <h4>区块</h4>
          <!-- PX-07：区块同理显示文字摘要或「区块 · 第 X 行」 -->
          <p class="headline" data-testid="block-headline">{{ blockHeadline }}</p>
          <textarea v-model="blockText" rows="2" @blur="editor.endTextSession()" />
          <!-- R-4 区块样式档位（QA Bug #2 收尾，T04 偏差③ tooltip 随之挂上）：
               leftTag 深浅 2 档 / emphFooter 字号 2 档；档位常量与渲染单点在 toOption.styleForCell -->
          <div v-if="blockTierVisible" class="field" data-testid="block-tier">
            <span>样式档位</span>
            <PtTooltip text="切换区块样式档位">
              <PtSegmented
                :options="blockTierOptions"
                :model-value="blockTier"
                :disabled="editor.pastePending"
                @update:model-value="setBlockTier"
              />
            </PtTooltip>
          </div>
        </div>
      </div>
    </section>

    <!-- ── 样式组（PX-16，默认收起）：改外观 ── -->
    <section class="group" data-testid="group-style">
      <button
        type="button"
        class="group-head"
        data-testid="group-head-style"
        :aria-expanded="panelGroupOpen.style"
        @click="togglePanelGroup('style')"
      >
        <i class="arrow" aria-hidden="true">{{ panelGroupOpen.style ? '▼' : '▶' }}</i>样式
      </button>
      <div v-show="panelGroupOpen.style" class="group-body">
        <div class="section">
          <h4>主题</h4>
          <div class="themes">
            <PtTooltip v-for="id in themes" :key="id" :text="`切换到${editor.themeLabel(id)}`">
              <button
                type="button"
                class="theme-btn"
                :class="{ on: editor.current?.themeId === id }"
                :style="{ '--swatch': themeSwatch(id) }"
                @click="editor.setTheme(id)"
              >
                <i />
                {{ editor.themeLabel(id) }}
              </button>
            </PtTooltip>
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
      </div>
    </section>

    <!-- ── 结构组（PX-16，默认收起）：动结构 ── -->
    <section class="group" data-testid="group-structure">
      <button
        type="button"
        class="group-head"
        data-testid="group-head-structure"
        :aria-expanded="panelGroupOpen.structure"
        @click="togglePanelGroup('structure')"
      >
        <i class="arrow" aria-hidden="true">{{ panelGroupOpen.structure ? '▼' : '▶' }}</i>结构
      </button>
      <div v-show="panelGroupOpen.structure" class="group-body">
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
            <PtTooltip :text="mergeGate.reason || '合并当前选区的格子'">
              <PtButton
                variant="ghost"
                :disabled="!mergeGate.ok"
                data-testid="merge-btn"
                @click="editor.mergeSelection()"
              >
                合并选区
              </PtButton>
            </PtTooltip>
            <PtTooltip :text="splitGate.reason || '拆分当前选中的合并区'">
              <PtButton
                variant="ghost"
                :disabled="!splitGate.ok"
                data-testid="split-btn"
                @click="editor.splitSelection()"
              >
                拆分
              </PtButton>
            </PtTooltip>
          </div>
        </div>

        <!-- 推荐列开关：只有选列/取消，最多一列（FR-23） -->
        <div v-if="recommendableCols.length" class="section">
          <h4>推荐列</h4>
          <p class="hint">最多标一列；再点一次取消推荐。</p>
          <div class="row">
            <PtTooltip
              v-for="c in recommendableCols"
              :key="c"
              text="把这一列标记为推荐列，再点一次取消"
            >
              <PtButton
                variant="ghost"
                :class="{ on: recommendCol === c }"
                :disabled="editor.pastePending"
                @click="toggleRecommend(c)"
              >
                {{ colLabels[c] }}<template v-if="recommendCol === c">（{{ RECOMMEND_BADGE_TEXT }}）</template>
              </PtButton>
            </PtTooltip>
          </div>
        </div>

        <!-- 删区块（动结构）从内容组拆出：编辑文字在「内容」，删除入口在这里 -->
        <div v-if="editor.selectedBlockId" class="section">
          <h4>区块操作</h4>
          <PtButton variant="danger" :disabled="editor.pastePending" @click="removeBlock">删除区块</PtButton>
        </div>
      </div>
    </section>

    <!-- PX-05：统一确认弹窗（删区块 / 删非空行列） -->
    <ConfirmDialog />
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
/* ── PX-16 分组折叠 ── */
.group {
  margin-bottom: 8px;
  border-top: 1px solid var(--pt-border);
}
.group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  border: 0;
  background: transparent;
  padding: 8px 2px;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--pt-muted);
  cursor: pointer;
  text-align: left;
}
.group-head .arrow {
  font-style: normal;
  font-size: 10px;
  flex-shrink: 0;
}
.group-body {
  padding: 0 2px 8px;
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
.headline {
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--pt-muted);
}
/* R-3 图片区 */
.image-area {
  margin-bottom: 8px;
}
.image-area .thumb {
  display: block;
  max-width: 100%;
  max-height: 96px;
  border: 1px solid var(--pt-border);
  border-radius: 8px;
  object-fit: cover;
}
.file-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px dashed var(--pt-border);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  cursor: pointer;
  background: var(--pt-paper);
}
.file-btn input[type='file'] {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
.file-btn:hover {
  border-color: var(--pt-primary);
}
.hint {
  font-size: 12px;
  color: #6b7280;
}
</style>
