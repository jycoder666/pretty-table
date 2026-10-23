/**
 * 结构快捷键识别纯函数（增量设计 A7，无 DOM 依赖，可单测、跨引擎一致）：
 * - Shift+Space   → 整行选择
 * - Ctrl/Cmd+Space → 整列选择
 * - Shift+F10 / ContextMenu 键 → 打开结构菜单
 * - Esc → 退出整行/列选择（回首格）
 */

export interface KeyLike {
  key: string
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
}

/** Shift+Space → 整行（无 Ctrl/Cmd/Alt 修饰；Space 键值为 ' '，长 1 会撞直接键入分支，必须先拦） */
export function isSelectRowKey(ev: KeyLike): boolean {
  return ev.key === ' ' && ev.shiftKey && !ev.ctrlKey && !ev.metaKey && !ev.altKey
}

/** Ctrl/Cmd+Space → 整列（PRD 授权：平台冲突保留轨道入口，不做运行时探测） */
export function isSelectColKey(ev: KeyLike): boolean {
  return ev.key === ' ' && (ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey
}

/** Shift+F10 或 ContextMenu 键 → 打开结构菜单（与鼠标同一套，UX-S09） */
export function isMenuKey(ev: KeyLike): boolean {
  return (ev.key === 'F10' && ev.shiftKey && !ev.ctrlKey && !ev.metaKey) || ev.key === 'ContextMenu'
}

/** Esc → 退出整行/列选择（structuralSelection 存在时） */
export function isExitStructuralKey(ev: KeyLike): boolean {
  return ev.key === 'Escape'
}
