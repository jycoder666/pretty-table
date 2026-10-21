import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { BLANK_V1, COMPARE_ALPHA_V1, cloneInstance } from '@/core'
import { useEditorStore } from './editor'

/**
 * 撤销会话两处边角（QA 观察）：
 * 1. 粘贴预览中 undo() 被禁（FR-17），state 原样、pastePreview 保留；
 * 2. cancelPaste 重置文字编辑会话，取消预览后的输入不与预览前编辑合并撤销。
 */

async function setup() {
  const store = useEditorStore()
  store.openTemplate(cloneInstance(COMPARE_ALPHA_V1))
  return store
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('editor store · 粘贴预览与撤销会话边角（QA 观察）', () => {
  it('粘贴预览中 undo() 被禁：state 不变、pastePreview 保留', async () => {
    const store = await setup()
    store.selectedSlotId = 'row.4.val.a'
    const started = store.pasteStart({ text: '甲\t乙' })
    expect(started).toBe(true)
    expect(store.pastePending).toBe(true)
    expect(store.pastePreview).not.toBeNull()
    const before = JSON.stringify(store.state?.current)
    const versionBefore = store.state?.version
    store.undo()
    expect(JSON.stringify(store.state?.current)).toBe(before)
    expect(store.state?.version).toBe(versionBefore)
    expect(store.pastePreview).not.toBeNull()
  })

  it('cancelPaste 重置文字会话：取消预览后继续输入，撤销一步回到取消前', async () => {
    const store = await setup()
    store.selectedSlotId = 'row.4.val.a'
    // 会话 1：输入「第一段」
    store.setSlotText('row.4.val.a', '第一段')
    // 进入粘贴预览再取消
    const started = store.pasteStart({ text: '甲\t乙' })
    expect(started).toBe(true)
    store.cancelPaste()
    expect(store.pastePending).toBe(false)
    // 会话 2：继续输入——应另起一步撤销，不与会话 1 合并
    store.setSlotText('row.4.val.a', '第一段第二段')
    store.undo()
    expect(store.current?.slots['row.4.val.a']).toMatchObject({ text: '第一段' })
    store.undo()
    expect(store.current?.slots['row.4.val.a']).toBe('全国') // 回到输入前整句
  })
})

describe('editor store · 核内 warn 聚合 toast（T04）', () => {
  it('无 warn 的意图不弹 toast；结构损失聚合为一条白话提示', () => {
    const store = useEditorStore()
    store.openTemplate(cloneInstance(BLANK_V1))
    const merged = store.apply({ kind: 'merge', range: { start: [1, 0], end: [1, 1] } })
    expect(merged).toBe(true)
    expect(store.toast).toBeNull()
    // 升 3 层后在第 2、3 层同列各放文字，再降回 1 层 → 只能并入一处，另一处放不下
    store.apply({ kind: 'setHeaderLevel', levels: 3 })
    const grid = store.current!.layout.slotGrid!
    store.setSlotText(grid[1]![0]!, '甲层')
    store.setSlotText(grid[2]![0]!, '乙层')
    const dropped = store.apply({ kind: 'setHeaderLevel', levels: 1 })
    expect(dropped).toBe(true)
    expect(store.toast).toContain('合并或内容')
  })

  it('核内拒绝（达上限）弹对应错误文案，store 不变', () => {
    const store = useEditorStore()
    store.openTemplate(cloneInstance(BLANK_V1))
    for (let i = 0; i < 15; i++) store.apply({ kind: 'addRow' })
    expect(store.current?.layout.slotGrid?.length).toBe(20)
    const versionBefore = store.state?.version
    const blocked = store.apply({ kind: 'addRow' })
    expect(blocked).toBe(false)
    expect(store.toast).toBe('最多 20 行，加不下了')
    expect(store.state?.version).toBe(versionBefore)
  })
})
