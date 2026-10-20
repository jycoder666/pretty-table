import { describe, expect, it, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import type { DOMWrapper } from '@vue/test-utils'
import { useEditorStore } from '../stores/editor'
import { COMPARE_ALPHA_V1, cloneInstance } from '@/core'
import PropertyPanel from './PropertyPanel.vue'

async function mountPanel() {
  const store = useEditorStore()
  store.openTemplate(cloneInstance(COMPARE_ALPHA_V1))
  const wrapper = mount(PropertyPanel)
  return { wrapper, store }
}

describe('PropertyPanel · 三态符号选择（TC-PT-075）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('mark 槽只出现三选一，无自定义符号/颜色入口', async () => {
    const { wrapper, store } = await mountPanel()
    store.selectedSlotId = 'row.2.val.a'
    await wrapper.vm.$nextTick()
    const texts = wrapper.findAll('button').map((b) => b.text())
    expect(texts.some((t) => t.includes('支持') && t.includes('✓'))).toBe(true)
    expect(texts.some((t) => t.includes('不支持') && t.includes('✗'))).toBe(true)
    expect(texts.some((t) => t.includes('部分支持') && t.includes('◐'))).toBe(true)
    // 无自定义符号/颜色入口
    expect(wrapper.find('input[type="color"]').exists()).toBe(false)
    expect(wrapper.find('input[type="text"]').exists()).toBe(false)
  })

  it('点选三态写入 {mark}；再点取消', async () => {
    const { wrapper, store } = await mountPanel()
    store.selectedSlotId = 'row.2.val.a'
    await wrapper.vm.$nextTick()
    const noBtn = wrapper.findAll('button').find((b) => b.text().includes('不支持'))
    await noBtn!.trigger('click')
    expect(store.current?.slots['row.2.val.a']).toMatchObject({ mark: 'no' })
    await noBtn!.trigger('click')
    expect(store.current?.slots['row.2.val.a']).toMatchObject({ mark: null })
  })

  it('text 槽仍是文案输入，不出现三态按钮', async () => {
    const { wrapper, store } = await mountPanel()
    store.selectedSlotId = 'row.4.val.a'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('textarea').exists()).toBe(true)
    const texts = wrapper.findAll('button').map((b) => b.text())
    expect(texts.some((t) => t.includes('✗'))).toBe(false)
  })
})

describe('PropertyPanel · 同槽连续编辑合并为一步撤销（PX-03）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  async function typeInto(ta: DOMWrapper<HTMLTextAreaElement>, seq: string[]) {
    for (const t of seq) await ta.setValue(t)
  }

  it('连续输入 5 个字符，撤销一步回到输入前整句', async () => {
    const { wrapper, store } = await mountPanel()
    store.selectedSlotId = 'row.4.val.a'
    await wrapper.vm.$nextTick()
    const ta = wrapper.find('textarea')
    const before = JSON.stringify(store.current?.slots['row.4.val.a'])
    await typeInto(ta, ['a', 'ab', 'abc', 'abcd', 'abcde'])
    expect(store.current?.slots['row.4.val.a']).toMatchObject({ text: 'abcde' })
    store.undo()
    expect(JSON.stringify(store.current?.slots['row.4.val.a'])).toBe(before)
    expect(store.undoEnabled).toBe(false)
  })

  it('编辑 A 槽 → 编辑 B 槽：一步回到 B 编辑前（A 保留），再一步回到 A 编辑前', async () => {
    const { wrapper, store } = await mountPanel()
    const aBefore = JSON.stringify(store.current?.slots['row.4.val.a'])
    const bBefore = JSON.stringify(store.current?.slots['row.3.val.a'])

    store.selectedSlotId = 'row.4.val.a'
    await wrapper.vm.$nextTick()
    await typeInto(wrapper.find('textarea'), ['甲', '甲甲', '甲甲甲甲'])

    store.selectedSlotId = 'row.3.val.a'
    await wrapper.vm.$nextTick()
    await typeInto(wrapper.find('textarea'), ['乙', '乙乙乙'])

    store.undo()
    expect(JSON.stringify(store.current?.slots['row.3.val.a'])).toBe(bBefore)
    expect(JSON.stringify(store.current?.slots['row.4.val.a'])).not.toBe(aBefore)
    store.undo()
    expect(JSON.stringify(store.current?.slots['row.4.val.a'])).toBe(aBefore)
    expect(store.undoEnabled).toBe(false)
  })

  it('失焦结束会话：blur 后再输入，另起一步撤销', async () => {
    const { wrapper, store } = await mountPanel()
    store.selectedSlotId = 'row.4.val.a'
    await wrapper.vm.$nextTick()
    const ta = wrapper.find('textarea')
    const original = JSON.stringify(store.current?.slots['row.4.val.a'])
    await typeInto(ta, ['第', '第一段'])
    await ta.trigger('blur')
    await typeInto(ta, ['第一段第', '第一段第二段'])
    // 两步撤销：先回到「第一段」，再回到原文
    store.undo()
    expect(store.current?.slots['row.4.val.a']).toMatchObject({ text: '第一段' })
    store.undo()
    expect(JSON.stringify(store.current?.slots['row.4.val.a'])).toBe(original)
  })
})

describe('PropertyPanel · 推荐列开关（TC-PT-080）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('只能选列/取消；再点当前列即取消推荐', async () => {
    const { wrapper, store } = await mountPanel()
    await wrapper.vm.$nextTick()
    const btn = () => wrapper.findAll('button').find((b) => b.text().includes('方案 B'))!
    await btn().trigger('click')
    expect(store.current?.highlight?.recommendCol).toBe(2)
    expect(btn().text()).toContain('推荐')
    await btn().trigger('click')
    expect(store.current?.highlight?.recommendCol).toBeNull()
  })

  it('无 recommendableCols 的模板不出现推荐列区块', async () => {
    const { wrapper, store } = await mountPanel()
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.layout.recommendableCols = []
    store.replaceWith(inst)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('推荐列')
  })
})
