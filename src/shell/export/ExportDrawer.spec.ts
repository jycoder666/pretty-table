import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { cloneInstance, COMPARE_ALPHA_V1 } from '@/core'
import { useEditorStore } from '../stores/editor'
import ExportDrawer from './ExportDrawer.vue'

// 组件测试不碰真实 IndexedDB：草稿读写 mock 为空操作
vi.mock('../repo/draftRepo', () => ({
  saveDraft: vi.fn<() => Promise<void>>(async () => {}),
  loadDraft: vi.fn<() => Promise<null>>(async () => null),
  clearDraft: vi.fn<() => Promise<void>>(async () => {}),
}))

// 导出走核（VTable 离屏重绘 / clipboard），jsdom 下整体 mock 为可控结果
const { exportHtmlMock, exportPngMock, measurePngMock } = vi.hoisted(() => ({
  exportHtmlMock: vi.fn<() => unknown>(),
  exportPngMock: vi.fn<() => Promise<unknown>>(),
  measurePngMock: vi.fn<() => { outWidth: number; outHeight: number }>(),
}))

// 剪贴板写入门面（真机行为由 manual-verify 真机用例覆盖）
const { copyHtmlMock } = vi.hoisted(() => ({
  copyHtmlMock: vi.fn<(html: string, plain: string) => Promise<void>>(async () => {}),
}))

vi.mock('./clipboard', () => ({ copyHtml: copyHtmlMock }))

vi.mock('@/core', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/core')>()
  return {
    ...orig,
    exportHtml: exportHtmlMock,
    measurePng: measurePngMock,
    // T34：组件经 loadRenderCore 取 exportPng（渲染核动态 chunk），此处直连 mock
    loadRenderCore: vi.fn<() => Promise<Record<string, unknown>>>(async () => ({
      mount: vi.fn<() => void>(),
      exportPng: exportPngMock,
      measurePng: measurePngMock,
      measureContentSize: orig.measureContentSize,
    })),
  }
})

/**
 * reka Dialog 经真实 Teleport 渲染进 document.body（VTU 的 teleport stub 会丢内容），
 * 因此 DOM 断言/交互走 document 查询 + 原生 click（Vue 事件经 addEventListener 可触发），
 * 状态断言走 editor store。
 */
function q(sel: string): Element | null {
  return document.body.querySelector(sel)
}

function qa(sel: string): HTMLElement[] {
  return [...document.body.querySelectorAll(sel)] as HTMLElement[]
}

let wrapper: VueWrapper | null = null

async function setupDrawer() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const editor = useEditorStore()
  editor.openTemplate(cloneInstance(COMPARE_ALPHA_V1))
  wrapper = mount(ExportDrawer, { props: { open: true }, global: { plugins: [pinia] } })
  await flushPromises()
  return { editor, wrapper }
}

/** 选倍率：点对应 seg 按钮 */
async function chooseScale(s: 1 | 2 | 3) {
  const btn = qa('.seg-btn').find((b) => b.textContent?.trim() === `${s}×`)!
  btn.click()
  await flushPromises()
}

