/**
 * blob 下载触发与 blob URL 生命周期（壳层 · GC-10：不碰核）。
 *
 * 背景（QA 压测定因 · 6 并发导出 10~30% 静默丢下载）：
 * 旧实现在 `a.click()` 后**同一同步代码块内**立即 `URL.revokeObjectURL(url)`。
 * 正常负载下浏览器在 click 激活行为里就解析并钉住 blob 数据，立即释放无碍；
 * 但极端 CPU 饥饿下，下载启动任务可能晚于 revoke 到达 blob 注册表
 * → URL 已失效 → 下载静默丢失（无下载、无报错、按钮已恢复、「PNG 已下载」
 * toast 照常出现，用户毫无感知）。
 *
 * 修复：延迟 60s 再释放。期间 blob 常驻内存（PNG 产物几 MB 量级，可忽略），
 * 页面关闭时由浏览器兜底全部回收。选传统延迟手法是因为 `download` 触发的
 * 下载没有标准完成事件，监听方案跨浏览器不可靠，故不采用。
 *
 * 回归单测：export-download-revoke.spec.ts（click 后不得同步 revoke）
 * 回归 e2e：e2e/png-revoke.spec.ts（成功 toast ⟹ download 事件最终到达）
 */
const REVOKE_DELAY_MS = 60_000

/**
 * 触发浏览器下载，并在安全延迟后释放 blob URL。
 * click 与 revoke 之间不再有任何同步代码，下载启动窗口内 URL 始终有效。
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // 延迟释放：极端饥饿下下载启动可能明显晚于 click 返回，立即 revoke 会
  // 使 URL 失效导致下载静默丢失（见文件头说明）；60s 后 blob 早已被钉住。
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}
