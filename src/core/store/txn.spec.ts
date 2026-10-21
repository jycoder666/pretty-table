import { describe, expect, it } from 'vitest'
import { createEditorState, dispatch, undo, redo, canRedo } from './editorState'
import { createStoreTxn } from './txn'
import { cloneInstance } from '../schema/validate'
import { COMPARE_ALPHA_V1 } from '../templates'
import type { EditorState, SlotValue, TemplateInstance } from '../types'

let state: EditorState
let setCalls = 0

const get = () => state
const set = (s: EditorState) => {
  setCalls += 1
  state = s
}

function planOf(writes: { slotId: string; value: SlotValue }[], baseVersion: number) {
  return {
    anchor: [2, 1] as [number, number],
    size: { h: 1, w: 1 },
    cells: writes.map((w, i) => ({ row: 2, col: 1 + i, slotId: w.slotId, raw: '', kind: 'value' as const })),
    baseVersion,
    writes,
    notices: [],
  }
}

function pasteFixture(): TemplateInstance {
  return cloneInstance(COMPARE_ALPHA_V1)
}

describe('StoreTxn（设计增量 §2.4 / FR-19）', () => {
  it('21. baseVersion ≠ 当前 version → PASTE_STALE，state 不变', () => {
    state = createEditorState(pasteFixture())
    const before = cloneInstance(state.current)
    const txn = createStoreTxn(get, set)
    const r = txn.applyBatch(
      planOf([{ slotId: 'row.3.val.a', value: { text: '24 小时' } }], state.version + 1),
    )
    expect(r.ok).toBe(false)
    expect(r.ok ? '' : r.code).toBe('PASTE_STALE')
    expect(cloneInstance(state.current)).toEqual(before)
  })

  it('22. 成功 → 一次 commit、version+1、撤销栈入粘贴前快照、一次撤销回到粘贴前', () => {
    state = createEditorState(pasteFixture())
    const before = cloneInstance(state.current)
    const txn = createStoreTxn(get, set)
    const r = txn.applyBatch(
      planOf(
        [
          { slotId: 'row.3.val.a', value: { text: '24 小时' } },
          { slotId: 'row.3.val.b', value: { text: '8 小时' } },
        ],
        state.version,
      ),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.version).toBe(1)
    expect(state.version).toBe(1)
    expect(state.current.slots['row.3.val.a']).toEqual({ text: '24 小时' })
    expect(state.current.slots['row.3.val.b']).toEqual({ text: '8 小时' })
    const undone = undo(state)
    expect(undone.current).toEqual(before)
  })

  it('23. 写副本过程中抛错（注入 throw）→ PASTE_COMMIT_FAILED，state 与原对象深相等', () => {
    state = createEditorState(pasteFixture())
    setCalls = 0
    const before = cloneInstance(state.current)
    const evil: SlotValue = {
      get text(): string {
        throw new Error('boom')
      },
    } as unknown as SlotValue
    const txn = createStoreTxn(get, set)
    const r = txn.applyBatch(planOf([{ slotId: 'row.3.val.a', value: evil }], state.version))
    expect(r.ok).toBe(false)
    expect(r.ok ? '' : r.code).toBe('PASTE_COMMIT_FAILED')
    expect(setCalls).toBe(0)
    expect(cloneInstance(state.current)).toEqual(before)
  })

  it('24. writes 若改动 layout/blocks/themeId → 视为实现错误回滚', () => {
    state = createEditorState(pasteFixture())
    setCalls = 0
    // 注入：toJSON 在克隆/序列化时篡改 layout（模拟实现错误）→ 结构守卫必须拦截且不提交
    const evil = {
      text: 'x',
      toJSON() {
        state.current.layout.rowCount = 99
        return 'x'
      },
    }
    const txn = createStoreTxn(get, set)
    const r = txn.applyBatch(
      planOf([{ slotId: 'row.3.val.a', value: evil as unknown as SlotValue }], state.version),
    )
    expect(r.ok).toBe(false)
    expect(r.ok ? '' : r.code).toBe('PASTE_COMMIT_FAILED')
    expect(setCalls).toBe(0) // 未 commit，store 未被事务替换
    state.current.layout.rowCount = 10 // 还原注入污染（注入本身在事务之外）
  })

  it('25. pastePending=true 期间 dispatch 合并/拆分/对齐/强调/addBlock → 被拒，state 不变', () => {
    state = createEditorState(pasteFixture())
    state = { ...state, pastePending: true }
    const before = cloneInstance(state.current)
    const intents = [
      { kind: 'merge' as const, range: { start: [3, 1] as [number, number], end: [3, 2] as [number, number] } },
      { kind: 'split' as const, range: { start: [0, 1] as [number, number], end: [0, 2] as [number, number] } },
      { kind: 'setAlign' as const, slotId: 'row.3.val.a', align: 'right' as const },
      { kind: 'setEmphasis' as const, slotId: 'row.3.val.a', emphasize: ['bold'] as never },
      {
        kind: 'addBlock' as const,
        block: { id: 'x', type: 'sectionBar' as const, slotId: 'gap-g2', props: {} },
      },
    ]
    for (const intent of intents) {
      const r = dispatch(state, intent)
      expect(r.ok).toBe(false)
    }
    expect(cloneInstance(state.current)).toEqual(before)
  })
})

