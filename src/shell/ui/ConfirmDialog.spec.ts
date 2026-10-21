import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfirmDialog from './ConfirmDialog.vue'
import { confirmAction, confirmState, settleConfirm } from './confirm'

/**
 * PX-05：统一确认弹窗——标题 + 描述 + 明确语义双按钮；
 * Promise 化 API（confirmAction）resolve 语义核验。
 */

function mountDialog() {
  return mount(ConfirmDialog)
}

afterEach(() => {
  // 清理未决状态，避免跨用例泄漏
  if (confirmState.open) settleConfirm(false)
  document.body.innerHTML = ''
})

describe('ConfirmDialog · 统一确认弹窗（PX-05）', () => {
  it('confirmAction 打开弹窗：标题 / 描述 / 按钮文案如实渲染，点确认 resolve(true)', async () => {
    const wrapper = mountDialog()
    expect(wrapper.find('[data-testid="confirm-overlay"]').exists()).toBe(false)
    const p = confirmAction({
      title: '删除模板',
      message: '删除后这张模板就没了，确定删除？',
      confirmText: '删除',
      danger: true,
    })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="confirm-title"]').text()).toBe('删除模板')
    expect(wrapper.find('[data-testid="confirm-message"]').text()).toBe(
      '删除后这张模板就没了，确定删除？',
    )
    const ok = wrapper.find('[data-testid="confirm-ok"]')
    const cancel = wrapper.find('[data-testid="confirm-cancel"]')
    expect(ok.text()).toBe('删除')
    expect(cancel.text()).toBe('取消')
    expect(ok.classes()).toContain('danger')
    const box = wrapper.find('[data-testid="confirm-dialog"]')
    expect(box.attributes('role')).toBe('alertdialog')
    expect(box.attributes('aria-modal')).toBe('true')
    // 点确认 → promise resolve(true)，弹窗关闭
    await ok.trigger('click')
    expect(await p).toBe(true)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="confirm-overlay"]').exists()).toBe(false)
  })

  it('非破坏性操作确认按钮用主色实心；点取消 resolve(false)', async () => {
    const wrapper = mountDialog()
    const p = confirmAction({
      title: '替换当前的表格',
      message: '换一张模板会替换当前的表格，未另存的修改会丢失。确定继续？',
      confirmText: '替换',
    })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="confirm-ok"]').classes()).toContain('primary')
    await wrapper.find('[data-testid="confirm-cancel"]').trigger('click')
    expect(await p).toBe(false)
  })

  it('Esc 键 = 取消；点遮罩 = 取消', async () => {
    const wrapper = mountDialog()
    const p1 = confirmAction({ title: 'T', message: 'M', confirmText: '确认' })
    await wrapper.vm.$nextTick()
    // 组件监听在 window 上，直接向 window 派发键盘事件
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(await p1).toBe(false)

    const p2 = confirmAction({ title: 'T', message: 'M', confirmText: '确认' })
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="confirm-overlay"]').trigger('click')
    expect(await p2).toBe(false)
  })

  it('同一线只有最后一次请求生效：新请求把旧的以取消收场，不悬挂', async () => {
    const wrapper = mountDialog()
    const p1 = confirmAction({ title: 'T1', message: 'M1', confirmText: '确认' })
    const p2 = confirmAction({ title: 'T2', message: 'M2', confirmText: '确认' })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="confirm-title"]').text()).toBe('T2')
    await wrapper.find('[data-testid="confirm-ok"]').trigger('click')
    expect(await p1).toBe(false)
    expect(await p2).toBe(true)
  })
})
