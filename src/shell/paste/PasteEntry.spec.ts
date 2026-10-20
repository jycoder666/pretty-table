import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { COMPARE_ALPHA_V1, cloneInstance } from '@/core'
import { useEditorStore } from '../stores/editor'
import { parseFaultQuery } from '../debug/fault'
import PasteEntry from './PasteEntry.vue'

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
  document.body.innerHTML = ''
})

function setup() {
  const store = useEditorStore()
  store.openTemplate(cloneInstance(COMPARE_ALPHA_V1))
  wrapper = mount(PasteEntry)
  return store
}

function dispatchPaste(text: string, target?: EventTarget): ClipboardEvent {
  const ev = new Event('paste', { cancelable: true, bubbles: true }) as ClipboardEvent
  Object.defineProperty(ev, 'clipboardData', {
    value: { getData: (t: string) => (t === 'text/plain' ? text : '') },
  })
  Object.defineProperty(ev, 'target', { value: target ?? window })
  window.dispatchEvent(ev)
  return ev
}

describe('PasteEntry · 主入口（TC-PT-051/056）', async () => {
  it('选中起点格 Ctrl+V → 预览高亮 + 确认/取消', async () => {
    const store = setup()
    store.selectedSlotId = 'row.3.val.a'
    dispatchPaste('1\t2\n3\t4')
    await nextTick()
    expect(store.pastePending).toBe(true)
    expect(store.pastePreview).not.toBeNull()
    expect(wrapper!.find('[data-testid="paste-bar"]').exists()).toBe(true)
    expect(wrapper!.find('[data-testid="paste-bar-text"]').text()).toContain(
      '将填入 2 行 × 2 列，共 4 格',
    )
    expect(wrapper!.findAll('.paste-cell')).toHaveLength(4)
    expect(wrapper!.find('[data-testid="paste-guard"]').exists()).toBe(true)
  })

  it('输入态内粘贴走原生，只进当前格', async () => {
    const store = setup()
    store.selectedSlotId = 'row.3.val.a'
    const ta = document.createElement('textarea')
    document.body.appendChild(ta)
    ta.focus()
    dispatchPaste('1\t2\n3\t4', ta)
    await nextTick()
    expect(store.pastePending).toBe(false)
    expect(store.pastePreview).toBeNull()
  })

  it('未选中格子时不拦截 paste', async () => {
    const store = setup()
    dispatchPaste('1\t2')
    await nextTick()
    expect(store.pastePreview).toBeNull()
  })

  it('S9：1×1 不弹预览、直接写入（仍可撤销）', async () => {
    const store = setup()
    store.selectedSlotId = 'row.3.val.a'
    dispatchPaste('单格内容')
    await nextTick()
    expect(store.pastePending).toBe(false)
    expect(store.current!.slots['row.3.val.a']).toEqual({ text: '单格内容' })
    store.undo()
    expect(store.current!.slots['row.3.val.a']).toBe('1 个工作日')
  })
})

describe('PasteEntry · 确认 / 取消 / 撤销（TC-PT-057/064/065）', async () => {
  it('确认 → 一次写入；撤销一步回到粘贴前', async () => {
    const store = setup()
    const before = cloneInstance(store.current!)
    store.selectedSlotId = 'row.3.val.a'
    dispatchPaste('24 小时\t8 小时')
    await nextTick()
    await wrapper!.find('[data-testid="paste-confirm"]').trigger('click')
    expect(store.current!.slots['row.3.val.a']).toEqual({ text: '24 小时' })
    expect(store.current!.slots['row.3.val.b']).toEqual({ text: '8 小时' })
    expect(store.pastePending).toBe(false)
    store.undo()
    expect(store.current).toEqual(before)
  })

  it('取消 → store 不变', async () => {
    const store = setup()
    const before = cloneInstance(store.current!)
    store.selectedSlotId = 'row.3.val.a'
    dispatchPaste('1\t2\n3\t4')
    await nextTick()
    await wrapper!.find('[data-testid="paste-cancel"]').trigger('click')
    expect(store.pastePreview).toBeNull()
    expect(store.current).toEqual(before)
  })

  it('Esc 取消 / Enter 确认', async () => {
    const store = setup()
    store.selectedSlotId = 'row.3.val.a'
    dispatchPaste('1\t2\n3\t4')
    await nextTick()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(store.pastePreview).toBeNull()
    dispatchPaste('1\t2\n3\t4')
    await nextTick()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(store.current!.slots['row.3.val.a']).toEqual({ text: '1' })
  })
})

