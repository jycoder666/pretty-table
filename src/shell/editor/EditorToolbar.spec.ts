import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { COMPARE_ALPHA_V1, cloneInstance } from '@/core'
import { useEditorStore } from '../stores/editor'
import EditorToolbar from './EditorToolbar.vue'

vi.mock('../repo/draftRepo', () => ({
  saveDraft: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  loadDraft: vi.fn<() => Promise<null>>().mockResolvedValue(null),
  clearDraft: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}))

let wrapper: VueWrapper | null = null

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

function setup() {
  const store = useEditorStore()
  store.openTemplate(cloneInstance(COMPARE_ALPHA_V1))
  wrapper = mount(EditorToolbar)
  return store
}

function stubClipboard(readText: () => Promise<string>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { readText },
    configurable: true,
  })
}

describe('EditorToolbar · 粘贴表格内容按钮（交互 §1.1 / S11）', () => {
  it('未选中起点时禁用；选中后可点', async () => {
    const store = setup()
    const btn = wrapper!.find('[data-testid="paste-toolbar-btn"]')
    expect(btn.attributes('disabled')).toBeDefined()
    store.selectedSlotId = 'row.3.val.a'
    await nextTick()
    expect(wrapper!.find('[data-testid="paste-toolbar-btn"]').attributes('disabled')).toBeUndefined()
  })

  it('clipboard.readText 成功 → 直接进预览', async () => {
    const store = setup()
    store.selectedSlotId = 'row.3.val.a'
    await nextTick()
    stubClipboard(() => Promise.resolve('1\t2\n3\t4'))
    await wrapper!.find('[data-testid="paste-toolbar-btn"]').trigger('click')
    await flushPromises()
    expect(store.pastePending).toBe(true)
    expect(store.pastePreview).not.toBeNull()
  })

  it('clipboard.readText 被拒 → 弹「在这里粘贴（Ctrl+V）」小框', async () => {
    const store = setup()
    store.selectedSlotId = 'row.3.val.a'
    await nextTick()
    stubClipboard(() => Promise.reject(new Error('denied')))
    await wrapper!.find('[data-testid="paste-toolbar-btn"]').trigger('click')
    await flushPromises()
    const box = wrapper!.find('[data-testid="paste-manual-box"]')
    expect(box.exists()).toBe(true)
    expect(box.text()).toContain('在这里粘贴（Ctrl+V）')
  })

  it('手动框内 paste 事件 → 走 pasteStart 进预览', async () => {
    const store = setup()
    store.selectedSlotId = 'row.3.val.a'
    await nextTick()
    stubClipboard(() => Promise.reject(new Error('denied')))
    await wrapper!.find('[data-testid="paste-toolbar-btn"]').trigger('click')
    await flushPromises()
    const input = wrapper!.find('[data-testid="paste-manual-input"]')
    await input.trigger('paste', { clipboardData: { getData: () => '1\t2\n3\t4' } })
    expect(store.pastePending).toBe(true)
    expect(store.pastePreview).not.toBeNull()
  })

  it('预览期间按钮禁用', () => {
    const store = setup()
    store.selectedSlotId = 'row.3.val.a'
    // 直接置预览态（预览由 PasteEntry/Store 管理）
    store.pasteStart({ text: '1\t2\n3\t4' })
    expect(store.pastePending).toBe(true)
    const btn = wrapper!.find('[data-testid="paste-toolbar-btn"]')
    expect(btn.attributes('disabled')).toBeDefined()
    store.cancelPaste()
  })

  it('clipboard 为空文本 → 弹手动框', async () => {
    const store = setup()
    store.selectedSlotId = 'row.3.val.a'
    await nextTick()
    stubClipboard(() => Promise.resolve('   '))
    await wrapper!.find('[data-testid="paste-toolbar-btn"]').trigger('click')
    await flushPromises()
    expect(wrapper!.find('[data-testid="paste-manual-box"]').exists()).toBe(true)
  })
})
