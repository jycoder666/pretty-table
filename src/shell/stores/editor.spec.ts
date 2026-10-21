import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { COMPARE_ALPHA_V1, cloneInstance } from '@/core'
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