describe('StoreTxn · E3 多次撤销（整次粘贴一步）', () => {
  it('粘贴 5 格：undo 一步回到粘贴前（整批一条快照）', () => {
    state = createEditorState(pasteFixture())
    const before = cloneInstance(state.current)
    const txn = createStoreTxn(get, set)
    const r = txn.applyBatch(
      planOf(
        [
          { slotId: 'row.3.val.a', value: { text: '一' } },
          { slotId: 'row.3.val.b', value: { text: '二' } },
          { slotId: 'row.3.val.c', value: { text: '三' } },
          { slotId: 'row.4.val.a', value: { text: '四' } },
          { slotId: 'row.4.val.b', value: { text: '五' } },
        ],
        state.version,
      ),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(state.undoStack).toHaveLength(1)
    const undone = undo(state)
    expect(undone.current).toEqual(before)
    expect(canRedo(undone)).toBe(true)
  })

  it('粘贴前已有撤销历史：粘贴 push 一条 + redoStack 清空；粘贴→undo→redo 恢复粘贴后状态', () => {
    state = createEditorState(pasteFixture())
    // 粘贴前先做一步普通编辑（产生撤销历史）
    const pre = dispatch(state, { kind: 'setTheme', themeId: 'T-B' })
    expect(pre.ok).toBe(true)
    state = pre.ok ? pre.value : state
    const afterTheme = cloneInstance(state.current)
    // 再撤销一步 → redoStack 非空
    state = undo(state)
    expect(state.current).toEqual(cloneInstance(createEditorState(pasteFixture()).current))
    expect(canRedo(state)).toBe(true)
    // 回到换主题后的状态再粘贴
    state = redo(state)
    expect(cloneInstance(state.current)).toEqual(afterTheme)
    const txn = createStoreTxn(get, set)
    const r = txn.applyBatch(
      planOf(
        [
          { slotId: 'row.3.val.a', value: { text: '甲' } },
          { slotId: 'row.3.val.b', value: { text: '乙' } },
        ],
        state.version,
      ),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // 粘贴清空 redoStack（新分支）
    expect(state.redoStack).toHaveLength(0)
    expect(canRedo(state)).toBe(false)
    const afterPaste = cloneInstance(state.current)
    // 粘贴 → undo → redo：恢复粘贴后状态
    const undone = undo(state)
    expect(undone.current).toEqual(afterTheme)
    const redone = redo(undone)
    expect(redone.current).toEqual(afterPaste)
  })
})
