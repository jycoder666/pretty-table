import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  type EditIntent,
  type EditorState,
  type TemplateInstance,
  createEditorState,
  dispatch,
  undoOnce,
  markClean,
  replaceCurrent,
  canUndo,
  cloneInstance,
  THEME_NAMES,
  type ThemeId,
  type Align,
  type Emphasis,
  type MergeRange,
  type BlockType,
} from '@/core'
import { saveDraft, loadDraft, clearDraft } from '../repo/draftRepo'

export type PageView = 'library' | 'editor'

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
    page.value = 'editor'
    void persistDraft()
  }

  async function tryRestoreDraft(): Promise<'restored' | 'none' | 'fail'> {
    try {
      const d = await loadDraft()
      if (!d) return 'none'
      state.value = createEditorState(d.instance)
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

  function apply(intent: EditIntent): boolean {
    if (!state.value) return false
    const r = dispatch(state.value, intent)
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
    void persistDraft()
  }

  function setSlotText(slotId: string, text: string) {
    apply({ kind: 'setSlot', slotId, value: text })
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
    if (b.type === 'sectionBar') apply({ kind: 'updateBlock', blockId: b.id, props: { label: text } })
    else apply({ kind: 'updateBlock', blockId: b.id, props: { text } })
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
    showToast,
    openTemplate,
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
