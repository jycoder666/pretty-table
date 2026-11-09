import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test'
import {
  buildVisualRows,
  colWidthAt,
  getPresetTemplate,
  previewStructuralRange,
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

/**
 * 剪贴板写捕获（T08 ×10 连跑加固）：并行 worker 共享 OS 剪贴板，读回侧无法区分
 * 「本页刚写的」与「并行 worker 刚覆盖的」（×10 实证：TC-056 读回并行 TC-052 的导出，
 * 同模板旧串连哨兵判重都识别不了）。本助手在每次导航前给页面装一个 write 拦截器，
 * 记录本 context 自己 clipboard.write 的 text/html 载荷——与 OS 写入同源同字节，天然隔离；
 * exportedHtml 读回优先取捕获，未装捕获（不经 openPreset 的调用方）退回
 * OS 读回 + 哨兵重试既有路径。幂等：每个文档只装一次。
 */
async function installClipboardCapture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __ptClipboardCaptureInstalled?: boolean
      __ptLastExportHtml?: string | null
    }
    if (w.__ptClipboardCaptureInstalled) return
    w.__ptClipboardCaptureInstalled = true
    if (!navigator.clipboard?.write) return
    const origWrite = navigator.clipboard.write.bind(navigator.clipboard)
    navigator.clipboard.write = async (items: ClipboardItem[]) => {
      let html: string | null = null
      for (const item of items) {
        if (item.types.includes('text/html')) {
          try {
            html = await (await item.getType('text/html')).text()
          } catch {
            html = null // 捕获失败保底：读回落 OS 路径
          }
        }
      }
        w.__ptLastExportHtml = html
        // WebKit 无 clipboard-write 权限项：真机 write 仍会间歇性 NotAllowedError
        //（tc100 ×9 实证：同用例时而成功、时而应用兜底 toast「浏览器没有允许写入剪贴板」）。
        // 捕获载荷已先行落 __ptLastExportHtml，此处吞掉底层拒绝（chromium 正常路径不变），
        // 使「复制成功」断言确定化；TC-087 的拒绝注入是整体替换 clipboard（无 write）→
        // 捕获不安装（上方守卫），与其断言互不影响。
        try {
          return await origWrite(items)
        } catch {
          return undefined
        }
    }
  })
}

/** 库页按展示名打开系统预设并等预览画布就绪（二次进入时先清草稿，保证落在库页） */
export async function openPreset(page: Page, displayName: string, query = ''): Promise<void> {
  // 同一测试内第二次进入（换模板）时清掉 IndexedDB 草稿位；首次为全新上下文无需清理
  await installClipboardCapture(page)
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

/**
 * 原生 Ctrl+V 粘贴进文本框（真实 OS 剪贴板，非 DataTransfer 注入）。
 * 原生粘贴的浏览器默认动作依赖窗口焦点：headed 多 worker 下并行窗口抢焦点会让
 * Ctrl+V 静默不触发（×10 实证：textarea 值停留原值、预览条也未开），故先 bringToFront
 * 压前台再按；没粘上/粘错（写落定竞态）→ Ctrl+A 全选后重写重按，默认 ≤3 次尝试。
 * 助手不替调用方断言：成功与否由调用方的值断言收口。
 */
export async function pasteNativeText(
  page: Page,
  textarea: Locator,
  text: string,
  attempts = 3,
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    await page.bringToFront()
    await page.evaluate((t) => navigator.clipboard.writeText(t), text)
    await textarea.press('Control+A')
    await textarea.press('Control+V')
    if ((await textarea.inputValue()) === text) return
  }
}

export async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator('.pt-toast')).toHaveText(text)
}

// ── T05 结构轨道助手（增量设计 A2/A6；tc094 改写与 tc095 共用）──────────────────

export type RailAxis = 'row' | 'col'

/** 行轨道 / 列轨道条（EditorPage stage 布局：列条在上、行条在左，均 28px 冻结式） */
export function railStrip(page: Page, axis: RailAxis) {
  return page.locator(`[data-testid="${axis}-rail-strip"]`)
}

