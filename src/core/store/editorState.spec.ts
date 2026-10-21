import { describe, expect, it } from 'vitest'
import { COMPARE_ALPHA_V1, BLANK_V1 } from '../templates'
import {
  createEditorState,
  dispatch,
  undo,
  redo,
  canUndo,
  canRedo,
  replaceCurrent,
  type DispatchOptions,
} from './editorState'
import { UNDO_LIMITS, type EditorState, type EditIntent } from '../types'
import { cloneInstance } from '../schema/validate'
import { snapshotForUndo } from '../schema/clone'

describe('editorState Fill path', () => {
  it('setSlot updates and undo restores', () => {
    const state = createEditorState(cloneInstance(COMPARE_ALPHA_V1))
    const r = dispatch(state, { kind: 'setSlot', slotId: 'obj.name.a', value: '测试方案' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(canUndo(r.value)).toBe(true)
    const undone = undo(r.value)
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
  state: EditorState,
  slotId: string,
  full: string,
): EditorState {
  let s = state
  for (let i = 1; i <= full.length; i++) {
    const opts: DispatchOptions = i === 1 ? { beginTextSession: true } : { coalesceUndo: true }
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
    const u1 = undo(s)
    expect(u1.current.slots['row.4.val.a']).toEqual(before)
    expect(canUndo(u1)).toBe(false)
  })

  it('编辑 A 槽 → 编辑 B 槽：一步回到 B 编辑前（A 保留），再一步回到 A 编辑前', () => {
    const s0 = createEditorState(cloneInstance(COMPARE_ALPHA_V1))
    const aBefore = s0.current.slots['row.4.val.a']
    const bBefore = s0.current.slots['row.3.val.a']
    const sA = typeText(s0, 'row.4.val.a', '甲甲甲甲')
    const sB = typeText(sA, 'row.3.val.a', '乙乙乙')
    const u1 = undo(sB)
    expect(u1.current.slots['row.3.val.a']).toEqual(bBefore)
    expect(u1.current.slots['row.4.val.a']).toEqual(sA.current.slots['row.4.val.a'])
    const u2 = undo(u1)
    expect(u2.current.slots['row.4.val.a']).toEqual(aBefore)
    expect(canUndo(u2)).toBe(false)
  })

  it('非文字操作（换主题）照旧各算一步：逐步退回主题与文字', () => {
    const s0 = createEditorState(cloneInstance(COMPARE_ALPHA_V1))
    const textBefore = s0.current.slots['row.4.val.a']
    const sA = typeText(s0, 'row.4.val.a', 'abcde')
    const r = dispatch(sA, { kind: 'setTheme', themeId: 'T-B' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const u1 = undo(r.value)
    expect(u1.current.themeId).toBe('T-A')
    const u2 = undo(u1)
    expect(u2.current.slots['row.4.val.a']).toEqual(textBefore)
    expect(canUndo(u2)).toBe(false)
  })

  it('默认 dispatch（不传 opts）每次各算一步：undo 逐步回退', () => {
    const s0 = createEditorState(cloneInstance(COMPARE_ALPHA_V1))
    const before = s0.current.slots['row.4.val.a']
    const r1 = dispatch(s0, { kind: 'setSlot', slotId: 'row.4.val.a', value: 'x' })
    const r2 = dispatch(r1.ok ? r1.value : s0, { kind: 'setSlot', slotId: 'row.4.val.a', value: 'xy' })
    expect(r2.ok).toBe(true)
    if (!r2.ok) return
    const u1 = undo(r2.value)
    expect(u1.current.slots['row.4.val.a']).toEqual({ text: 'x' })
    const u2 = undo(u1)
    expect(u2.current.slots['row.4.val.a']).toEqual(before)
    expect(canUndo(u2)).toBe(false)
  })
})

describe('editorState · E3 多次撤销（快照栈 50 深 + 重做）', () => {
  it('连做 5 类不同意图：逐步 undo 精确回退（行数 / 主题 / blocks / merges / 槽值）', () => {
    let s: EditorState = createEditorState(cloneInstance(COMPARE_ALPHA_V1))
    const s0 = s
    const originalSlot = snapshotForUndo(s.current.slots['row.4.val.a'])
    const r1 = dispatch(s, { kind: 'setSlot', slotId: 'row.4.val.a', value: '新内容' })
    expect(r1.ok).toBe(true)
    const s1 = r1.ok ? r1.value : s
    const r2 = dispatch(s1, { kind: 'setTheme', themeId: 'T-B' })
    expect(r2.ok).toBe(true)
    const s2 = r2.ok ? r2.value : s1
    const r3 = dispatch(s2, {
      kind: 'addBlock',
      block: { id: 'b-e3', type: 'sectionBar', slotId: 'gap-g1', props: { label: 'E3' } },
    })
    expect(r3.ok).toBe(true)
    const s3 = r3.ok ? r3.value : s2
    const r4 = dispatch(s3, { kind: 'addRow' })
    expect(r4.ok).toBe(true)
    const s4 = r4.ok ? r4.value : s3
    const rows4 = s4.current.layout.slotGrid!.length
    const r5 = dispatch(s4, { kind: 'merge', range: { start: [3, 2], end: [3, 3] } })
    expect(r5.ok).toBe(true)
    s = r5.ok ? r5.value : s4
    expect(s.current.layout.merges).toContainEqual({ start: [3, 2], end: [3, 3] })

    // undo 5：拆掉合并
    const u5 = undo(s)
    expect(u5.current.layout.merges).not.toContainEqual({ start: [3, 2], end: [3, 3] })
    // undo 4：行数回退
    const u4 = undo(u5)
    expect(u4.current.layout.slotGrid!.length).toBe(rows4 - 1)
    // undo 3：区块消失
    const u3 = undo(u4)
    expect(u3.current.blocks.some((b) => b.id === 'b-e3')).toBe(false)
    // undo 2：主题回 T-A
    const u2 = undo(u3)
    expect(u2.current.themeId).toBe('T-A')
    // undo 1：槽值回原文
    const u1 = undo(u2)
    expect(u1.current.slots['row.4.val.a']).toEqual(originalSlot)
    expect(u1.current).toEqual(s0.current)
    // 到底
    expect(canUndo(u1)).toBe(false)
  })

  it('redo 对称恢复：undo 全程逐步 redo 可原样走回，redo 到底 canRedo=false', () => {
    let s: EditorState = createEditorState(cloneInstance(COMPARE_ALPHA_V1))
    const steps: EditorState[] = [s]
    const intents: EditIntent[] = [
      { kind: 'setSlot', slotId: 'row.4.val.a', value: '内容A' },
      { kind: 'setTheme', themeId: 'T-C' },
      { kind: 'addRow' },
      { kind: 'setColWidth', col: 1, width: 200 },
    ]
    for (const intent of intents) {
      const r = dispatch(s, intent)
      expect(r.ok).toBe(true)
      s = r.ok ? r.value : s
      steps.push(s)
    }
    // 一路 undo 到底
    let u = s
    for (let i = 0; i < intents.length; i++) u = undo(u)
    expect(u.current).toEqual(steps[0]!.current)
    expect(canUndo(u)).toBe(false)
    // 一路 redo，每步与 undo 前的状态一致
    let rState = u
    for (let i = 1; i < steps.length; i++) {
      rState = redo(rState)
      expect(rState.current).toEqual(steps[i]!.current)
      expect(canUndo(rState)).toBe(true)
    }
    expect(canRedo(rState)).toBe(false)
  })

  it('undo 后做新操作：redoStack 清空（分支不可重做）', () => {
    const s0 = createEditorState(cloneInstance(COMPARE_ALPHA_V1))
    const r1 = dispatch(s0, { kind: 'setSlot', slotId: 'row.4.val.a', value: '甲' })
    const s1 = r1.ok ? r1.value : s0
    const r2 = dispatch(s1, { kind: 'setSlot', slotId: 'row.4.val.a', value: '乙' })
    const s2 = r2.ok ? r2.value : s1
    const u1 = undo(s2)
    expect(canRedo(u1)).toBe(true)
    // 新操作 → redo 链断
    const r3 = dispatch(u1, { kind: 'setTheme', themeId: 'T-C' })
    expect(r3.ok).toBe(true)
    if (!r3.ok) return
    expect(canRedo(r3.value)).toBe(false)
    // 但撤销链保留：还能退到撤销后的「甲」（新主题操作的那条快照）
    expect(canUndo(r3.value)).toBe(true)
    const u2 = undo(r3.value)
    expect(u2.current.slots['row.4.val.a']).toEqual({ text: '甲' })
  })

  it('同槽连续 10 次 setSlotText（coalesce）只退 1 步：undo 一步回输入前', () => {
    const s0 = createEditorState(cloneInstance(COMPARE_ALPHA_V1))
    const before = s0.current.slots['row.4.val.a']
    // 第一次 beginTextSession + 9 次 coalesceUndo（模拟 10 键会话）
    let s = s0
    for (let i = 1; i <= 10; i++) {
      const opts: DispatchOptions = i === 1 ? { beginTextSession: true } : { coalesceUndo: true }
      const r = dispatch(s, { kind: 'setSlot', slotId: 'row.4.val.a', value: '字'.repeat(i) }, opts)
      expect(r.ok).toBe(true)
      s = r.ok ? r.value : s
    }
    expect(s.undoStack).toHaveLength(1)
    const u1 = undo(s)
    expect(u1.current.slots['row.4.val.a']).toEqual(before)
    expect(canUndo(u1)).toBe(false)
  })

  it('跨槽 beginTextSession 退 2 步：A 槽会话 → B 槽会话，各自一步', () => {
    const s0 = createEditorState(cloneInstance(COMPARE_ALPHA_V1))
    const aBefore = s0.current.slots['row.4.val.a']
    const bBefore = s0.current.slots['row.3.val.a']
    const sA = typeText(s0, 'row.4.val.a', '甲乙丙')
    const sB = typeText(sA, 'row.3.val.a', '丁戊')
    expect(sB.undoStack).toHaveLength(2)
    const u1 = undo(sB)
    expect(u1.current.slots['row.3.val.a']).toEqual(bBefore)
    const u2 = undo(u1)
    expect(u2.current.slots['row.4.val.a']).toEqual(aBefore)
    expect(canUndo(u2)).toBe(false)
  })

  it(`栈深 ${UNDO_LIMITS.maxDepth}：第 51 次操作裁掉最旧一条（undo 到底 = 第 1 次操作后状态）`, () => {
    let s: EditorState = createEditorState(cloneInstance(BLANK_V1))
    const firstSlotId = 'u7'
    const originalFirst = snapshotForUndo(s.current.slots[firstSlotId])
    for (let i = 0; i < UNDO_LIMITS.maxDepth + 1; i++) {
      const r = dispatch(s, { kind: 'setSlot', slotId: firstSlotId, value: `第${i}步` })
      expect(r.ok).toBe(true)
      s = r.ok ? r.value : s
    }
    expect(s.undoStack).toHaveLength(UNDO_LIMITS.maxDepth)
    // 退 50 步 = 栈底快照 = 第 1 次操作前（第 0 步之后）……栈底是最早被保留的快照，
    // 即第 1 次操作（i=0）前的状态 → 最旧的「原始状态」快照已被裁掉
    let u = s
    for (let i = 0; i < UNDO_LIMITS.maxDepth; i++) u = undo(u)
    expect(canUndo(u)).toBe(false)
    expect(u.current.slots[firstSlotId]).toEqual({ text: '第0步' })
    expect(u.current.slots[firstSlotId]).not.toEqual(originalFirst)
  })

  it('undo 到底 canUndo=false，redo 到顶 canRedo=false（单意图边角）', () => {
    const s0 = createEditorState(cloneInstance(COMPARE_ALPHA_V1))
    expect(canUndo(s0)).toBe(false)
    expect(canRedo(s0)).toBe(false)
    const r = dispatch(s0, { kind: 'setTheme', themeId: 'T-B' })
    const s1 = r.ok ? r.value : s0
    const u = undo(s1)
    expect(canUndo(u)).toBe(false)
    expect(canRedo(u)).toBe(true)
    const rd = redo(u)
    expect(canRedo(rd)).toBe(false)
    expect(rd.current.themeId).toBe('T-B')
  })

  it('undo/redo 保留 dirty=true 与 version 递增（壳层 beforeunload 语义不回退）', () => {
    const s0 = createEditorState(cloneInstance(COMPARE_ALPHA_V1))
    const r = dispatch(s0, { kind: 'setTheme', themeId: 'T-B' })
    const s1 = r.ok ? r.value : s0
    const u = undo(s1)
    expect(u.dirty).toBe(true)
    expect(u.version).toBe(s1.version + 1)
    const rd = redo(u)
    expect(rd.version).toBe(u.version + 1)
  })

  it('图片引用共享：设图 → 多次其他编辑 → 栈中各快照 image 槽与 current 共享同一 data URL（防回归成深拷贝）', () => {
    const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
    const s0 = createEditorState(cloneInstance(BLANK_V1))
    const rImg = dispatch(s0, { kind: 'setSlot', slotId: 'u7', value: { image: IMG } })
    expect(rImg.ok).toBe(true)
    const withImg = rImg.ok ? rImg.value : s0
    // 再做 3 次与图片无关的编辑（每次 push 一条含图快照）
    let s = withImg
    for (let i = 0; i < 3; i++) {
      const r = dispatch(s, { kind: 'setSlot', slotId: 'u8', value: `文字${i}` })
      expect(r.ok).toBe(true)
      s = r.ok ? r.value : s
    }
    const curImg = (s.current.slots['u7'] as { image: string }).image
    // 栈底那条是「设图前」快照（u7 还是文字空槽）；设图后的 3 条快照都应共享同一 data URL
    const withImageSnaps = s.undoStack.filter(
      (snap) => typeof snap.slots['u7'] === 'object' && snap.slots['u7'] !== null && 'image' in (snap.slots['u7'] as object),
    )
    expect(withImageSnaps).toHaveLength(3)
    for (const snap of withImageSnaps) {
      const slot = snap.slots['u7'] as { image: string }
      expect(slot.image).toBe(curImg)
      expect(slot).toMatchObject({ image: IMG })
      // 浅拷贝约定：快照里的槽对象不是 current 的同一个引用，但 image 字符串共享
      expect(slot).not.toBe(s.current.slots['u7'])
    }
    // 撤销多步后图片槽值不丢（引用共享的语义保证）
    let u = s
    for (let i = 0; i < 3; i++) u = undo(u)
    expect((u.current.slots['u7'] as { image: string }).image).toBe(IMG)
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
      const u = undo(r.value)
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
  it('pastePending=true 时 undo()/redo() 均 no-op：状态与双栈原样（FR-17）', () => {
    const s0 = createEditorState(cloneInstance(BLANK_V1))
    const r = dispatch(s0, { kind: 'setRowHeightTier', tier: 2 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const withPending: EditorState = { ...r.value, pastePending: true }
    expect(undo(withPending)).toBe(withPending)
    // 手动构造 redo 非空（undo 被锁时无法自然产生），redo 同样 no-op
    const withRedo: EditorState = { ...withPending, redoStack: [withPending.current] }
    expect(redo(withRedo)).toBe(withRedo)
  })

  it('replaceCurrent 清空撤销与重做栈（恢复草稿 / 替换模板不继承历史）', () => {
    const s0 = createEditorState(cloneInstance(COMPARE_ALPHA_V1))
    const r = dispatch(s0, { kind: 'setTheme', themeId: 'T-B' })
    const s1 = r.ok ? r.value : s0
    const u = undo(s1)
    expect(canRedo(u)).toBe(true)
    const replaced = replaceCurrent(u, cloneInstance(BLANK_V1), true)
    expect(replaced.undoStack).toHaveLength(0)
    expect(replaced.redoStack).toHaveLength(0)
    expect(replaced.dirty).toBe(true)
    expect(canUndo(replaced)).toBe(false)
    expect(canRedo(replaced)).toBe(false)
  })

  it('createEditorState 双栈为空', () => {
    const s = createEditorState(cloneInstance(BLANK_V1))
    expect(s.undoStack).toEqual([])
    expect(s.redoStack).toEqual([])
  })
})
