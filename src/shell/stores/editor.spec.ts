import { describe, expect, it, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { BLANK_V1, COMPARE_ALPHA_V1, cloneInstance } from '@/core'
import { useEditorStore } from './editor'

// 组件/ store 测试不碰真实 IndexedDB：草稿读写 mock 为空操作（恢复草稿用例按需覆写 loadDraft）
vi.mock('../repo/draftRepo', () => ({
  saveDraft: vi.fn<() => Promise<void>>(async () => {}),
  loadDraft: vi.fn<() => Promise<null>>(async () => null),
  clearDraft: vi.fn<() => Promise<void>>(async () => {}),
}))

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

  it('粘贴预览中 redo() 同样被禁：state 不变、pastePreview 保留（E3）', async () => {
    const store = await setup()
    // 先制造可重做状态：编辑 → 撤销
    store.setSlotText('row.4.val.a', '预演')
    store.undo()
    expect(store.redoEnabled).toBe(true)
    // 进入粘贴预览 → redo 被锁
    store.selectedSlotId = 'row.4.val.a'
    const started = store.pasteStart({ text: '甲\t乙' })
    expect(started).toBe(true)
    const before = JSON.stringify(store.state?.current)
    const versionBefore = store.state?.version
    store.redo()
    expect(JSON.stringify(store.state?.current)).toBe(before)
    expect(store.state?.version).toBe(versionBefore)
    expect(store.pastePreview).not.toBeNull()
    store.cancelPaste()
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

describe('editor store · E3 多次撤销与重做', () => {
  it('undoEnabled/redoEnabled 随操作翻转；多次撤销逐级回退、redo 对称恢复', () => {
    const store = useEditorStore()
    store.openTemplate(cloneInstance(COMPARE_ALPHA_V1))
    expect(store.undoEnabled).toBe(false)
    expect(store.redoEnabled).toBe(false)
    // 三步：文字 → 换主题 → 加行
    store.setSlotText('row.4.val.a', 'E3内容')
    expect(store.undoEnabled).toBe(true)
    store.setTheme('T-B')
    store.apply({ kind: 'addRow' })
    const rows = store.current!.layout.slotGrid!.length
    expect(rows).toBe(11)
    // undo ×3 逐级回退
    store.undo()
    expect(store.current!.layout.slotGrid!.length).toBe(10)
    expect(store.undoEnabled).toBe(true)
    store.undo()
    expect(store.current!.themeId).toBe('T-A')
    store.undo()
    expect(store.current?.slots['row.4.val.a']).toBe('全国')
    expect(store.undoEnabled).toBe(false)
    // redo ×3 对称恢复
    expect(store.redoEnabled).toBe(true)
    store.redo()
    expect(store.current?.slots['row.4.val.a']).toMatchObject({ text: 'E3内容' })
    store.redo()
    expect(store.current!.themeId).toBe('T-B')
    store.redo()
    expect(store.current!.layout.slotGrid!.length).toBe(11)
    expect(store.redoEnabled).toBe(false)
  })

  it('undo 后新操作断开重做链；多次撤销栈深随操作推进', () => {
    const store = useEditorStore()
    store.openTemplate(cloneInstance(COMPARE_ALPHA_V1))
    store.setTheme('T-C')
    store.undo()
    expect(store.redoEnabled).toBe(true)
    // 新操作 → 不可重做
    store.setSlotText('row.4.val.a', '分叉')
    expect(store.redoEnabled).toBe(false)
    expect(store.undoEnabled).toBe(true)
  })

  it('恢复草稿后撤销/重做双栈为空（FR-10 语义保留）', async () => {
    const { loadDraft } = await import('../repo/draftRepo')
    ;(loadDraft as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      instance: cloneInstance(COMPARE_ALPHA_V1),
      savedAt: '2026-01-01T00:00:00.000Z',
    })
    const store = useEditorStore()
    const r = await store.tryRestoreDraft()
    expect(r).toBe('restored')
    // createEditorState 空栈 → 撤销/重做都不可用；dirty 标记保留（FR-10）
    expect(store.undoEnabled).toBe(false)
    expect(store.redoEnabled).toBe(false)
    expect(store.dirty).toBe(true)
    expect(store.restorePrompt).toBe(true)
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

// ── R-3 图片上传/替换/移除（交互升级 T04）──

const T04_IMG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

function pngFile(): File {
  const bin = atob(T04_IMG.split(',')[1]!)
  const bytes = new Uint8Array([...bin].map((ch) => ch.charCodeAt(0)))
  return new File([bytes], 'a.png', { type: 'image/png' })
}

/** 超 2MB 的伪 PNG（合法头 + 零填充；字节闸在格式/解码前拦截） */
function oversizedPngFile(): File {
  const bin = atob(T04_IMG.split(',')[1]!)
  const head = new Uint8Array([...bin].map((ch) => ch.charCodeAt(0)))
  const bytes = new Uint8Array(2 * 1024 * 1024 + 100)
  bytes.set(head)
  return new File([bytes], 'big.png', { type: 'image/png' })
}

describe('editor store · 图片上传/替换/移除（R-3 / 交互升级 T04）', () => {
  it('上传合法图片 → 槽值变 {image}，一步撤销复原', async () => {
    const store = await setup()
    const sid = store.current!.layout.slotGrid![3]![1]! // row.3.val.a：text 槽（[2][1] 是 mark 槽）
    const before = JSON.parse(JSON.stringify(store.current!.slots[sid]))
    expect(await store.uploadImage(sid, pngFile())).toBe(true)
    expect(store.current!.slots[sid]).toMatchObject({ image: T04_IMG })
    store.undo()
    expect(store.current!.slots[sid]).toEqual(before)
  })

  it('替换图片 = 再设一次（同一意图链路），可撤销一步', async () => {
    const store = await setup()
    const sid = store.current!.layout.slotGrid![3]![1]! // row.3.val.a：text 槽（[2][1] 是 mark 槽）
    expect(await store.uploadImage(sid, pngFile())).toBe(true)
    // 换成另一张（这里用同一 data URL 模拟：写入路径一致）
    expect(await store.uploadImage(sid, pngFile())).toBe(true)
    expect(store.current!.slots[sid]).toMatchObject({ image: T04_IMG })
    store.undo()
    expect(store.current!.slots[sid]).toMatchObject({ image: T04_IMG })
  })

  it('超 2MB → 白话 toast（图片太大），store 不变', async () => {
    const store = await setup()
    const sid = store.current!.layout.slotGrid![3]![1]! // row.3.val.a：text 槽（[2][1] 是 mark 槽）
    const versionBefore = store.state?.version
    expect(await store.uploadImage(sid, oversizedPngFile())).toBe(false)
    expect(store.toast).toContain('图片太大')
    expect(store.state?.version).toBe(versionBefore)
  })

  it('mark 槽拒绝设图 → IMAGE_NOT_ALLOWED 白话文案，store 不变', async () => {
    const store = await setup()
    const before = JSON.stringify(store.current!.slots['row.2.val.a'])
    expect(await store.uploadImage('row.2.val.a', pngFile())).toBe(false)
    expect(store.toast).toContain('不能放图片')
    expect(JSON.stringify(store.current!.slots['row.2.val.a'])).toBe(before)
  })

  it('移除图片 = setSlot("")，回到文字空槽，可撤销', async () => {
    const store = await setup()
    const sid = store.current!.layout.slotGrid![3]![1]! // row.3.val.a：text 槽（[2][1] 是 mark 槽）
    expect(await store.uploadImage(sid, pngFile())).toBe(true)
    expect(store.removeImage(sid)).toBe(true)
    // setSlot('') 经 mergeSlotValue 回文字空槽（空串或 {text:''} 均为空）
    const v = store.current!.slots[sid]
    const shown =
      typeof v === 'string'
        ? v
        : typeof v === 'object' && v !== null && 'text' in v
          ? String(v.text)
          : 'x'
    expect(shown).toBe('')
    store.undo()
    expect(store.current!.slots[sid]).toMatchObject({ image: T04_IMG })
  })
})
