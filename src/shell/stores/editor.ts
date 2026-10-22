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
  undo as undoState,
  redo as redoState,
  markClean,
  replaceCurrent,
  canUndo,
  canRedo,
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
  colWidthAt,
  countFilledSlotsInRange,
  slotIdsInRange,
  isEmphasizable,
  dispatchBatch,
} from '@/core'
import { saveDraft, loadDraft, clearDraft } from '../repo/draftRepo'
import { faultGate } from '../debug/fault'
import { pasteCopy } from '../paste/pasteCopy'
import { errorCopy, warnCopy } from '../editor/errorCopy'

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
  /**
   * toast 序号：连续两次提示同一句话时节点不会重建（v-if 只判有值），
   * 端到端用例就没法判断「这一次」的操作是否真的落地了（曾因此读到上一轮剪贴板内容）。
   * 每次 showToast 递增并渲染成 data-seq，给自动化一个确定性的同步点。
   */
  const toastSeq = ref(0)
  const banner = ref<string | null>(null)
  const restorePrompt = ref(false)
  const exporting = ref(false)
  const lastToastTimer = ref<ReturnType<typeof setTimeout> | null>(null)

  const current = computed(() => state.value?.current ?? null)
  const dirty = computed(() => state.value?.dirty ?? false)
  // E3：撤销/重做可用性直接由核内双栈派生
  const undoEnabled = computed(() => (state.value ? canUndo(state.value) : false))
  const redoEnabled = computed(() => (state.value ? canRedo(state.value) : false))

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
    // QA 边角：取消预览后结束文字编辑会话，避免与预览前的输入合并成一步撤销
    textSessionKey = null
  }

  function showToast(msg: string) {
    toast.value = msg
    toastSeq.value += 1
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
      // restore clears undo/redo（FR-10）：createEditorState 双栈为空，这里只需标脏
      state.value = {
        ...state.value,
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
    // T04：核内 warn（STRUCT_LOSS / UNKNOWN_FIELD 等）聚合一条 toast 通知
    if (r.warnings?.length) {
      showToast(r.warnings.map((w) => warnCopy(w.code)).join('；'))
    }
    void persistDraft()
    return true
  }

  /**
   * 批量意图（WP3/WP4）：N 条意图 = 一条撤销快照（核内 dispatchBatch）。
   * 任一失败整批回滚，store 不变；warn 聚合一条 toast。
   */
  function applyBatch(intents: EditIntent[]): boolean {
    if (!state.value || intents.length === 0) return false
    textSessionKey = null
    const r = dispatchBatch(state.value, intents)
    if (!r.ok) {
      showToast(r.error.message)
      return false
    }
    state.value = r.value
    if (r.warnings?.length) {
      showToast(r.warnings.map((w) => warnCopy(w.code)).join('；'))
    }
    void persistDraft()
    return true
  }

  /**
   * 画布列宽拖拽落模型（PX-04 v2 / WP4）：VTable 自带列宽拖拽只改画布内部状态，
   * 这里把宽度差异写回 layout.style.colWidths —— 模型成为单点，导出/PNG/命中一并生效。
   * 一次拖动 = 一条批量意图 = 一步撤销。
   */
  function applyCanvasColWidths(widths: number[]): boolean {
    const inst = current.value
    if (!inst) return false
    const changes: EditIntent[] = []
    const cols = Math.min(inst.layout.colCount, widths.length)
    for (let c = 0; c < cols; c++) {
      const w = widths[c]
      if (typeof w !== 'number' || !Number.isFinite(w)) continue
      if (Math.abs(w - colWidthAt(inst, c)) > 0.5) {
        changes.push({ kind: 'setColWidth', col: c, width: w })
      }
    }
    if (changes.length === 0) return false
    return applyBatch(changes)
  }

  function undo() {
    if (!state.value || !canUndo(state.value)) return
    // QA 边角（FR-17）：粘贴预览期禁撤销——预览未决时一切状态变更被锁，撤销也不放开，
    // 避免 pastePreview 与 current 错位后 confirmPaste 走 PASTE_STALE
    if (state.value.pastePending) return
    state.value = undoState(state.value)
    textSessionKey = null
    void persistDraft()
  }

  function redo() {
    if (!state.value || !canRedo(state.value)) return
    // FR-17：粘贴预览期重做同样锁定（与撤销同源守卫）
    if (state.value.pastePending) return
    state.value = redoState(state.value)
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

  /**
   * 合并选区（WP1）：成功必须可见——toast「已合并」+ 选区描边闪一次（TH-F3 ≤200ms）；
   * 合并会清掉非左上格的内容，被清的格数写进 toast，避免「内容凭空没了」的误解。
   */
  function mergeSelection() {
    const inst = current.value
    const range = selectionRange.value
    if (!inst || !range) return
    const cleared = countFilledSlotsInRange(inst, range, { skipTopLeft: true })
    if (!apply({ kind: 'merge', range })) return
    flashSelection()
    showToast(cleared > 0 ? `已合并（清除了 ${cleared} 格内容）` : '已合并')
  }

  function splitSelection() {
    const range = selectionRange.value
    if (!range) return
    if (!apply({ kind: 'split', range })) return
    flashSelection()
    showToast('已拆分')
  }

  /** 清空选区内容（WP1）：只清可写格；选区内本来没内容时给明确反馈，不做无声操作 */
  function clearSelection() {
    const inst = current.value
    const range = selectionRange.value
    if (!inst || !range) return
    const filled = countFilledSlotsInRange(inst, range)
    if (filled === 0) {
      showToast('选区内没有内容')
      return
    }
    if (!apply({ kind: 'clearSlots', range })) return
    showToast(`已清空 ${filled} 格`)
  }

  // ── WP3：选区批量修改（对齐 / 强调），N 格一批 = 一步撤销 ──
  /** 选区格数（面板「已选 N 格」与「单格 vs 批量」分流口径） */
  const selectionCellCount = computed(() => {
    const r = selectionRange.value
    if (!r) return 0
    return (Math.abs(r.end[0] - r.start[0]) + 1) * (Math.abs(r.end[1] - r.start[1]) + 1)
  })

  /** 选区内可写槽位（只读格 / 无槽位格跳过；核内 slotIdsInRange 单点） */
  function writableSlotsInSelection(): string[] {
    const inst = current.value
    const range = selectionRange.value
    if (!inst || !range) return []
    return slotIdsInRange(inst, range)
  }

  function emphasisOf(inst: TemplateInstance, slotId: string): Emphasis[] {
    const v = inst.slots[slotId]
    if (!v || typeof v !== 'object' || !('emphasize' in v)) return []
    const e = v.emphasize
    if (Array.isArray(e)) return [...e]
    return e ? [e] : []
  }

  /** 批量对齐：选区内所有可写格一次改齐（一批一步撤销） */
  function setAlignForSelection(align: Align): boolean {
    const ids = writableSlotsInSelection()
    if (ids.length === 0) {
      showToast('选区内没有可改的格子')
      return false
    }
    return applyBatch(ids.map((slotId) => ({ kind: 'setAlign', slotId, align }) as EditIntent))
  }

  /**
   * 批量强调：组内一致切换——选区内每格都已有该强调 → 全部去掉；否则全部加上。
   * （逐格翻转会让「一半有一半没有」的选区越点越乱。）
   */
  function toggleEmphasisForSelection(kind: Emphasis): boolean {
    const inst = current.value
    const ids = writableSlotsInSelection().filter((id) => isEmphasizable(inst as TemplateInstance, id))
    if (ids.length === 0) {
      showToast('选区内没有可强调的格子')
      return false
    }
    const i = inst as TemplateInstance
    const all = ids.every((id) => emphasisOf(i, id).includes(kind))
    const intents: EditIntent[] = ids.map((slotId) => {
      const cur = emphasisOf(i, slotId)
      const next = all ? cur.filter((x) => x !== kind) : cur.includes(kind) ? cur : [...cur, kind]
      return { kind: 'setEmphasis', slotId, emphasize: next }
    })
    return applyBatch(intents)
  }

  // ── WP1：成功操作的「闪边」反馈（选区描边闪一次，TH-F3 ≤200ms）──
  // flashKey 递增触发叠加层重放动画；归零即停（同一块选区连续操作也能重放）
  const flashKey = ref(0)
  let flashTimer: ReturnType<typeof setTimeout> | null = null

  function flashSelection() {
    flashKey.value += 1
    if (flashTimer) clearTimeout(flashTimer)
    flashTimer = setTimeout(() => {
      flashTimer = null
      flashKey.value = 0
    }, 260)
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

  /**
   * WP4：表内区块换位（拖动把手 → 落到别的槽位）。
   * 目标槽空 = 移动；已占用 = 两个区块互换（核内双侧 accept 校验）。
   * 成功给一句可见反馈（WP1 的口径：动了结构就必须看得见）。
   */
  function moveBlock(blockId: string, toSlotId: string): boolean {
    const inst = current.value
    if (!inst) return false
    const moving = inst.blocks.find((b) => b.id === blockId)
    if (!moving || moving.slotId === toSlotId) return false
    const swapping = inst.blocks.some((b) => b.slotId === toSlotId && b.id !== blockId)
    if (!apply({ kind: 'moveBlock', blockId, toSlotId })) return false
    selectedBlockId.value = null
    showToast(swapping ? '已换位' : '已移到新槽位')
    return true
  }

  /**
   * WP4：整行/整列换位（面板按钮）。内容随行走（合并区/只读格/列宽一起重映射），
   * 被结构约束挡住时核内给白话原因（表头行 / 标签列 / 冻结边界 / 与合并区交错）。
   * 选区跟着被挪的那一行/列走：否则用户接着点第二次按钮，挪的是「别处挪过来的那一行」。
   */
  function moveRow(from: number, to: number): boolean {
    const sel = selectionRange.value
    if (!apply({ kind: 'moveRow', from, to })) return false
    if (sel) selectionRange.value = { start: [to, sel.start[1]], end: [to, sel.end[1]] }
    showToast(to < from ? '已上移' : '已下移')
    return true
  }

  function moveCol(from: number, to: number): boolean {
    const sel = selectionRange.value
    if (!apply({ kind: 'moveCol', from, to })) return false
    if (sel) selectionRange.value = { start: [sel.start[0], to], end: [sel.end[0], to] }
    showToast(to < from ? '已左移' : '已右移')
    return true
  }

  // ── R-3 图片写入（交互升级 T04）：上传 / 粘贴同一入口 ──

  /** File → data URL（壳层唯一读取点；校验全部在核内三连闸） */
  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('图片读取失败'))
      reader.readAsDataURL(file)
    })
  }

  /**
   * 上传图片（P0）：File → dataURL → setSlot 意图。
   * 校验失败（格式/大小/预算/格子不允许）→ errorCopy 白话 toast，store 不变。
   */
  async function uploadImage(slotId: string, file: File): Promise<boolean> {
    if (!state.value) return false
    let dataUrl: string
    try {
      dataUrl = await fileToDataUrl(file)
    } catch {
      showToast('图片读取失败，请重试')
      return false
    }
    return setImageDataUrl(slotId, dataUrl)
  }

  /**
   * data URL 写入（上传/粘贴共用）：走既有 setSlot 意图 → 一意图一张撤销快照。
   * 核内 canSetImage / validateImageDataUrl / checkImageBudget 三连校验，
   * 失败经 errorCopy 映射白话文案（GC-25 码不外露）。
   */
  function setImageDataUrl(slotId: string, dataUrl: string): boolean {
    if (!state.value) return false
    const r = dispatch(state.value, { kind: 'setSlot', slotId, value: { image: dataUrl } })
    if (!r.ok) {
      showToast(errorCopy(r.error.code, r.error.message))
      return false
    }
    state.value = r.value
    if (r.warnings?.length) {
      showToast(r.warnings.map((w) => warnCopy(w.code)).join('；'))
    }
    void persistDraft()
    return true
  }

  /** 移除图片 = setSlot('')（设计 1.2.2：回到文字空槽），一次意图可撤销 */
  function removeImage(slotId: string): boolean {
    return apply({ kind: 'setSlot', slotId, value: '' })
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
    redoEnabled,
    selectedSlotId,
    selectedBlockId,
    selectionRange,
    selectionCellCount,
    toast,
    toastSeq,
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
    applyBatch,
    applyCanvasColWidths,
    undo,
    redo,
    setSlotText,
    setTheme,
    setZebra,
    setAlign,
    setEmphasis,
    setAlignForSelection,
    toggleEmphasisForSelection,
    mergeSelection,
    splitSelection,
    clearSelection,
    flashKey,
    addBlock,
    removeSelectedBlock,
    moveBlock,
    moveRow,
    moveCol,
    updateBlockText,
    uploadImage,
    setImageDataUrl,
    removeImage,
    markSaved,
    goLibrary,
    themeLabel,
    replaceWith,
  }
})
