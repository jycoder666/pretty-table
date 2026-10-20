import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  type CellCoord,
  type EditIntent,
  type EditorState,
  type TemplateInstance,
  type ValidatedPastePlan,
  buildVisibleGrid,
  createEditorState,
  createStoreTxn,
  dispatch,
  undoOnce,
  markClean,
  replaceCurrent,
  canUndo,
  cloneInstance,
  parsePaste,
  planPaste,
  validatePaste,
  THEME_NAMES,
  type ThemeId,
  type Align,
  type Emphasis,
  type MergeRange,
  type BlockType,
  type DispatchOptions,
} from '@/core'
import { saveDraft, loadDraft, clearDraft } from '../repo/draftRepo'
import { faultGate } from '../debug/fault'
import { pasteCopy } from '../paste/pasteCopy'

export type PageView = 'library' | 'editor'

/** GC-19：调试开关构建期常量；生产构建折叠为 false，faultGate 调用被摇树 */
const PT_DEBUG = import.meta.env.VITE_PT_DEBUG === '1' || import.meta.env.DEV

export const useEditorStore = defineStore('editor', () => {
  const page = ref<PageView>('library')
  const state = ref<EditorState | null>(null)
  const selectedSlotId = ref<string | null>(null)
  const selectedBlockId = ref<string | null>(null)
  const selectionRange = ref<MergeRange | null>(null)
  const toast = ref<string | null>(null)
  const banner = ref<string | null>(null)
  const restorePrompt = ref(false)
  const exporting = ref(false)
  const lastToastTimer = ref<ReturnType<typeof setTimeout> | null>(null)

  const current = computed(() => state.value?.current ?? null)
  const dirty = computed(() => state.value?.dirty ?? false)
  const undoEnabled = computed(() => (state.value ? canUndo(state.value) : false))

  // ── 粘贴预览（FR-16～19）──
  const pastePreview = ref<{ plan: ValidatedPastePlan; emptyCount: number } | null>(null)
  const pastePending = computed(() => pastePreview.value !== null)

  /** 选中槽 → 可见网格坐标（粘贴起点，左上角） */
  function anchorOfSelected(inst: TemplateInstance, slotId: string): CellCoord | null {
    const grid = inst.layout.slotGrid
    if (!grid) return null
    for (let r = 0; r < grid.length; r++) {
      const row = grid[r]
      if (!row) continue
      for (let c = 0; c < row.length; c++) {
        if (row[c] !== slotId) continue
        const vis = buildVisibleGrid(inst)
        const idx = vis.findIndex((v) => v.kind === 'logical' && v.logicalRow === r)
        return idx >= 0 ? [idx, c] : null
      }
    }
    return null
  }

  function commitPaste(plan: ValidatedPastePlan) {
    if (!state.value) return
    pastePreview.value = null
    state.value.pastePending = false
    textSessionKey = null
    // 故障注入（GC-19）：?pt-fault=PASTE_COMMIT_FAILED → 提示且 store 不变
    if (PT_DEBUG && faultGate('PASTE_COMMIT_FAILED')) {
      showToast(pasteCopy([{ code: 'PASTE_COMMIT_FAILED', message: '' }]))
      return
    }
    const txn = createStoreTxn(
      () => state.value as EditorState,
      (s) => {
        state.value = s
      },
    )
    const r = txn.applyBatch(plan)
    if (!r.ok) {
      showToast(pasteCopy([{ code: r.code, message: '' }]))
      return
    }
    void persistDraft()
    showToast(`已填入 ${plan.writes.length} 格`)
  }

  function pasteStart(data: { text?: string; html?: string }): boolean {
    if (!state.value || !current.value) return false
    const parsed = parsePaste(data)
    if (!parsed.ok) {
      showToast(pasteCopy([parsed.error]))
      return false
    }
    if (!selectedSlotId.value) {
      showToast(pasteCopy([{ code: 'PASTE_NO_ANCHOR', message: '' }]))
      return false
    }
    const anchor = anchorOfSelected(current.value, selectedSlotId.value)
    if (!anchor) {
      showToast(pasteCopy([{ code: 'PASTE_NO_ANCHOR', message: '' }]))
      return false
    }
    const planned = planPaste(current.value, state.value.version, anchor, parsed.value)
    if (!planned.ok) {
      showToast(pasteCopy([planned.error]))
      return false
    }
    const validated = validatePaste(current.value, planned.value)
    if (!validated.ok) {
      showToast(pasteCopy(validated.errors))
      return false
    }
    const plan = validated.value
    const emptyCount = plan.cells.filter((c) => c.kind === 'empty').length
    // S9：1×1 不预览、直接写入（仍是一次事务、可撤销）
    if (plan.size.h === 1 && plan.size.w === 1) {
      commitPaste(plan)
      return true
    }
    pastePreview.value = { plan, emptyCount }
    state.value.pastePending = true
    return true
  }

  function confirmPaste() {
    const p = pastePreview.value
    if (!p) return
    commitPaste(p.plan)
  }

  function cancelPaste() {
    pastePreview.value = null
    if (state.value) state.value.pastePending = false
  }

  function showToast(msg: string) {
    toast.value = msg
    if (lastToastTimer.value) clearTimeout(lastToastTimer.value)
    lastToastTimer.value = setTimeout(() => {
      toast.value = null
    }, 2600)
  }

  function openTemplate(inst: TemplateInstance) {
    state.value = createEditorState(cloneInstance(inst))
    selectedSlotId.value = null
    selectedBlockId.value = null
    selectionRange.value = null
    banner.value = null
    textSessionKey = null
    page.value = 'editor'
    void persistDraft()
  }

  async function tryRestoreDraft(): Promise<'restored' | 'none' | 'fail'> {
    try {
      const d = await loadDraft()
      if (!d) return 'none'
      state.value = createEditorState(d.instance)
      textSessionKey = null
      // restore clears undo (FR-10)
      state.value = {
        ...state.value,
        undoSnapshot: null,
        dirty: true,
      }
      page.value = 'editor'
      banner.value = '已恢复上次的编辑'
      restorePrompt.value = true
      return 'restored'
    } catch {
      banner.value = '上次的编辑没能恢复，已按模板重新打开'
      return 'fail'
    }
  }

  async function discardRestored() {
    await clearDraft()
    state.value = null
    page.value = 'library'
    banner.value = null
    restorePrompt.value = false
  }

  function apply(intent: EditIntent, undoOpts?: DispatchOptions): boolean {
    // PX-03：不带撤销策略的意图（对齐/强调/主题/合并等）结束当前文字编辑会话
    if (!undoOpts) textSessionKey = null
    if (!state.value) return false
    const r = dispatch(state.value, intent, undoOpts)
    if (!r.ok) {
      showToast(r.error.message)
      return false
    }
    state.value = r.value
    void persistDraft()
    return true
  }

  function undo() {
    if (!state.value || !canUndo(state.value)) return
    state.value = undoOnce(state.value)
    textSessionKey = null
    void persistDraft()
  }

  // ── PX-03：同槽连续文字编辑合并为一步撤销 ──
  // 会话 = 开始输入到失焦 / 切换槽位 / 触发其他类操作为止；键形如 'slot:<id>' / 'block:<id>'
  let textSessionKey: string | null = null

  function resetTextSession() {
    textSessionKey = null
  }

  /** 文字编辑入口统一走这里：同会话 coalesce，跨会话 beginTextSession */
  function textUndoOpts(key: string): DispatchOptions {
    const opts: DispatchOptions =
      textSessionKey === key ? { coalesceUndo: true } : { beginTextSession: true }
    textSessionKey = key
    return opts
  }

  function setSlotText(slotId: string, text: string) {
    apply({ kind: 'setSlot', slotId, value: text }, textUndoOpts(`slot:${slotId}`))
  }

  function setTheme(themeId: ThemeId) {
    apply({ kind: 'setTheme', themeId })
  }

  function setZebra(on: boolean) {
    apply({ kind: 'setZebra', on })
  }

  function setAlign(align: Align) {
    if (!selectedSlotId.value) return
    apply({ kind: 'setAlign', slotId: selectedSlotId.value, align })
  }

  function setEmphasis(emphasize: Emphasis[]) {
    if (!selectedSlotId.value) return
    apply({ kind: 'setEmphasis', slotId: selectedSlotId.value, emphasize })
  }

  function mergeSelection() {
    if (!selectionRange.value) return
    apply({ kind: 'merge', range: selectionRange.value })
  }

  function splitSelection() {
    if (!selectionRange.value) return
    apply({ kind: 'split', range: selectionRange.value })
  }

  function addBlock(type: BlockType, slotId: string) {
    const id = `blk-${Date.now()}`
    apply({
      kind: 'addBlock',
      block: {
        id,
        type,
        slotId,
        props:
          type === 'sectionBar'
            ? { label: '分区' }
            : { text: type === 'groupHeader' ? '分组标题' : '注脚' },
      },
    })
  }

  function removeSelectedBlock() {
    if (!selectedBlockId.value) return
    apply({ kind: 'removeBlock', blockId: selectedBlockId.value })
    selectedBlockId.value = null
  }

  function updateBlockText(text: string) {
    if (!selectedBlockId.value || !current.value) return
    const b = current.value.blocks.find((x) => x.id === selectedBlockId.value)
    if (!b) return
    const opts = textUndoOpts(`block:${b.id}`)
    if (b.type === 'sectionBar') {
      apply({ kind: 'updateBlock', blockId: b.id, props: { label: text } }, opts)
    } else {
      apply({ kind: 'updateBlock', blockId: b.id, props: { text } }, opts)
    }
  }

  function markSaved() {
    if (!state.value) return
    state.value = markClean(state.value)
  }

  async function persistDraft() {
    if (!state.value) return
    try {
      await saveDraft(state.value.current)
    } catch {
      showToast('自动保存失败，刷新后可能无法恢复')
    }
  }

  function goLibrary() {
    page.value = 'library'
  }

  function themeLabel(id: string) {
    return THEME_NAMES[id as ThemeId] ?? id
  }

  function replaceWith(inst: TemplateInstance) {
    if (!state.value) {
      openTemplate(inst)
      return
    }
    textSessionKey = null
    state.value = replaceCurrent(state.value, inst, false)
  }

  return {
    page,
    state,
    current,
    dirty,
    undoEnabled,
    selectedSlotId,
    selectedBlockId,
    selectionRange,
    toast,
    banner,
    restorePrompt,
    exporting,
    pastePreview,
    pastePending,
    pasteStart,
    confirmPaste,
    cancelPaste,
    showToast,
    openTemplate,
    /** PX-03：文字编辑失焦时结束会话，下次输入另起一步撤销 */
    endTextSession: resetTextSession,
    tryRestoreDraft,
    discardRestored,
    apply,
    undo,
    setSlotText,
    setTheme,
    setZebra,
    setAlign,
    setEmphasis,
    mergeSelection,
    splitSelection,
    addBlock,
    removeSelectedBlock,
    updateBlockText,
    markSaved,
    goLibrary,
    themeLabel,
    replaceWith,
  }
})
