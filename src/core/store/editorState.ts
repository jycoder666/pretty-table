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

/** 粘贴预览期间被拒绝的编辑意图（FR-17；自定义格式 §1.7 扩容为全部意图 kind） */
const PASTE_BLOCKED_INTENTS: ReadonlySet<EditIntent['kind']> = new Set([
  'merge',
  'split',
  'setAlign',
  'setEmphasis',
  'addBlock',
  'updateBlock',
  'removeBlock',
  // 自定义格式新增（颜色 / 排版 / 结构），pastePending 期间一律互斥
  'setThemeToken',
  'resetThemeTokens',
  'setColWidth',
  'setRowHeightTier',
  'setFontSizeTier',
  'setPaddingTier',
  'addRow',
  'removeRow',
  'addCol',
  'removeCol',
  'setHeaderLevel',
])

/**
 * dispatch 可选撤销策略（PX-03，向后兼容：不传即原有一步撤销语义）
 * - 默认：undoSnapshot 置为本次操作前快照，undoPrev 清空（换主题/合并等其他操作照旧各算一步）
 * - coalesceUndo：同一文字编辑会话内的连续提交，不覆盖 undoSnapshot / undoPrev
 * - beginTextSession：开始新的文字编辑会话，把当前 undoSnapshot 下沉为 undoPrev，
 *   使「编辑 A 槽 → 编辑 B 槽」可两步退回（B 编辑前 → A 编辑前）
 */
export interface DispatchOptions {
  coalesceUndo?: boolean
  beginTextSession?: boolean
}

export function dispatch(
  state: EditorState,
  intent: EditIntent,
  opts: DispatchOptions = {},
): Result<EditorState> {
  if (state.pastePending === true && PASTE_BLOCKED_INTENTS.has(intent.kind)) {
    return fail('SLOT_DROP_BLOCKED', '先确认或取消这次粘贴')
  }
  // 防御：快照为空时 coalesce 退化为默认行为，保证可撤销
  const coalesce = opts.coalesceUndo === true && state.undoSnapshot !== null
  const snapshot = cloneInstance(state.current)
  const result = applyEditIntent(state.current, intent)
  if (!result.ok) return result
  return ok(
    {
      current: result.value,
      undoSnapshot: coalesce ? state.undoSnapshot : snapshot,
      undoPrev: coalesce
        ? (state.undoPrev ?? null)
        : opts.beginTextSession === true
          ? (state.undoSnapshot ?? null)
          : null,
      dirty: true,
      version: state.version + 1,
      pastePending: state.pastePending,
    },
    // warn（STRUCT_LOSS / TOKEN_INVALID 等）透传给壳层聚合 toast
    result.warnings,
  )
}

export function undoOnce(state: EditorState): EditorState {
  if (!state.undoSnapshot) return state
  return {
    current: cloneInstance(state.undoSnapshot),
    undoSnapshot: state.undoPrev ?? null,
    undoPrev: null,
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
