import { fail, ok, type Result } from '../errors'
import type { EditIntent, EditorState, TemplateInstance } from '../types'
import { applyEditIntent } from './intent'
import { cloneInstance } from '../schema/validate'

export function createEditorState(inst: TemplateInstance): EditorState {
  return {
    current: cloneInstance(inst),
    undoSnapshot: null,
    dirty: false,
    version: 0,
    pastePending: false,
  }
}

/** 粘贴预览期间被拒绝的编辑意图（设计增量 §2.1 步 7 / FR-17） */
const PASTE_BLOCKED_INTENTS: ReadonlySet<EditIntent['kind']> = new Set([
  'merge',
  'split',
  'setAlign',
  'setEmphasis',
  'addBlock',
  'updateBlock',
  'removeBlock',
])

export function dispatch(state: EditorState, intent: EditIntent): Result<EditorState> {
  if (state.pastePending === true && PASTE_BLOCKED_INTENTS.has(intent.kind)) {
    return fail('SLOT_DROP_BLOCKED', '先确认或取消这次粘贴')
  }
  const snapshot = cloneInstance(state.current)
  const result = applyEditIntent(state.current, intent)
  if (!result.ok) return result
  return ok({
    current: result.value,
    undoSnapshot: snapshot,
    dirty: true,
    version: state.version + 1,
    pastePending: state.pastePending,
  })
}

export function undoOnce(state: EditorState): EditorState {
  if (!state.undoSnapshot) return state
  return {
    current: cloneInstance(state.undoSnapshot),
    undoSnapshot: null,
    dirty: true,
    version: state.version + 1,
  }
}

export function markClean(state: EditorState): EditorState {
  return { ...state, dirty: false }
}

export function replaceCurrent(state: EditorState, inst: TemplateInstance, dirty = false): EditorState {
  return {
    current: cloneInstance(inst),
    undoSnapshot: null,
    dirty,
    version: state.version + 1,
  }
}

/** Helper used by tests — dispatch that returns fail without mutating. */
export function tryDispatch(state: EditorState, intent: EditIntent): Result<EditorState> {
  return dispatch(state, intent)
}

export function canUndo(state: EditorState): boolean {
  return state.undoSnapshot !== null
}

export { fail, ok }