function clickByText(text: string) {
  const btn = qa('button').find((b) => b.textContent?.trim() === text)!
  expect(btn).toBeTruthy()
  btn.click()
  return flushPromises()
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

beforeEach(() => {
  exportHtmlMock.mockReset()
  exportPngMock.mockReset()
  measurePngMock.mockReset().mockReturnValue({ outWidth: 1028, outHeight: 640 })
  copyHtmlMock.mockReset().mockResolvedValue(undefined)
})

describe('ExportDrawer · 复制 HTML 双风味（TC-PT-086 回归）', () => {
  it('点「复制 HTML」：同写 HTML 与 TSV，成功 toast 用契约文案', async () => {
    const { editor } = await setupDrawer()
    exportHtmlMock.mockReturnValue({ ok: true, value: '<table><tr><td>甲</td></tr></table>' })
    await clickByText('复制 HTML')
    expect(copyHtmlMock).toHaveBeenCalledTimes(1)
    const [html, plain] = copyHtmlMock.mock.calls[0]!
    expect(html).toContain('<table>')
    // text/plain 风味是 TSV（设计增量 §5.2），不是 HTML 源码
    expect(plain).not.toContain('<table>')
    expect(plain.split('\n')[0]).toBe('多列对比表')
    expect(editor.toast).toBe('已复制到剪贴板')
    expect(q('.fallback')).toBeNull()
  })

  it('剪贴板被拒：展开手动复制框（框内为 HTML）+ TC-PT-087 文案', async () => {
    const { editor } = await setupDrawer()
    exportHtmlMock.mockReturnValue({ ok: true, value: '<table><tr><td>甲</td></tr></table>' })
    copyHtmlMock.mockRejectedValue(new Error('NotAllowedError'))
    await clickByText('复制 HTML')
    expect(editor.toast).toBe('浏览器没有允许写入剪贴板，请在下方框里全选后手动复制')
    const box = q('.fallback') as HTMLTextAreaElement | null
    expect(box).not.toBeNull()
    expect(box!.value).toContain('<table>')
  })
})

describe('ExportDrawer · 副标题正向文案（PX-11）', () => {
  it('说明支持 HTML 复制与 PNG 下载，不再出现「无 Excel」负面表述', async () => {
    await setupDrawer()
    const text = q('.drawer')?.textContent ?? ''
    expect(text).toContain('复制带样式的 HTML')
    expect(text).toContain('下载高清 PNG')
    expect(text).not.toContain('无 Excel')
  })
})

describe('ExportDrawer · PNG 超门槛降倍引导（PX-12）', () => {
  it('3× 超限：提示改用 2× 或 1×，并高亮倍率选项', async () => {
    const { editor } = await setupDrawer()
    await chooseScale(3)
    exportPngMock.mockResolvedValue({
      ok: false,
      error: { code: 'EXPORT_PNG_TOO_LARGE', message: '' },
    })
    await clickByText('导出 PNG')
    expect(editor.toast).toContain('当前 3× 超限，请改用 2× 或 1×')
    // 倍率选项高亮（GC-11：高亮色走 CSS 变量，类名只做状态标记）
    expect(q('.seg.attn')).not.toBeNull()
    // GC-25：不露错误码
    expect(editor.toast).not.toContain('EXPORT_PNG_TOO_LARGE')
  })

  it('2× 超限：提示改用 1×', async () => {
    const { editor } = await setupDrawer()
    await chooseScale(2)
    exportPngMock.mockResolvedValue({
      ok: false,
      error: { code: 'EXPORT_PNG_TOO_LARGE', message: '' },
    })
    await clickByText('导出 PNG')
    expect(editor.toast).toContain('当前 2× 超限，请改用 1×')
  })

  it('1× 超限：已是最低倍率，引导精简表格', async () => {
    const { editor } = await setupDrawer()
    await chooseScale(1)
    exportPngMock.mockResolvedValue({
      ok: false,
      error: { code: 'EXPORT_PNG_TOO_LARGE', message: '' },
    })
    await clickByText('导出 PNG')
    expect(editor.toast).toContain('已是最低倍率 1×')
  })

  it('改选倍率后高亮清除；其他导出错误仍走通用白话文案', async () => {
    const { editor } = await setupDrawer()
    await chooseScale(3)
    exportPngMock.mockResolvedValue({
      ok: false,
      error: { code: 'EXPORT_PNG_TOO_LARGE', message: '' },
    })
    await clickByText('导出 PNG')
    expect(q('.seg.attn')).not.toBeNull()
    // 用户照建议改选 2× → 高亮清除
    await chooseScale(2)
    expect(q('.seg.attn')).toBeNull()
    // 下一次失败换成普通失败码 → 通用文案，不高亮倍率
    exportPngMock.mockResolvedValue({
      ok: false,
      error: { code: 'EXPORT_PNG_FAIL', message: '' },
    })
    await clickByText('导出 PNG')
    expect(editor.toast).toBe('导出失败，请重试')
    expect(q('.seg.attn')).toBeNull()
  })
})

describe('ExportDrawer · HTML 效果预览（PX-14 / GC-22）', () => {
  it('点「预览」：弹层内以 iframe srcdoc 渲染导出 HTML', async () => {
    await setupDrawer()
    exportHtmlMock.mockReturnValue({
      ok: true,
      value: '<table class="pt-table"><tr><td>hello</td></tr></table>',
    })
    await clickByText('预览')
    const overlay = q('[data-testid="html-preview-overlay"]')
    expect(overlay).not.toBeNull()
    const frame = q('[data-testid="html-preview-frame"]') as HTMLIFrameElement | null
    expect(frame).not.toBeNull()
    // GC-22：必须 sandbox（禁脚本/同源），产物经 srcdoc 渲染而非注入页面文档
    expect(frame!.getAttribute('sandbox')).toBe('')
    expect(frame!.getAttribute('srcdoc')).toContain('pt-table')
  })

  it('「关闭」后弹层收起', async () => {
    await setupDrawer()
    exportHtmlMock.mockReturnValue({ ok: true, value: '<table></table>' })
    await clickByText('预览')
    expect(q('[data-testid="html-preview-overlay"]')).not.toBeNull()
    await clickByText('关闭')
    expect(q('[data-testid="html-preview-overlay"]')).toBeNull()
  })

  it('导出失败：白话 toast，不弹预览', async () => {
    const { editor } = await setupDrawer()
    exportHtmlMock.mockReturnValue({
      ok: false,
      error: { code: 'EXPORT_HTML_FAIL', message: '' },
    })
    await clickByText('预览')
    expect(editor.toast).toBe('复制失败，请重试')
    expect(q('[data-testid="html-preview-overlay"]')).toBeNull()
  })
})
