import { afterEach, describe, expect, it } from 'vitest'
import { isTextEntryTarget, isUndoHotkey, shouldUndo } from './undoHotkey'

/** 构造键盘事件（jsdom 不派发真实 Ctrl 组合，直接 new KeyboardEvent 断言判定） */
function keyEvent(init: {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}): KeyboardEvent {
  return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
}

let focused: HTMLElement | null = null

function focusEl(el: HTMLElement) {
  focused = el
  document.body.appendChild(el)
  el.focus()
  // jsdom 的 activeElement 对 tabindex 元素生效；input 原生可聚焦
}

afterEach(() => {
  focused?.remove()
  focused = null
})

describe('isUndoHotkey · 撤销键识别（PX-13）', () => {
  it('Ctrl+Z / Cmd+Z 命中', () => {
    expect(isUndoHotkey(keyEvent({ key: 'z', ctrlKey: true }))).toBe(true)
    expect(isUndoHotkey(keyEvent({ key: 'z', ctrlKey: true, shiftKey: false }))).toBe(true)
    expect(isUndoHotkey(keyEvent({ key: 'Z', ctrlKey: true }))).toBe(true)
    expect(isUndoHotkey(keyEvent({ key: 'z', metaKey: true }))).toBe(true)
  })

  it('Shift 组合（重做）/ Alt 组合 / 单键 z 不命中——本期只接单步撤销', () => {
    expect(isUndoHotkey(keyEvent({ key: 'z', ctrlKey: true, shiftKey: true }))).toBe(false)
    expect(isUndoHotkey(keyEvent({ key: 'z', metaKey: true, shiftKey: true }))).toBe(false)
    expect(isUndoHotkey(keyEvent({ key: 'z', ctrlKey: true, altKey: true }))).toBe(false)
    expect(isUndoHotkey(keyEvent({ key: 'z' }))).toBe(false)
    // Ctrl+Y 不绑定（重做不要求）
    expect(isUndoHotkey(keyEvent({ key: 'y', ctrlKey: true }))).toBe(false)
    // 其他 Ctrl 组合不误伤
    expect(isUndoHotkey(keyEvent({ key: 's', ctrlKey: true }))).toBe(false)
  })
})

describe('isTextEntryTarget · 输入焦点拦截', () => {
  it('INPUT / TEXTAREA 判为输入焦点（contentEditable 分支浏览器侧生效，jsdom 未实现）', () => {
    expect(isTextEntryTarget(document.createElement('input'))).toBe(true)
    expect(isTextEntryTarget(document.createElement('textarea'))).toBe(true)
    expect(isTextEntryTarget(document.createElement('button'))).toBe(false)
    expect(isTextEntryTarget(null)).toBe(false)
  })
})

describe('shouldUndo · 综合 gate（输入框聚焦 / 粘贴预览期 / 撤销链空）', () => {
  const enabledGate = { undoEnabled: true, pastePending: false }

  it('可用 + 无焦点拦截 → 撤销', () => {
    expect(shouldUndo(keyEvent({ key: 'z', ctrlKey: true }), enabledGate, null)).toBe(true)
  })

  it('输入框聚焦 → 不触发（原生文本撤销优先）', () => {
    const ta = document.createElement('textarea')
    focusEl(ta)
    expect(shouldUndo(keyEvent({ key: 'z', ctrlKey: true }), enabledGate, document.activeElement)).toBe(false)
  })

  it('粘贴预览期 → 禁撤销（FR-17 同源）', () => {
    expect(
      shouldUndo(keyEvent({ key: 'z', ctrlKey: true }), { undoEnabled: true, pastePending: true }, null),
    ).toBe(false)
  })

  it('撤销链空（undoEnabled=false）→ 不触发', () => {
    expect(
      shouldUndo(keyEvent({ key: 'z', ctrlKey: true }), { undoEnabled: false, pastePending: false }, null),
    ).toBe(false)
  })

  it('Ctrl+Shift+Z / Ctrl+Y 即便可用也不触发（重做未实现，不误吞按键）', () => {
    expect(
      shouldUndo(keyEvent({ key: 'z', ctrlKey: true, shiftKey: true }), enabledGate, null),
    ).toBe(false)
    expect(shouldUndo(keyEvent({ key: 'y', ctrlKey: true }), enabledGate, null)).toBe(false)
  })
})
