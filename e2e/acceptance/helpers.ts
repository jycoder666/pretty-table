import { expect, type BrowserContext, type Page } from '@playwright/test'
import {
  buildVisualRows,
  colWidthAt,
  getPresetTemplate,
  type TemplateInstance,
} from '../../src/core/index'

/**
 * T30 验收公共助手（TC-PT-051～088）：
 * - 打开系统预设模板：走库页 UI 真实链路（使用此模板 → 预览就绪）
 * - 画布选格：按 buildVisualRows / colWidthAt 同源几何换算点击坐标（与 previewHit.locateVisual 一致）
 * - 模拟剪贴板：Excel/WPS 来源统一用 DataTransfer 构造 text/plain(+text/html) 粘贴事件注入
 * - 导出 HTML 读回：走导出抽屉「复制 HTML」→ 剪贴板读回（等价粘贴产物）
 */

/**
 * 剪贴板权限按引擎授予：`clipboard-read/write` 权限项只有 chromium 项目支持，
 * webkit 在 `newPage` 阶段就抛 `Unknown permission: clipboard-write`（整份用例卡在开页，
 * 报错与产品行为无关）；故不能在文件级 `test.use` 里无条件声明。
 * 需要真实剪贴板的用例自行 skip 非 chromium，其余用例（构造粘贴事件/打桩 clipboard）照常跑。
 */
export async function grantClipboardIfChromium(
  context: BrowserContext,
  browserName: string,
): Promise<void> {
  if (browserName !== 'chromium') return
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
}

/** 库页按展示名打开系统预设并等预览画布就绪（二次进入时先清草稿，保证落在库页） */
export async function openPreset(page: Page, displayName: string, query = ''): Promise<void> {
  // 同一测试内第二次进入（换模板）时清掉 IndexedDB 草稿位；首次为全新上下文无需清理
  const url = page.url()
  if (url && url !== 'about:blank') {
    await page.evaluate(() => indexedDB.deleteDatabase('pretty-table'))
  }
  await page.goto(`/${query}`)
  const card = page.locator('article.card', {
    has: page.locator('h3', { hasText: displayName }),
  })
  await card.getByRole('button', { name: '使用此模板' }).click()
  await expect(page.locator('.preview-host canvas').first()).toBeVisible()
  // 等渲染核首帧后命中几何稳定
  await page.waitForTimeout(300)
}

/** 预设模板实例（克隆件，与编辑台初始实例同源） */
export function presetOf(templateId: string): TemplateInstance {
  const t = getPresetTemplate(templateId)
  if (!t) throw new Error(`preset not found: ${templateId}`)
  return t
}

/** 槽位 → 可视行列（与 buildVisualRows 的 metas 对齐，含区块行） */
export function slotVisualPos(
  inst: TemplateInstance,
  slotId: string,
): { row: number; col: number } {
  const { metas } = buildVisualRows(inst)
  for (let r = 0; r < metas.length; r++) {
    const row = metas[r]!
    for (let c = 0; c < row.length; c++) {
      if (row[c]?.slotId === slotId) return { row: r, col: c }
    }
  }
  throw new Error(`slot not in visual grid: ${slotId}`)
}

/** 点击预览画布上的槽位（选中为粘贴起点） */
export async function clickSlot(page: Page, inst: TemplateInstance, slotId: string): Promise<void> {
  const { row, col } = slotVisualPos(inst, slotId)
  const { rowHeights } = buildVisualRows(inst)
  let x = 0
  for (let c = 0; c < col; c++) x += colWidthAt(inst, c)
  let y = 0
  for (let r = 0; r < row; r++) y += rowHeights[r] ?? 36
  const canvas = page.locator('.preview-host canvas').first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('preview canvas not found')
  await page.mouse.click(box.x + x + colWidthAt(inst, col) / 2, box.y + y + (rowHeights[row] ?? 36) / 2)
  // 等选中态落到新槽（headline 已可见时避免读到上一格的值）
  await page.waitForTimeout(150)
  await expect(page.locator('[data-testid="slot-headline"]')).toBeVisible()
}

