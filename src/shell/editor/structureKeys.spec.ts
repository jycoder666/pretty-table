import { describe, expect, it } from 'vitest'
import {
  isExitStructuralKey,
  isMenuKey,
  isSelectColKey,
  isSelectRowKey,
  type KeyLike,
} from './structureKeys'

/** 键事件构造（纯函数无 DOM 依赖，直接喂键位字段） */
function key(partial: Partial<KeyLike>): KeyLike {
  return {
    key: '',
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...partial,
  }
}

describe('structureKeys · 结构快捷键识别（A7 纯函数）', () => {
  it('Shift+Space → 整行；带 Ctrl/Cmd/Alt 时不算（避免与键入分支 / 浏览器快捷键互撞）', () => {
    expect(isSelectRowKey(key({ key: ' ', shiftKey: true }))).toBe(true)
    expect(isSelectRowKey(key({ key: ' ', shiftKey: true, ctrlKey: true }))).toBe(false)
    expect(isSelectRowKey(key({ key: ' ', shiftKey: true, metaKey: true }))).toBe(false)
    expect(isSelectRowKey(key({ key: ' ', shiftKey: true, altKey: true }))).toBe(false)
    expect(isSelectRowKey(key({ key: ' ' }))).toBe(false)
    expect(isSelectRowKey(key({ key: 'a', shiftKey: true }))).toBe(false)
  })

  it('Ctrl/Cmd+Space → 整列；Shift+Ctrl+Space 不算（归整行口径）', () => {
    expect(isSelectColKey(key({ key: ' ', ctrlKey: true }))).toBe(true)
    expect(isSelectColKey(key({ key: ' ', metaKey: true }))).toBe(true)
    expect(isSelectColKey(key({ key: ' ', ctrlKey: true, shiftKey: true }))).toBe(false)
    expect(isSelectColKey(key({ key: ' ', ctrlKey: true, altKey: true }))).toBe(false)
    expect(isSelectColKey(key({ key: ' ' }))).toBe(false)
  })

  it('Shift+F10 与 ContextMenu 键 → 菜单；Ctrl+Shift+F10 不算（让位浏览器/编辑台快捷键）', () => {
    expect(isMenuKey(key({ key: 'F10', shiftKey: true }))).toBe(true)
    expect(isMenuKey(key({ key: 'ContextMenu' }))).toBe(true)
    expect(isMenuKey(key({ key: 'F10' }))).toBe(false)
    expect(isMenuKey(key({ key: 'F10', shiftKey: true, ctrlKey: true }))).toBe(false)
    expect(isMenuKey(key({ key: 'F10', shiftKey: true, metaKey: true }))).toBe(false)
  })

  it('Esc → 退出整行/列选择', () => {
    expect(isExitStructuralKey(key({ key: 'Escape' }))).toBe(true)
    expect(isExitStructuralKey(key({ key: 'Esc' }))).toBe(false)
  })
})