describe('PasteEntry · 拒收与提示（TC-PT-059～063）', async () => {
  it('超出 → 提示「多出 N 行 M 列」，不截断、不扩表', async () => {
    const store = setup()
    store.selectedSlotId = 'row.9.val.c'
    dispatchPaste('a\tb\nc\td')
    await nextTick()
    expect(store.pastePreview).toBeNull()
    expect(store.toast).toContain('多出 1 行 1 列')
  })

  it('区块 + 超出同时命中 → 一次提示两条原因，区块在前、超出在后', async () => {
    const store = setup()
    // 可见网格：L0 L1 B1 L2 L3 L4 L5 B5 L6 L7 L8 L9？——本模板 gap 在逻辑 1、5 后；
    // 起点逻辑第 4 行（可见第 5 行）向下 3 行会跨过 B5 区块行，并向右超出 1 列
    store.selectedSlotId = 'row.4.label'
    dispatchPaste('a\tb\tc\td\te\nf\tg\th\ti\tj\nk\tl\tm\tn\to')
    await nextTick()
    expect(store.pastePreview).toBeNull()
    const t = store.toast ?? ''
    expect(t.indexOf('分区色条')).toBeGreaterThanOrEqual(0)
    expect(t.indexOf('多出 1 列')).toBeGreaterThan(t.indexOf('分区色条'))
    expect(t).toContain('；另外')
  })
})

describe('PasteEntry · 预览语义显示（Q-010/Q-011）', async () => {
  it('percent 槽粘 25 → 预览显示 25%，无任何改写提醒', async () => {
    const store = setup()
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.slotDefs = { ...inst.slotDefs, 'row.3.val.a': { kind: 'number', format: 'percent' } }
    store.replaceWith(inst)
    store.selectedSlotId = 'row.3.val.a'
    dispatchPaste('25\t50\n1.5\t2')
    await nextTick()
    const cells = wrapper!.findAll('.paste-cell')
    expect(cells[0]!.text()).toContain('25%')
    expect(wrapper!.find('[data-testid="paste-bar-text"]').text()).not.toContain('按文字')
  })

  it('number 槽粘 ¥1,200 → 预览格标「按文字」，预览条追加一句', async () => {
    const store = setup()
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.slotDefs = { ...inst.slotDefs, 'row.3.val.a': { kind: 'number', format: 'number' } }
    store.replaceWith(inst)
    store.selectedSlotId = 'row.3.val.a'
    dispatchPaste('¥1,200\t20')
    await nextTick()
    expect(wrapper!.find('.paste-cell .as-text-badge').exists()).toBe(true)
    expect(wrapper!.find('[data-testid="paste-bar-text"]').text()).toContain('其中 1 格按文字填入')
  })
})

describe('PasteEntry · 确认时异常（S13 / GC-19）', async () => {
  it('?pt-fault=PASTE_COMMIT_FAILED → 「粘贴失败，表格未改动」，store 未变', async () => {
    const store = setup()
    const before = cloneInstance(store.current!)
    store.selectedSlotId = 'row.3.val.a'
    dispatchPaste('1\t2\n3\t4')
    await nextTick()
    parseFaultQuery('?pt-fault=PASTE_COMMIT_FAILED')
    store.confirmPaste()
    expect(store.toast).toBe('粘贴失败，表格未改动')
    expect(store.current).toEqual(before)
    expect(store.pastePreview).toBeNull()
  })

  it('预览期间改表（版本变化）后确认 → PASTE_STALE 文案', async () => {
    const store = setup()
    store.selectedSlotId = 'row.3.val.a'
    dispatchPaste('1\t2\n3\t4')
    await nextTick()
    store.setSlotText('row.2.val.a', '中途改了')
    store.confirmPaste()
    expect(store.toast).toBe('表格刚被改过，请重新粘贴')
    // 粘贴被拒：目标格保持原值（用户中途的改动保留，粘贴不落地）
    expect(store.current!.slots['row.3.val.a']).toBe('1 个工作日')
    expect(store.pastePreview).toBeNull()
  })
})

describe('PasteEntry · 预览期守卫', async () => {
  it('预览期间守卫存在（合并/对齐/强调/拖区块/导出被挡），点守卫取消', async () => {
    const store = setup()
    store.selectedSlotId = 'row.3.val.a'
    dispatchPaste('1\t2\n3\t4')
    await nextTick()
    const guard = wrapper!.find('[data-testid="paste-guard"]')
    expect(guard.exists()).toBe(true)
    await guard.trigger('click')
    expect(store.pastePreview).toBeNull()
    expect(wrapper!.find('[data-testid="paste-guard"]').exists()).toBe(false)
  })
})
