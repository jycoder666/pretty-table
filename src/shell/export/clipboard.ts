/**
 * 复制富文本（设计增量 §5.2 剪贴板行 / 实施计划 T17 接口）：
 * 一次写入两种风味——`text/html`（语义化 + 内联样式的导出片段，富文本编辑器优先取它）
 * 与 `text/plain`（TSV，便于再贴回表格软件）。
 *
 * 修复记录（2026-10-22 真机验证 P1）：此前只调 `navigator.clipboard.writeText`，
 * 剪贴板上没有 HTML Format 风味，粘到公众号后台得到的是转义源码文本（TC-PT-086 未通过）。
 *
 * 修复记录（2026-10-22 跨引擎验证）：WebKit/Safari 的 async clipboard 不接受 `text/html`
 * 风味（实测 `clipboard.write` 带该风味抛 NotAllowedError，只写 text/plain 才成功），
 * 故异步写入失败后先走 `execCommand('copy')` 富文本兜底（选中离屏 DOM → 浏览器把选区
 * 序列化成 text/html，WebKit 实测可产出 HTML Format），仍不行才抛出。
 *
 * 写入被拒（站点剪贴板权限被禁 / 非安全上下文无 ClipboardItem）时抛出，
 * 由调用方展开手动复制框（交互 §3.5、TC-PT-087）——不静默降级为纯文本，
 * 否则用户会以为复制到了带样式的表格，实际拿到的是源码或纯文本。
 */
export async function copyHtml(html: string, plain: string): Promise<void> {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ])
      return
    } catch {
      // 落到 execCommand 兜底（WebKit 的 text/html 风味拒绝即在此）
    }
  }
  if (copyViaSelection(html)) return
  throw new Error('clipboard write unsupported')
}

/**
 * 兜底富文本复制：片段插进离屏容器 → 选中 → `execCommand('copy')`。
 * 浏览器把选中 DOM 序列化成 `text/html` 风味写入系统剪贴板（Safari 下拿到富文本的唯一路径）。
 * 代价：该路径的 `text/plain` 风味是片段文本内容，不是 TSV——此时以「结构不乱」优先。
 */
function copyViaSelection(html: string): boolean {
  if (typeof document.execCommand !== 'function') return false
  const holder = document.createElement('div')
  holder.setAttribute('aria-hidden', 'true')
  holder.style.cssText = 'position:fixed;left:-9999px;top:0;pointer-events:none'
  holder.innerHTML = html
  document.body.appendChild(holder)
  const selection = window.getSelection()
  try {
    if (!selection) return false
    const range = document.createRange()
    range.selectNodeContents(holder)
    selection.removeAllRanges()
    selection.addRange(range)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    selection?.removeAllRanges()
    holder.remove()
  }
}
