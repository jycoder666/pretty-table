/**
 * PX-13：撤销快捷键（Ctrl/Cmd+Z，单步撤销）判定。
 * 纯函数，便于 jsdom 单测；EditorPage 层 window keydown 调用，不全局污染其他页面。
 * 拦截口径（与既有禁撤销状态同源）：
 * - 输入框聚焦（INPUT/TEXTAREA/SELECT/可编辑元素）→ 交给浏览器原生文本撤销，不触发表格撤销
 * - 粘贴预览期（pastePending）→ 禁撤销（FR-17：预览未决时一切状态变更被锁）
 * - 撤销链空（undoEnabled=false）→ 无事可撤
 * 重做（Ctrl/Cmd+Shift+Z / Ctrl+Y）不在本期范围：撤销链深 = 1，只接单步撤销。
 */

export interface UndoHotkeyGate {
  /** 撤销当前是否可用（store.undoEnabled） */
  undoEnabled: boolean
  /** 粘贴预览期（store.pastePending） */
  pastePending: boolean
}

/** 是否为单步撤销键：Ctrl/Cmd+Z（Shift / Alt 组合不算，重做未实现） */
export function isUndoHotkey(e: KeyboardEvent): boolean {
  return (
    e.key.toLowerCase() === 'z' &&
    (e.ctrlKey || e.metaKey) &&
    !e.shiftKey &&
    !e.altKey
  )
}

/** 焦点在可输入元素上时不拦截（原生文本撤销优先） */
export function isTextEntryTarget(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  // isContentEditable 定义在 HTMLElement；用 === true 收口：jsdom 下该属性可能缺失（undefined）
  return (
    tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable === true
  )
}

/** 综合 gate 判定：此次按键是否应触发一次表格撤销 */
export function shouldUndo(
  e: KeyboardEvent,
  gate: UndoHotkeyGate,
  activeEl: Element | null = document.activeElement,
): boolean {
  if (!isUndoHotkey(e)) return false
  if (isTextEntryTarget(activeEl)) return false
  if (gate.pastePending) return false
  return gate.undoEnabled
}
