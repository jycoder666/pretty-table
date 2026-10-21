import { fail, ok, type Result } from '../errors'
import { UNDO_LIMITS, type EditIntent, type EditorState, type TemplateInstance } from '../types'
import { applyEditIntent } from './intent'
import { cloneInstance } from '../schema/validate'
import { snapshotForUndo } from '../schema/clone'

export function createEditorState(inst: TemplateInstance): EditorState {
  return {
    current: cloneInstance(inst),
    undoStack: [],
    redoStack: [],
    dirty: false,
    version: 0,
    pastePending: false,
  }
}

/** 入栈 + 超限裁剪最旧（栈深恒 ≤ UNDO_LIMITS.maxDepth） */
export function pushSnapshot(
  stack: TemplateInstance[],
  snap: TemplateInstance,
): TemplateInstance[] {
  const next = [...stack, snap]
  return next.length > UNDO_LIMITS.maxDepth
    ? next.slice(next.length - UNDO_LIMITS.maxDepth)
    : next
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
 * dispatch 撤销策略（PX-03 → E3 多次撤销，向后兼容：不传即「每次各算一步」）
 * - 默认：当前状态快照 push 入 undoStack，并清空 redoStack（新分支不可重做）
 * - coalesceUndo：同一文字编辑会话内的连续提交，不 push（collapse 到会话开始那条）、不清 redo
 * - beginTextSession：开始新的文字编辑会话，与默认相同（新会话边界 = 新快照入栈）
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
  // 防御：栈空时 coalesce 退化为默认路径（coalesce=false）——此时清 redoStack 是正确语义：
  // 栈空说明这是会话首键（或首次编辑），push 快照即开启新分支，按约定新分支必须断开旧重做链
  const coalesce = opts.coalesceUndo === true && state.undoStack.length > 0
  const result = applyEditIntent(state.current, intent)
  if (!result.ok) return result
  // QA 观察项（E3 验收遗留）：快照延迟到实际需要时再算——coalesce 命中时入栈被跳过，
  // 提前深拷贝只会白算一份。applyEditIntent 返回新对象、不改入参，此处读 current 时序安全。
  return ok(
    {
      current: result.value,
      undoStack: coalesce
        ? state.undoStack
        : pushSnapshot(state.undoStack, snapshotForUndo(state.current)),
      // coalesce 未产生新分支，不清 redo；其余新操作一律断开重做链
      redoStack: coalesce ? state.redoStack : [],
      dirty: true,
      version: state.version + 1,
      pastePending: state.pastePending,
    },
    // warn（STRUCT_LOSS / TOKEN_INVALID 等）透传给壳层聚合 toast
    result.warnings,
  )
}

/** 撤销：当前状态入 redoStack，弹 undoStack 顶拷贝恢复；粘贴预览期 no-op（FR-17） */
export function undo(state: EditorState): EditorState {
  if (state.undoStack.length === 0 || state.pastePending === true) return state
  const redoTop = snapshotForUndo(state.current)
  const restore = state.undoStack[state.undoStack.length - 1]!
  return {
    current: snapshotForUndo(restore),
    undoStack: state.undoStack.slice(0, -1),
    redoStack: pushSnapshot(state.redoStack, redoTop),
    dirty: true,
    version: state.version + 1,
    pastePending: state.pastePending,
  }
}

/** 重做：与 undo 对称；粘贴预览期 no-op（FR-17） */
export function redo(state: EditorState): EditorState {
  if (state.redoStack.length === 0 || state.pastePending === true) return state
  const undoTop = snapshotForUndo(state.current)
  const restore = state.redoStack[state.redoStack.length - 1]!
  return {
    current: snapshotForUndo(restore),
    undoStack: pushSnapshot(state.undoStack, undoTop),
    redoStack: state.redoStack.slice(0, -1),
    dirty: true,
    version: state.version + 1,
    pastePending: state.pastePending,
  }
}

export function markClean(state: EditorState): EditorState {
  return { ...state, dirty: false }
}

/** 整体替换当前实例（恢复草稿 / 替换模板）：撤销与重做链一并清空 */
export function replaceCurrent(state: EditorState, inst: TemplateInstance, dirty = false): EditorState {
  return {
    current: cloneInstance(inst),
    undoStack: [],
    redoStack: [],
    dirty,
    version: state.version + 1,
  }
}

/** Helper used by tests — dispatch that returns fail without mutating. */
export function tryDispatch(state: EditorState, intent: EditIntent): Result<EditorState> {
  return dispatch(state, intent)
}

export function canUndo(state: EditorState): boolean {
  return state.undoStack.length > 0
}

export function canRedo(state: EditorState): boolean {
  return state.redoStack.length > 0
}

export { fail, ok }