/** 模拟剪贴板粘贴：向 window 派发带 DataTransfer 的 paste 事件（Excel/WPS 来源等价 TSV/HTML 载荷） */
export async function pasteClipboard(
  page: Page,
  payload: { text?: string; html?: string; file?: { name: string; type: string; base64: string } },
): Promise<void> {
  await page.evaluate((p) => {
    const dt = new DataTransfer()
    if (p.file) {
      const bytes = Uint8Array.from(atob(p.file.base64), (ch) => ch.charCodeAt(0))
      dt.items.add(new File([bytes], p.file.name, { type: p.file.type }))
    }
    if (p.text !== undefined) dt.setData('text/plain', p.text)
    if (p.html !== undefined) dt.setData('text/html', p.html)
    let ev = new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    } as ClipboardEventInit)
    if (ev.clipboardData !== dt) {
      ev = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
      Object.defineProperty(ev, 'clipboardData', { value: dt })
    }
    window.dispatchEvent(ev)
  }, payload)
}

/** 读 toast（.pt-toast）文本 */
export async function toastText(page: Page): Promise<string | null> {
  const toast = page.locator('.pt-toast')
  if ((await toast.count()) === 0) return null
  return toast.textContent()
}

export async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator('.pt-toast')).toHaveText(text)
}

/** 粘贴预览条文本 */
export function pasteBarText(page: Page) {
  return page.locator('[data-testid="paste-bar-text"]')
}

/** 确认写入 / 取消 */
export async function confirmPaste(page: Page): Promise<void> {
  await page.locator('[data-testid="paste-confirm"]').click()
}
export async function cancelPaste(page: Page): Promise<void> {
  await page.locator('[data-testid="paste-cancel"]').click()
}

/** 覆盖层格（含识别结果显示） */
export function pasteCells(page: Page) {
  return page.locator('.paste-cell')
}

/** 打开导出抽屉 */
export async function openExportDrawer(page: Page): Promise<void> {
  await page.getByRole('button', { name: '导出', exact: true }).click()
  await expect(page.locator('.drawer')).toBeVisible()
}

/** 当前 toast 的序号（无 toast 时为 null）；用于确认「这一次」提示已落地 */
async function toastSeqOf(page: Page): Promise<string | null> {
  return page.evaluate(
    () => document.querySelector('.pt-toast')?.getAttribute('data-seq') ?? null,
  )
}

/**
 * 导出 HTML 读回（走「复制 HTML」→ 剪贴板 text/html 风味，等价富文本粘贴产物）。
 * 同步口径：不能只看 toast 文案——连续两次复制同一句话时节点不重建，文案断言会立刻通过，
 * 而此时剪贴板可能还是上一轮内容。故等 data-seq 递增，确认这一次复制已完成。
 */
export async function exportedHtml(page: Page): Promise<string> {
  await openExportDrawer(page)
  const seqBefore = await toastSeqOf(page)
  await page.getByRole('button', { name: '复制 HTML' }).click()
  await expect(page.locator('.pt-toast')).toHaveText('已复制到剪贴板')
  await expect.poll(() => toastSeqOf(page)).not.toBe(seqBefore)
  // P1 修复后剪贴板为双风味（text/html 片段 + text/plain TSV）：取 text/html，
  // 与公众号/邮件等富文本编辑器粘到的内容一致；纯文本风味见 exportedText
  const html = await readClipboardFlavor(page, 'text/html')
  await page.getByRole('button', { name: '关闭' }).click()
  return html
}

/**
 * 读剪贴板指定风味（真机剪贴板多风味：text/html / text/plain）。
 * Chromium 的 async clipboard 有竞态：多风味写入（本应用一次写 text/html + text/plain）
 * 刚落地时立刻 `read()` → `getType()` 会抛 InvalidStateError「Clipboard data has changed」，
 * 属引擎时序问题而非产品缺陷（重读即可拿到稳定内容），故此处退避重试，全败才抛。
 */
