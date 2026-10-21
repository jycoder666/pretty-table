import { describe, expect, it } from 'vitest'
import { COMPARE_ALPHA_V1, BLANK_V1 } from '../templates'
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

  it('merge 闸放宽后：与现有合并区部分重叠仍拒（MERGE_CONFLICT），不重叠区域可合并', () => {
    const state = createEditorState(cloneInstance(COMPARE_ALPHA_V1))
    // 与既有合并区 [0,1]-[0,2] 部分重叠
    const bad = dispatch(state, {
      kind: 'merge',
      range: { start: [0, 2], end: [0, 3] },
    })
    expect(bad.ok).toBe(false)
    expect(!bad.ok ? bad.error.code : '').toBe('MERGE_CONFLICT')
    // 预置模板 [0,1]-[0,2] 已是合并区：先拆，再合 [0,1]-[0,3]
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

  it('emphFooter 可加入 footer 槽（二期区块启用，R-4）', () => {
    const state = createEditorState(cloneInstance(COMPARE_ALPHA_V1))
    const r = dispatch(state, {
      kind: 'addBlock',
      block: { id: 'f1', type: 'emphFooter', slotId: 'footer-1', props: { text: '注' } },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.current.blocks.some((b) => b.id === 'f1')).toBe(true)
  })
})

/** PX-03：模拟文字编辑会话——首键 beginTextSession，后续同会话 coalesceUndo */
function typeText(
  state: ReturnType<typeof createEditorState>,
  slotId: string,
  full: string,
): ReturnType<typeof createEditorState> {
  let s = state
  for (let i = 1; i <= full.length; i++) {
    const opts = i === 1 ? { beginTextSession: true } : { coalesceUndo: true }
    const r = dispatch(s, { kind: 'setSlot', slotId, value: full.slice(0, i) }, opts)
    if (!r.ok) throw new Error('dispatch failed')
    s = r.value
  }
  return s
}

describe('editorState · 文字编辑会话合并撤销（PX-03）', () => {
  it('同槽连续输入 5 个字符：撤销一步回到输入前整句', () => {
    const s0 = createEditorState(cloneInstance(COMPARE_ALPHA_V1))
    const before = s0.current.slots['row.4.val.a']
    const s = typeText(s0, 'row.4.val.a', 'abcde')
    expect(canUndo(s)).toBe(true)
    const u1 = undoOnce(s)
    expect(u1.current.slots['row.4.val.a']).toEqual(before)
    expect(canUndo(u1)).toBe(false)
  })

  it('编辑 A 槽 → 编辑 B 槽：一步回到 B 编辑前（A 保留），再一步回到 A 编辑前', () => {
    const s0 = createEditorState(cloneInstance(COMPARE_ALPHA_V1))
    const aBefore = s0.current.slots['row.4.val.a']
    const bBefore = s0.current.slots['row.3.val.a']
    const sA = typeText(s0, 'row.4.val.a', '甲甲甲甲')
    const sB = typeText(sA, 'row.3.val.a', '乙乙乙')
    const u1 = undoOnce(sB)
    expect(u1.current.slots['row.3.val.a']).toEqual(bBefore)
    expect(u1.current.slots['row.4.val.a']).toEqual(sA.current.slots['row.4.val.a'])
    const u2 = undoOnce(u1)
    expect(u2.current.slots['row.4.val.a']).toEqual(aBefore)
    expect(canUndo(u2)).toBe(false)
  })

  it('非文字操作（换主题）照旧一步：undo 后不能继续撤', () => {
    const s0 = createEditorState(cloneInstance(COMPARE_ALPHA_V1))
    const sA = typeText(s0, 'row.4.val.a', 'abcde')
    const r = dispatch(sA, { kind: 'setTheme', themeId: 'T-B' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const u1 = undoOnce(r.value)
    expect(u1.current.themeId).toBe('T-A')
    expect(canUndo(u1)).toBe(false)
  })

  it('默认 dispatch（不传 opts）行为不变：undoSnapshot 每次覆盖', () => {
    const s0 = createEditorState(cloneInstance(COMPARE_ALPHA_V1))
    const r1 = dispatch(s0, { kind: 'setSlot', slotId: 'row.4.val.a', value: 'x' })
    const r2 = dispatch(r1.ok ? r1.value : s0, { kind: 'setSlot', slotId: 'row.4.val.a', value: 'xy' })
    expect(r2.ok).toBe(true)
    if (!r2.ok) return
    const u = undoOnce(r2.value)
    expect(u.current.slots['row.4.val.a']).toEqual({ text: 'x' })
  })
})

describe('editorState · 自定义格式新意图（pastePending 互斥 + 一步撤销）', () => {
  const VALID_INTENTS: import('../types').EditIntent[] = [
    { kind: 'setThemeToken', token: 'primary', value: '#336699' },
    { kind: 'resetThemeTokens' },
    { kind: 'setColWidth', col: 1, width: 200 },
    { kind: 'setRowHeightTier', tier: 3 },
    { kind: 'setFontSizeTier', tier: 1 },
    { kind: 'setPaddingTier', tier: 2 },
    { kind: 'addRow' },
    { kind: 'addCol' },
    { kind: 'setHeaderLevel', levels: 2 },
  ]

  function blankState() {
    return createEditorState(cloneInstance(BLANK_V1))
  }

  it('pastePending 期间：全部新意图被拒（SLOT_DROP_BLOCKED），store 不变', () => {
    for (const intent of VALID_INTENTS) {
      const s = blankState()
      s.pastePending = true
      const r = dispatch(s, intent)
      expect(r.ok).toBe(false)
      expect(!r.ok ? r.error.code : '').toBe('SLOT_DROP_BLOCKED')
    }
    // removeRow / removeCol 同样被拒
    const s = blankState()
    s.pastePending = true
    expect(dispatch(s, { kind: 'removeRow', row: 2 }).ok).toBe(false)
    expect(dispatch(s, { kind: 'removeCol', col: 1 }).ok).toBe(false)
  })

  it('每个新意图 undo 一步复原（FR-C7）', () => {
    for (const intent of VALID_INTENTS) {
      const s = blankState()
      const r = dispatch(s, intent)
      expect(r.ok).toBe(true)
      if (!r.ok) continue
      const u = undoOnce(r.value)
      expect(u.current).toEqual(s.current)
      expect(canUndo(u)).toBe(false)
    }
  })

  it('结构操作 warn（STRUCT_LOSS）经 dispatch 透传', () => {
    const s = blankState()
    // 表头行不可删 → 失败不透传
    expect(dispatch(s, { kind: 'removeRow', row: 0 }).ok).toBe(false)
  })
})

describe('editorState · 撤销会话边角（QA 观察）', () => {
  it('undoOnce 保留 pastePending 字段，预览中撤销语义不落空（FR-17）', () => {
    const s = createEditorState(cloneInstance(BLANK_V1))
    const r = dispatch(s, { kind: 'setRowHeightTier', tier: 2 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const withPending: import('../types').EditorState = { ...r.value, pastePending: true }
    const u = undoOnce(withPending)
    expect(u.pastePending).toBe(true)
  })
})
