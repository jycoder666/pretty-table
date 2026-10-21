import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { cloneInstance, COMPARE_ALPHA_V1 } from '@/core'
import { useEditorStore } from '../stores/editor'
import ExportDrawer from './ExportDrawer.vue'

// 组件测试不碰真实 IndexedDB：草稿读写 mock 为空操作（镜像 ExportDrawer.spec.ts）
vi.mock('../repo/draftRepo', () => ({
  saveDraft: vi.fn<() => Promise<void>>(async () => {}),
  loadDraft: vi.fn<() => Promise<null>>(async () => null),
  clearDraft: vi.fn<() => Promise<void>>(async () => {}),
}))

// 导出走核（VTable 离屏重绘），jsdom 下整体 mock 为可控结果（镜像 ExportDrawer.spec.ts）
const { exportPngMock, measurePngMock } = vi.hoisted(() => ({
  exportPngMock: vi.fn<() => Promise<unknown>>(),
  measurePngMock: vi.fn<() => { outWidth: number; outHeight: number }>(),
}))

vi.mock('@/core', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/core')>()
  return {
    ...orig,
    exportHtml: vi.fn(),
    measurePng: measurePngMock,
    loadRenderCore: vi.fn(async () => ({
      mount: vi.fn(),
      exportPng: exportPngMock,
      measurePng: measurePngMock,
      measureContentSize: orig.measureContentSize,
    })),
  }
})

/**
 * QA 压测定因回归（2026-XX · 6 并发导出 10~30% 静默丢下载）：
 * 旧实现在 `a.click()` 后**同一同步代码块内**立即 `URL.revokeObjectURL(url)`。
 * 正常负载下浏览器在 click 激活行为里已解析并钉住 blob 数据，立即释放无碍；
 * 但极端 CPU 饥饿下下载启动任务晚于 revoke 到达 blob 注册表 → URL 已失效
 * → 下载静默丢失（无下载、无报错、按钮已恢复、「PNG 已下载」toast 照常出现）。
 *
 * 契约（本用例钉死，jsdom 下真实驱动组件全流程，非 mock 自证）：
 * 1. click 之后**不得**同步 revoke（同轮宏任务内 URL 必须仍有效）；
 * 2. revoke 只能在安全延迟（60s）到期后发生，且只释放本次创建的 URL。
 */
describe('ExportDrawer · PNG 下载 blob URL 生命周期（防静默丢下载）', () => {
  let wrapper: VueWrapper | null = null
  const origCreate = URL.createObjectURL
  const origRevoke = URL.revokeObjectURL

  function q(sel: string): Element | null {
    return document.body.querySelector(sel)
  }

  async function setupDrawer() {
    const pinia = createPinia()
    setActivePinia(pinia)
    const editor = useEditorStore()
    editor.openTemplate(cloneInstance(COMPARE_ALPHA_V1))
    wrapper = mount(ExportDrawer, { props: { open: true }, global: { plugins: [pinia] } })
    await flushPromises()
    return editor
  }

  beforeEach(() => {
    exportPngMock.mockReset()
    measurePngMock.mockReset().mockReturnValue({ outWidth: 1028, outHeight: 640 })
    // 只假 setTimeout/clearTimeout：revoke 延迟与 toast 自动消失可控，
    // 而 flushPromises 依赖的 setImmediate 保持真实，Promise 照常推进
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
    URL.createObjectURL = origCreate
    URL.revokeObjectURL = origRevoke
    vi.useRealTimers()
  })

  it('click 后不得同步 revokeObjectURL；延迟到期后才释放且只释放自己的 URL', async () => {
    const editor = await setupDrawer()
    exportPngMock.mockResolvedValue({
      ok: true,
      value: new Blob(['fake-png'], { type: 'image/png' }),
    })
    const createObjectURL = vi.fn(() => 'blob:pt-revoke-test')
    const revokeObjectURL = vi.fn()
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL

    // 走真实组件导出流程（exportPng → 建 URL → a.click() → 释放时机）
    const btn = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === '导出 PNG',
    )
    expect(btn).toBeTruthy()
    btn!.click()
    await flushPromises()

    // 导出成功：toast 报成功（旧实现同样如此——静默丢下载时用户毫无感知）
    expect(editor.toast).toBe('PNG 已下载')
    expect(createObjectURL).toHaveBeenCalledTimes(1)

    // 关键回归断言①：click 之后同一同步代码块内不得释放（旧实现在此红）
    expect(revokeObjectURL).not.toHaveBeenCalled()

    // 关键回归断言②：整个延迟窗口内都不得释放，到期才释放且只释放自己的 URL
    vi.advanceTimersByTime(59_999)
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:pt-revoke-test')

    expect(q('.drawer')).not.toBeNull()
  })

  it('连点多次导出：每次下载的 URL 各自在各自延迟到期后释放，互不干扰', async () => {
    await setupDrawer()
    exportPngMock.mockResolvedValue({
      ok: true,
      value: new Blob(['fake-png'], { type: 'image/png' }),
    })
    const createdUrls = ['blob:pt-a', 'blob:pt-b']
    let next = 0
    const createObjectURL = vi.fn(() => createdUrls[next++]!)
    const revokeObjectURL = vi.fn()
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL

    // 第一笔先触发并让假时钟走 1s，再发起第二笔：两笔的延迟窗口错开
    const first = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === '导出 PNG',
    )
    first!.click()
    await flushPromises()
    vi.advanceTimersByTime(1_000)
    const second = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === '导出 PNG',
    )
    second!.click()
    await flushPromises()

    expect(createObjectURL).toHaveBeenCalledTimes(2)
    expect(revokeObjectURL).not.toHaveBeenCalled()

    // 第一笔到期：只释放 blob:pt-a
    vi.advanceTimersByTime(59_000)
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:pt-a')
    // 第二笔到期：释放 blob:pt-b
    vi.advanceTimersByTime(1_000)
    expect(revokeObjectURL).toHaveBeenCalledTimes(2)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:pt-b')
  })
})
