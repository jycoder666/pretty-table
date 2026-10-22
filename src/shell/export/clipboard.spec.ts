import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyHtml } from './clipboard'

/**
 * 复制富文本（设计增量 §5.2 / TC-PT-086 回归）：一次写入 text/html + text/plain 两种风味。
 * 异步写入被拒（WebKit 拒 text/html 风味）先走 execCommand 富文本兜底；
 * 兜底也不可用/失败才抛出（调用方展开手动复制框，TC-PT-087），不得静默降级为纯文本。
 */

const HTML = '<div><table><tr><td>甲</td></tr></table></div>'
const TSV = '甲'

interface WrittenItem {
  data: Record<string, Blob>
}

function stubClipboard(write: (items: WrittenItem[]) => Promise<void>) {
  vi.stubGlobal(
    'ClipboardItem',
    class {
      data: Record<string, Blob>
      constructor(data: Record<string, Blob>) {
        this.data = data
      }
    },
  )
  Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true })
}

function stubExecCommand(result: boolean) {
  const fn = vi.fn<() => boolean>(() => result)
  Object.defineProperty(document, 'execCommand', { value: fn, configurable: true })
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'clipboard')
  Reflect.deleteProperty(document, 'execCommand')
})

describe('copyHtml', () => {
  it('同时写入 text/html 与 text/plain 两种风味（内容与类型与入参一致）', async () => {
    let items: WrittenItem[] = []
    stubClipboard(async (written) => {
      items = written
    })
    await copyHtml(HTML, TSV)
    expect(items).toHaveLength(1)
    const flavors = items[0]!.data
    expect(Object.keys(flavors).sort()).toEqual(['text/html', 'text/plain'])
    expect(flavors['text/html']!.type).toBe('text/html')
    expect(flavors['text/plain']!.type).toBe('text/plain')
    expect(await flavors['text/html']!.text()).toBe(HTML)
    expect(await flavors['text/plain']!.text()).toBe(TSV)
  })

  it('浏览器不支持 ClipboardItem（非安全上下文/老浏览器）+ execCommand 兜底失败 → 抛出', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { write: vi.fn<() => Promise<void>>() },
      configurable: true,
    })
    stubExecCommand(false)
    await expect(copyHtml(HTML, TSV)).rejects.toThrow('clipboard write unsupported')
  })

  it('异步写入被拒（WebKit 拒 text/html 风味）→ 走 execCommand 富文本兜底，不抛', async () => {
    stubClipboard(() => Promise.reject(new Error('NotAllowedError')))
    const exec = stubExecCommand(true)
    await copyHtml(HTML, TSV)
    expect(exec).toHaveBeenCalledWith('copy')
    // 兜底期间插进 DOM 的离屏容器须摘除、选区须清空（不留残余）
    expect(document.querySelector('div[aria-hidden="true"]')).toBeNull()
    expect(window.getSelection()?.rangeCount ?? 0).toBe(0)
  })

  it('异步写入被拒且 execCommand 兜底也失败 → 抛出，不静默降级为纯文本', async () => {
    stubClipboard(() => Promise.reject(new Error('NotAllowedError')))
    stubExecCommand(false)
    await expect(copyHtml(HTML, TSV)).rejects.toThrow('clipboard write unsupported')
  })
})
