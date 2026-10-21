import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import RenameDialog from './RenameDialog.vue'

/**
 * PX-10 补充：Esc 取消路径（LibraryPage.spec 只锁了按钮/遮罩取消）。
 * RenameDialog 在 window 上监听 keydown，Escape → close() → 收层 + emit cancel。
 */

function mountDialog(open = true) {
  return mount(RenameDialog, {
    props: { heading: '重命名模板', initialName: '旧名字', open },
    attachTo: document.body,
  })
}

describe('RenameDialog · Esc 取消路径（P2 验收补齐）', () => {
  it('打开态按 Esc：弹层收起、emit cancel，不 emit confirm、不写 update:open(true)', async () => {
    const wrapper = mountDialog(true)
    await wrapper.vm.$nextTick()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('confirm')).toBeUndefined()
    // defineModel 收层：update:open → false（父层据此同步开关）
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
    wrapper.unmount()
  })

  it('关闭态按 Esc：无副作用（监听器虽有，open 守卫直接返回）', async () => {
    const wrapper = mountDialog(false)
    await wrapper.vm.$nextTick()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('cancel')).toBeUndefined()
    expect(wrapper.emitted('update:open')).toBeUndefined()
    wrapper.unmount()
  })
})