export async function readClipboardFlavor(page: Page, type: string): Promise<string> {
  const read = () =>
    page.evaluate(async (t) => {
      const items = await navigator.clipboard.read()
      for (const it of items) {
        if (it.types.includes(t)) return await (await it.getType(t)).text()
      }
      return ''
    }, type)
  let lastErr: unknown = null
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await read()
    } catch (err) {
      lastErr = err
      await page.waitForTimeout(80)
    }
  }
  throw lastErr
}

/** 导出纯文本风味读回（text/plain = TSV，落 Excel/WPS 等价；调用前抽屉须已打开） */
export async function exportedText(page: Page): Promise<string> {
  const seqBefore = await toastSeqOf(page)
  await page.getByRole('button', { name: '复制 HTML' }).click()
  await expect(page.locator('.pt-toast')).toHaveText('已复制到剪贴板')
  await expect.poll(() => toastSeqOf(page)).not.toBe(seqBefore)
  const text = await page.evaluate(() => navigator.clipboard.readText())
  await page.getByRole('button', { name: '关闭' }).click()
  return text
}

/** 导出 PNG 下载并返回文件字节（触发真实下载事件） */
export async function downloadPng(page: Page): Promise<Uint8Array> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出 PNG' }).click(),
  ])
  const path = await download.path()
  const { readFileSync } = await import('node:fs')
  return new Uint8Array(readFileSync(path!))
}

/** PNG IHDR 宽高（字节 16～24） */
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

/** 在浏览器里解码 PNG 并统计接近指定颜色的像素数（容差欧氏距离，用于符号主题色断言） */
export async function countPngNearColor(
  page: Page,
  bytes: Uint8Array,
  hex: string,
  tol = 60,
): Promise<number> {
  const base64 = Buffer.from(bytes).toString('base64')
  return page.evaluate(async ({ b64, color, tol }) => {
    const bin = atob(b64)
    const buf = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
    const bmp = await createImageBitmap(new Blob([buf], { type: 'image/png' }))
    const canvas = new OffscreenCanvas(bmp.width, bmp.height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bmp, 0, 0)
    const r0 = parseInt(color.slice(1, 3), 16)
    const g0 = parseInt(color.slice(3, 5), 16)
    const b0 = parseInt(color.slice(5, 7), 16)
    const data = ctx.getImageData(0, 0, bmp.width, bmp.height).data
    let count = 0
    for (let i = 0; i < data.length; i += 4) {
      const dr = data[i]! - r0
      const dg = data[i + 1]! - g0
      const db = data[i + 2]! - b0
      if (dr * dr + dg * dg + db * db <= tol * tol) count++
    }
    return count
  }, { b64: base64, color: hex, tol })
}

/** 在浏览器里解码 PNG 并取样像素（r,g,b,a），坐标为图像像素坐标 */
export async function samplePngPixels(
  page: Page,
  bytes: Uint8Array,
  points: [number, number][],
): Promise<{ x: number; y: number; r: number; g: number; b: number; a: number }[]> {
  const base64 = btoa(String.fromCharCode(...bytes))
  return page.evaluate(async ({ b64, pts }) => {
    const bin = atob(b64)
    const buf = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
    const bmp = await createImageBitmap(new Blob([buf], { type: 'image/png' }))
    // Playwright 的 WebKit 构建没有 OffscreenCanvas（ReferenceError），回退到普通 canvas
    const canvas =
      typeof OffscreenCanvas === 'function'
        ? new OffscreenCanvas(bmp.width, bmp.height)
        : Object.assign(document.createElement('canvas'), {
            width: bmp.width,
            height: bmp.height,
          })
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
    ctx.drawImage(bmp, 0, 0)
    return pts.map(([x, y]) => {
      const d = ctx.getImageData(x, y, 1, 1).data
      return { x, y, r: d[0]!, g: d[1]!, b: d[2]!, a: d[3]! }
    })
  }, { b64: base64, pts: points })
}
