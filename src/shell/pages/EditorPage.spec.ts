import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { COMPARE_ALPHA_V1, cloneInstance } from '@/core'
import { useEditorStore } from '../stores/editor'
import { confirmState, settleConfirm } from '../ui/confirm'
import { panelGroupOpen } from '../editor/panelGroups'
import EditorPage from './EditorPage.vue'

// 草稿读写 mock 为空操作（组件测试不碰真实 IndexedDB，与 PropertyPanel.spec 同口径）
vi.mock('../repo/draftRepo', () => ({
  saveDraft: vi.fn<() => Promise<void>>(async () => {}),
  loadDraft: vi.fn<() => Promise<null>>(async () => null),
  clearDraft: vi.fn<() => Promise<void>>(async () => {}),
}))

// 渲染核 / DnD / reka Dialog 重依赖 mock：页面级 spec 只锁壳层接线，不锁渲染
vi.mock('../editor/PreviewHost.vue', () => ({
  default: { name: 'PreviewHostStub', template: '<div data-testid="preview-stub" />' },
}))
vi.mock('../editor/BlockLibrary.vue', () => ({
  default: { name: 'BlockLibraryStub', template: '<div />' },
}))
vi.mock('../editor/SaveTemplateDialog.vue', () => ({
  default: { name: 'SaveTemplateDialogStub', template: '<div />' },
}))
vi.mock('../export/ExportDrawer.vue', () => ({
  default: { name: 'ExportDrawerStub', template: '<div />' },
}))
vi.mock('@dnd-kit/vue', () => ({
  DragDropProvider: { name: 'DragDropProviderStub', template: '<div><slot /></div>' },
  DragOverlay: { name: 'DragOverlayStub', template: '<div><slot /></div>' },
  PointerSensor: class {},
  KeyboardSensor: class {},
}))

/**
 * EditorPage 组件级锁定（此前为 0）：
 * - 顶部撤销/重做按钮置灰随 canUndo/canRedo（E3 双栈派生 undoEnabled/redoEnabled）
 * - pastePending 期间 undo/redo/另存为模板/导出置灰（FR-17）
 * - 全局快捷键 Ctrl+Z / Ctrl+Y 触发 editor.undo()/redo()（PX-13/E3，isUndoHotkey/isRedoHotkey 收口）
 */

async function mountPage() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const editor = useEditorStore()
  editor.openTemplate(cloneInstance(COMPARE_ALPHA_V1))
  const wrapper = mount(EditorPage, { global: { plugins: [pinia] } })
  return { editor, wrapper }
}

function findBtn(wrapper: ReturnType<typeof mount>, label: string) {
  const b = wrapper.findAll('button').find((x) => x.text().trim() === label)
  expect(b).toBeDefined()
  return b!
}

function pressKey(key: string, init: KeyboardEventInit = {}): void {
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
  )
}

beforeEach(() => {
  document.documentElement.style.cssText = ''
  // 模块级会话状态复位，避免跨用例泄漏
  if (confirmState.open) settleConfirm(false)
  panelGroupOpen.content = true
  panelGroupOpen.style = false
  panelGroupOpen.structure = false
})

describe('EditorPage · 撤销/重做按钮随 canUndo/canRedo 置灰（E3）', () => {
  it('初始态双栈为空：撤销/重做都置灰', async () => {
    const { wrapper } = await mountPage()
    expect((findBtn(wrapper, '撤销').element as HTMLButtonElement).disabled).toBe(true)
    expect((findBtn(wrapper, '重做').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('编辑一步：撤销可用、重做置灰；撤销后反转（重做恢复）', async () => {
    const { editor, wrapper } = await mountPage()
    editor.setSlotText('row.3.val.a', '改一笔')
    await wrapper.vm.$nextTick()
    expect(editor.undoEnabled).toBe(true)
    expect(editor.redoEnabled).toBe(false)
    expect((findBtn(wrapper, '撤销').element as HTMLButtonElement).disabled).toBe(false)
    expect((findBtn(wrapper, '重做').element as HTMLButtonElement).disabled).toBe(true)
    editor.undo()
    await wrapper.vm.$nextTick()
    expect((findBtn(wrapper, '撤销').element as HTMLButtonElement).disabled).toBe(true)
    expect((findBtn(wrapper, '重做').element as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('EditorPage · pastePending 顶部按钮禁用（FR-17）', () => {
  it('粘贴预览期：撤销/重做/另存为模板/导出置灰；取消后恢复', async () => {
    const { editor, wrapper } = await mountPage()
    editor.setSlotText('row.3.val.a', '预填') // 保证取消后 undoEnabled=true 可对照
    editor.selectedSlotId = 'row.3.val.a'
    expect(editor.pasteStart({ text: '1\t2\n3\t4' })).toBe(true)
    await wrapper.vm.$nextTick()
    for (const label of ['撤销', '重做', '另存为模板', '导出']) {
      expect((findBtn(wrapper, label).element as HTMLButtonElement).disabled).toBe(true)
    }
    editor.cancelPaste()
    await wrapper.vm.$nextTick()
    expect((findBtn(wrapper, '撤销').element as HTMLButtonElement).disabled).toBe(false)
    expect((findBtn(wrapper, '重做').element as HTMLButtonElement).disabled).toBe(true) // 无重做链
    expect((findBtn(wrapper, '另存为模板').element as HTMLButtonElement).disabled).toBe(false)
    expect((findBtn(wrapper, '导出').element as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('EditorPage · 全局快捷键（PX-13 / E3）', () => {
  it('Ctrl+Z：链空不触发；有链触发 editor.undo() 一次', async () => {
    const { editor } = await mountPage()
    const undoSpy = vi.spyOn(editor, 'undo')
    pressKey('z', { ctrlKey: true })
    expect(undoSpy).not.toHaveBeenCalled()
    editor.setSlotText('row.3.val.a', '改一笔')
    pressKey('z', { ctrlKey: true })
    expect(undoSpy).toHaveBeenCalledTimes(1)
  })

  it('Ctrl+Y：触发 editor.redo()（需先撤销造出重做链）', async () => {
    const { editor } = await mountPage()
    editor.setSlotText('row.3.val.a', '改一笔')
    editor.undo()
    const redoSpy = vi.spyOn(editor, 'redo')
    pressKey('y', { ctrlKey: true })
    expect(redoSpy).toHaveBeenCalledTimes(1)
  })

  it('pastePending 期间快捷键双禁：Ctrl+Z / Ctrl+Y 都不触发', async () => {
    const { editor } = await mountPage()
    editor.setSlotText('row.3.val.a', '改一笔')
    editor.undo() // 造出重做链，redoEnabled=true
    editor.selectedSlotId = 'row.3.val.a'
    expect(editor.pasteStart({ text: '1\t2\n3\t4' })).toBe(true)
    const undoSpy = vi.spyOn(editor, 'undo')
    const redoSpy = vi.spyOn(editor, 'redo')
    pressKey('z', { ctrlKey: true })
    pressKey('y', { ctrlKey: true })
    expect(undoSpy).not.toHaveBeenCalled()
    expect(redoSpy).not.toHaveBeenCalled()
  })
})
