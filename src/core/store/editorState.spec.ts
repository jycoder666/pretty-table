import { describe, expect, it } from 'vitest'
import { COMPARE_ALPHA_V1 } from '../templates'
import { createEditorState, dispatch, undoOnce, canUndo } from './editorState'
import { cloneInstance } from '../schema/validate'

describe('editorState Fill path', () => {
  it('setSlot updates and undo restores', () => {
    const state = createEditorState(cloneInstance(COMPARE_ALPHA_V1))
    const r = dispatch(state, { kind: 'setSlot', slotId: 'obj.name.a', value: '测试方案' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(canUndo(r.value)).toBe(true)
    const undone = undoOnce(r.value)
    expect(canUndo(undone)).toBe(false)
  })

  it('theme switch to T-B', () => {
    const state = createEditorState(cloneInstance(COMPARE_ALPHA_V1))
    const r = dispatch(state, { kind: 'setTheme', themeId: 'T-B' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.current.themeId).toBe('T-B')
  })

  it('merge only in allowed zone', () => {
    const state = createEditorState(cloneInstance(COMPARE_ALPHA_V1))
    const bad = dispatch(state, {
      kind: 'merge',
      range: { start: [2, 1], end: [2, 2] },
    })
    expect(bad.ok).toBe(false)
    // 预置模板 [0,1]-[0,2] 已是合并区：先拆（失败则原状态），再合 [0,1]-[0,3]
    const pre = dispatch(state, {
      kind: 'split',
      range: { start: [0, 1], end: [0, 2] },
    })
    const base = pre.ok ? pre.value : state
    const good = dispatch(base, {
      kind: 'merge',
      range: { start: [0, 1], end: [0, 3] },
    })
    expect(good.ok).toBe(true)
  })

  it('cannot split structural merge', () => {
    const state = createEditorState(cloneInstance(COMPARE_ALPHA_V1))
    const r = dispatch(state, {
      kind: 'split',
      range: { start: [0, 0], end: [1, 0] },
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('MERGE_STRUCTURAL')
  })

  it('addBlock replace same slot', () => {
    const state = createEditorState(cloneInstance(COMPARE_ALPHA_V1))
    const r = dispatch(state, {
      kind: 'addBlock',
      block: {
        id: 'b-new',
        type: 'sectionBar',
        slotId: 'gap-g1',
        props: { label: '新分区' },
      },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const blocks = r.value.current.blocks.filter((b) => b.slotId === 'gap-g1')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.type).toBe('sectionBar')
  })

  it('rejects emphFooter in MVP', () => {
    const state = createEditorState(cloneInstance(COMPARE_ALPHA_V1))
    const r = dispatch(state, {
      kind: 'addBlock',
      block: { id: 'f1', type: 'emphFooter', slotId: 'footer-1', props: { text: '注' } },
    })
    expect(r.ok).toBe(false)
  })
})