/**
 * 点击轨道序号 = 选中整行/整列（structuralSelection）。
 * 序号项 testid：rail-row-{逻辑行号 0 基} / rail-col-{列号 0 基}；
 * 点击后 host 属性 data-pt-structural 应变为 "row:N"/"col:N"（断言交给用例，这里不替用户断）。
 */
export async function clickRailItem(page: Page, axis: RailAxis, index: number): Promise<void> {
  await page.locator(`[data-testid="rail-${axis}-${index}"]`).click()
  await expect(page.locator('.preview-host')).toHaveAttribute(
    'data-pt-structural',
    `${axis}:${index}`,
  )
}

/**
 * 打开轨道 `…` 结构菜单。前置：目标项已选中或悬停（浮现工具条含 +/… 才会渲染）。
 * 菜单项 testid：menu-{row|col}-{before|after|remove|prev|next}。
 */
export async function openRailMenu(page: Page, axis: RailAxis, index: number): Promise<void> {
  await page.locator(`[data-testid="rail-${axis}-menu-${index}"]`).click()
  await expect(page.getByRole('menu', { name: axis === 'row' ? '行操作菜单' : '列操作菜单' }))
    .toBeVisible()
}

/** 结构选择同步点断言（A6 规则 5：'' = 无结构选择） */
export async function expectStructural(page: Page, label: string): Promise<void> {
  await expect(page.locator('.preview-host')).toHaveAttribute('data-pt-structural', label)
}

