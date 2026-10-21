import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import PtTooltip from './PtTooltip.vue'

/**
 * R-5 全界面统一 tooltip（交互升级 T04）：
 * - Reka UI Tooltip 行为 + 壳自绘样式（CSS 变量，GC-11）
 * - 悬停延时触发（300ms）+ 键盘 focus 触发（可达性）
 * - 禁用态按钮：触发器由组件内部包 span，调用方无感
 */
describe('PtTooltip（R-5）', () => {
  beforeEach(() => {
    // jsdom 无 ResizeObserver（reka PopperContent 定位需要）
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    )
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('默认不显示；pointermove 延时后显示白话文案，点触发器收起', async () => {
    const wrapper = mount(PtTooltip, {
      props: { text: '给选中格子加红字' },
      slots: { default: '<button type="button">红字</button>' },
      attachTo: document.body,
    })
    expect(document.body.textContent).not.toContain('给选中格子加红字')
    await wrapper.find('.pt-tooltip-trigger').trigger('pointermove')
    await vi.advanceTimersByTimeAsync(300)
    expect(document.body.textContent).toContain('给选中格子加红字')
    // 收起：点击触发器（reka handleClick → onClose）
    await wrapper.find('.pt-tooltip-trigger button').trigger('click')
    await vi.advanceTimersByTimeAsync(100)
    expect(document.body.textContent).not.toContain('给选中格子加红字')
    wrapper.unmount()
  })

  it('延时未到就移开指针 → 不出现（clearTimer）', async () => {
    const wrapper = mount(PtTooltip, {
      props: { text: '加粗选中格子' },
      slots: { default: '<button type="button">加粗</button>' },
      attachTo: document.body,
    })
    await wrapper.find('.pt-tooltip-trigger').trigger('pointermove')
    await wrapper.find('.pt-tooltip-trigger').trigger('pointerleave')
    await vi.advanceTimersByTimeAsync(400)
    expect(document.body.textContent).not.toContain('加粗选中格子')
    wrapper.unmount()
  })

  it('键盘 focus 触发（可达性约束）', async () => {
    const wrapper = mount(PtTooltip, {
      props: { text: '撤销上一步操作' },
      slots: { default: '<button type="button">撤销</button>' },
      attachTo: document.body,
    })
    // reka 监听 focus（挂在外层 span 上；按钮 focus 经 focusin 冒泡由 span 捕获）
    await wrapper.find('.pt-tooltip-trigger').trigger('focus')
    await vi.advanceTimersByTimeAsync(300)
    expect(document.body.textContent).toContain('撤销上一步操作')
    wrapper.unmount()
  })

  it('disabled 按钮也能出提示（组件内部包 span，调用方不写 span）', async () => {
    const wrapper = mount(PtTooltip, {
      props: { text: '先选一块矩形区域' },
      slots: { default: '<button type="button" disabled>合并选区</button>' },
      attachTo: document.body,
    })
    await wrapper.find('.pt-tooltip-trigger').trigger('pointermove')
    await vi.advanceTimersByTimeAsync(300)
    expect(document.body.textContent).toContain('先选一块矩形区域')
    wrapper.unmount()
  })

  it('GC-11：组件样式无 hex 色值字面量（一律走 CSS 变量，零 fallback hex）', () => {
    // jsdom 环境下 import.meta.url 非 file:// → 用 cwd 拼路径（vitest cwd = 项目根）
    const source = readFileSync(resolve(process.cwd(), 'src/shell/ui/PtTooltip.vue'), 'utf8')
    expect(/#[0-9a-fA-F]{3,8}\b/.test(source)).toBe(false)
  })
})
