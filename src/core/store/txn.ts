import type { PasteErrorCode } from '../errors'
import { cloneInstance, validateInstance } from '../schema/validate'
import { snapshotForUndo } from '../schema/clone'
import { pushSnapshot } from './editorState'
import type { EditorState, TemplateInstance } from '../types'
import type { ValidatedPastePlan } from '../paste/validator'

/**
 * StoreTxn（设计增量 §2.4）：粘贴一次 commit、一条撤销快照。
 * checkVersion → clone(slots) → 逐格写副本 → 结构未动校验 → validateInstance → commit → version+1。
 * 中途任何异常 → 丢弃副本 → PASTE_COMMIT_FAILED，store 原样。
 */

export type StoreTxnResult =
  | { ok: true; version: number }
  | { ok: false; code: PasteErrorCode; details?: unknown }

export interface StoreTxn {
  applyBatch(plan: ValidatedPastePlan): StoreTxnResult
}

/** 粘贴不触碰 layout / blocks / themeId；发现变化视为实现错误（设计增量 §2.4） */
function structureUnchanged(a: TemplateInstance, b: TemplateInstance): boolean {
  return (
    JSON.stringify(a.layout) === JSON.stringify(b.layout) &&
    JSON.stringify(a.blocks) === JSON.stringify(b.blocks) &&
    a.themeId === b.themeId &&
    JSON.stringify(a.themeTokens ?? null) === JSON.stringify(b.themeTokens ?? null) &&
    JSON.stringify(a.slotDefs ?? null) === JSON.stringify(b.slotDefs ?? null)
  )
}

export function createStoreTxn(get: () => EditorState, set: (s: EditorState) => void): StoreTxn {
  return {
    applyBatch(plan: ValidatedPastePlan): StoreTxnResult {
      const state = get()
      if (plan.baseVersion !== state.version) {
        return { ok: false, code: 'PASTE_STALE' }
      }
      const before = state.current
      let committed: TemplateInstance
      try {
        const draft = cloneInstance(before)
        for (const w of plan.writes) {
          draft.slots[w.slotId] = w.value
        }
        const checked = validateInstance(draft)
        if (!checked.ok) {
          return { ok: false, code: 'PASTE_COMMIT_FAILED', details: { cause: checked.error.code } }
        }
        if (!structureUnchanged(checked.value, before)) {
          return { ok: false, code: 'PASTE_COMMIT_FAILED', details: { cause: 'structure-mutated' } }
        }
        committed = checked.value
      } catch (e) {
        return {
          ok: false,
          code: 'PASTE_COMMIT_FAILED',
          details: { cause: e instanceof Error ? e.message : String(e) },
        }
      }
      // 一次 commit：撤销栈 push 一条「粘贴前」快照 + 清 redoStack（E3：整次粘贴一步，1×1 直写同路径），
      // version+1（FR-19 并入 FR-11）
      set({
        current: committed,
        undoStack: pushSnapshot(state.undoStack, snapshotForUndo(before)),
        redoStack: [],
        dirty: true,
        version: state.version + 1,
        pastePending: state.pastePending,
      })
      return { ok: true, version: state.version + 1 }
    },
  }
}