/** 右栏结构摘要卡（组头常显）：「N 行 × M 列 · K 层表头」 */
export function structureSummary(page: Page) {
  return page.locator('[data-testid="structure-summary"]')
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
 *
 * 读回基座（T08 ×10 连跑加固）：openPreset 已装 clipboard.write 捕获时优先取本 context
 * 的捕获载荷（与 OS 写入同源同字节，并行 worker 覆盖不了它）；未装捕获退回 OS 读回
 * （text/html 风味；Chromium 多风味写入刚落地时立刻 read() 会抛 InvalidStateError，
 * readClipboardFlavor 内退避重试）。
 *
 * 哨兵口径（T08 缺陷③）：传 `sentinel` 时做内容校验——读回为空或不含 sentinel →
 * 重按一次「复制 HTML」再读（≤2 次）；重读后仍不含才 fail，报错附读回片段。
 * OS 基座下另有「落定确认」（间隔 50ms 两次读一致才算写入落定，防无异常的旧串竞态——
 * 同模板旧串同样含哨兵，仅哨兵判重识别不了）。捕获基座下两次读同源必然一致。
 * 不传 sentinel 时调用方语义不变（单次复制单次读）。
 */
export async function exportedHtml(page: Page, sentinel?: string): Promise<string> {
  await openExportDrawer(page)
  const readSubstrate = async (): Promise<string> => {
    const captured = await page.evaluate(
      () => (window as unknown as { __ptLastExportHtml?: string | null }).__ptLastExportHtml ?? null,
    )
    if (captured !== null) return captured
    // P1 修复后剪贴板为双风味（text/html 片段 + text/plain TSV）：取 text/html，
    // 与公众号/邮件等富文本编辑器粘到的内容一致；纯文本风味见 exportedText
    return readClipboardFlavor(page, 'text/html')
  }
  const copyAndRead = async (): Promise<string> => {
    const seqBefore = await toastSeqOf(page)
    await page.getByRole('button', { name: '复制 HTML' }).click()
    await expect(page.locator('.pt-toast')).toHaveText('已复制到剪贴板')
    await expect.poll(() => toastSeqOf(page)).not.toBe(seqBefore)
    return readSubstrate()
  }
  let html = await copyAndRead()
  if (sentinel !== undefined) {
    // 落定确认（OS 基座）：「读到旧串」的竞态可以不抛异常。间隔 50ms 两次读一致才算
    // 「这一次复制已落定」（读操作，不占 ≤2 次重复制额度）。
    const confirmStable = async (): Promise<void> => {
      for (let i = 0; i < 3; i++) {
        await page.waitForTimeout(50)
        const again = await readSubstrate()
        if (again === html) return
        html = again
      }
    }
    await confirmStable()
    for (let retry = 0; retry < 2 && (html === '' || !html.includes(sentinel)); retry++) {
      html = await copyAndRead()
      await confirmStable()
    }
    if (html === '' || !html.includes(sentinel)) {
      throw new Error(
        `exportedHtml 哨兵校验失败（自动重复制重读 2 次后仍不匹配）：` +
          `期望含「${sentinel}」，读回片段（前 200 字符）：${html.slice(0, 200) || '<空串>'}`,
      )
    }
  }
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

// ── T12 结构批量/拖拽/图片双击/缺陷回归助手（UX-S11～S16；tc096–099 共用）──────────────

/** 本轮新增用例双视口（PRD §6.1 UX-S 走查口径：桌面 1200×800 / 触屏 390×844） */
export const T12_VIEWPORTS = [
  { width: 1200, height: 800 },
  { width: 390, height: 844 },
] as const

/** 最小合法 PNG（1×1 透点）：图片格双击换图 / 右栏上传用例共用（setInputFiles 载荷） */
export const PNG_1PX = {
  name: 'dot.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
} as const

/** 槽位 → 画布内容坐标中心（tc092 cellCenter 收编为公共助手；与 previewHit.locateVisual 同源几何） */
export function canvasSlotPoint(inst: TemplateInstance, slotId: string): { x: number; y: number } {
  const { row, col } = slotVisualPos(inst, slotId)
  const { rowHeights } = buildVisualRows(inst)
  let x = 0
  for (let c = 0; c < col; c++) x += colWidthAt(inst, c)
  let y = 0
  for (let r = 0; r < row; r++) y += rowHeights[r] ?? 36
  return { x: x + colWidthAt(inst, col) / 2, y: y + (rowHeights[row] ?? 36) / 2 }
}

/** Shift+点击轨道项：从当前锚点扩展区间 [anchor, index]（UX-S11/T02；同轴才生效） */
export async function shiftClickRailItem(page: Page, axis: RailAxis, index: number): Promise<void> {
  await page.locator(`[data-testid="rail-${axis}-${index}"]`).click({ modifiers: ['Shift'] })
}

/** 轨道项 client 盒（渲染核几何就绪后读取；不可测时显式报错，不让断言静默走样） */
export async function railItemBox(
  page: Page,
  axis: RailAxis,
  index: number,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator(`[data-testid="rail-${axis}-${index}"]`).boundingBox()
  if (!box) throw new Error(`rail item not measurable: ${axis}-${index}`)
  return box
}

/**
 * 轨道拖拽到第 boundary 条插入边界（UX-S12/T03 换位把手）。
 * boundary = 插入边界在原序中的位置（0 = 最前，lastIndex+1 = 最后）；
 * boundary ∈ {from, from+1} 为原位（不显示指示线、松手不动）——用例勿传。
 * 手势：按下 → 标签内位移 6px（越过 RAIL_DRAG_THRESHOLD=4 激活并 setPointerCapture）→
 * 分步移到边界点 → 可选 hold（拖拽中态断言，如指示线 .bad 警示色）→ 松手。
 * 边界点取相邻两轨道项盒的中点（几何同源 railGeometry 渲染产物，不自算）。
 */
export async function railDragToBoundary(
  page: Page,
  axis: RailAxis,
  fromIndex: number,
  boundary: number,
  lastIndex: number,
  opts?: { hold?: () => Promise<void> },
): Promise<void> {
  const from = await railItemBox(page, axis, fromIndex)
  const cx = from.x + from.width / 2
  const cy = from.y + from.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  // 标签内移动 6px 激活拖拽（row 向下 6px / col 向右 6px，均在标签盒内）
  await page.mouse.move(axis === 'row' ? cx : cx + 6, axis === 'row' ? cy + 6 : cy, { steps: 3 })
  let tx: number
  let ty: number
  if (boundary === 0) {
    const first = await railItemBox(page, axis, 0)
    tx = first.x + first.width / 2
    ty = first.y - 6
    if (axis === 'col') {
      tx = first.x - 6
      ty = first.y + first.height / 2
    }
  } else if (boundary > lastIndex) {
    const last = await railItemBox(page, axis, lastIndex)
    tx = last.x + last.width / 2
    ty = last.y + last.height + 8
    if (axis === 'col') {
      tx = last.x + last.width + 8
      ty = last.y + last.height / 2
    }
  } else {
    const prev = await railItemBox(page, axis, boundary - 1)
    const next = await railItemBox(page, axis, boundary)
    if (axis === 'row') {
      tx = next.x + next.width / 2
      ty = (prev.y + prev.height + next.y) / 2
    } else {
      tx = (prev.x + prev.width + next.x) / 2
      ty = next.y + next.height / 2
    }
  }
  await page.mouse.move((cx + tx) / 2, (cy + ty) / 2, { steps: 4 })
  await page.mouse.move(tx, ty, { steps: 4 })
  // 指示线已渲染 = 拖拽激活 + 边界非 home 的可见证据（函数契约禁止 home 边界——
  // ×10 连跑实证固定延时在并行负载下不够；poll 由 DOM 事实收口，home 边界时明确暴露而非静默）
  await expect(page.locator('.rail-drop-line')).toHaveCount(1, { timeout: 3000 })
  if (opts?.hold) await opts.hold()
  await page.mouse.up()
}

/** 库页「新建空白表」向导直达编辑台（FR-C6；UX-S14 用） */
export async function openBlankEditor(
  page: Page,
  rows: number,
  cols: number,
  levels = 1,
): Promise<void> {
  await page.goto('/')
  await page.getByTestId('blank-open').click()
  await page.getByTestId('blank-rows').fill(String(rows))
  await page.getByTestId('blank-cols').fill(String(cols))
  await page.getByTestId('blank-levels').selectOption(String(levels))
  await page.getByTestId('blank-create').click()
  await expect(page.locator('.preview-host canvas').first()).toBeVisible()
  await page.waitForTimeout(300)
}

/**
 * 删除确认框摘要的区间聚合三计数文案件（UX-S11；tc096 与核内同源核对用）。
 * 计数来自 previewStructuralRange（跨区间合并区只计一次、filled 求和），0 计数不出现。
 */
export function rangeImpactSummaryParts(
  inst: TemplateInstance,
  axis: RailAxis,
  lo: number,
  hi: number,
): string[] {
  const impact = previewStructuralRange(inst, axis, lo, hi)
  const parts: string[] = []
  if (impact.filledCellCount > 0) parts.push(`${impact.filledCellCount} 格内容`)
  if (impact.affectedMergeCount > 0) parts.push(`${impact.affectedMergeCount} 处合并区`)
  if (impact.affectedBlockCount > 0) parts.push(`${impact.affectedBlockCount} 个区块`)
  return parts
}

/**
 * 键盘导航选格（cellNav 纯网格步进：目标格落合并区 → 选区扩成整块，无像素依赖）。
 * 窄视口下 VTable 拆多 canvas（冻结列 32px 画布在前）+ 横滚，像素点击定位不可靠
 * （tc098/tc099 实证）——替路：方向键逐格走到目标格。
 * keys 为方向键序列；首按从无选区起步到 [0,0]（PreviewHost 键盘起步口径），
 * 起步格 [0,0] 处于结构合并区时按方向键会被并块吸回（如 compare 起步后需先 ArrowRight 出块）。
 */
export async function selectCellByKeys(
  page: Page,
  keys: string[],
  slotId: string,
): Promise<void> {
  await page.locator('[data-testid="preview-canvas"]').focus()
  await page.keyboard.press('ArrowDown') // 无选区 → 选区起步 [0,0]
  for (const k of keys) await page.keyboard.press(k)
  await expect(page.locator('.preview-host')).toHaveAttribute('data-pt-selected-slot', slotId)
}
