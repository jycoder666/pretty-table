import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { clickSlot, openPreset, presetOf, slotVisualPos } from '../e2e/acceptance/helpers'
import { buildVisualRows, colWidthAt } from '../src/core/index'

/**
 * F4 定因：预览画布图片「颜色轻微漂移」（导出无漂移）。
 * 假设：不是色彩变换，而是**重度缩小采样**——图片格仅约 113×35 CSS px，
 * 而源图 480×320（纵向约 9×、横向约 4.25× 缩小，且 object-fit:cover 裁中带），
 * 细黑对角线/白圆环被插值摊进邻域，最红像素因此拿不到纯 (255,0,0)。
 *
 * 判据：
 * ① 同一张图在页面里 1:1 绘制 → 必须出现精确 (255,0,0)（证明管线无色彩变换）；
 * ② 把预览的 deviceScaleFactor 提到 2（画布像素翻倍，采样密度≈导出 2×）→
 *    最红像素应达到 (255,0,0)（证明差异只随采样密度变化，与预览/导出路无关）。
 */

const OUT = join(process.cwd(), 'reports', 'manual-verify-2026-10-22')
mkdirSync(OUT, { recursive: true })
const FIXTURE = join(OUT, 'source-image-480x320.png')
const SLOT = 'row.6.val.a'

const evidence: Record<string, unknown> = {}
test.afterAll(() => {
  writeFileSync(join(OUT, 'f4-preview-color.json'), JSON.stringify(evidence, null, 2), 'utf8')
})

/** 与 real-machine.spec.ts 同源的四象限测试图（缺文件时重建，内容确定） */
async function ensureFixture(page: Page): Promise<string> {
  if (existsSync(FIXTURE)) return FIXTURE
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 480
    c.height = 320
    const g = c.getContext('2d')!
    g.fillStyle = '#ff0000'
    g.fillRect(0, 0, 240, 160)
    g.fillStyle = '#0000ff'
    g.fillRect(240, 0, 240, 160)
    g.fillStyle = '#ffff00'
    g.fillRect(0, 160, 240, 160)
    g.fillStyle = '#00c000'
    g.fillRect(240, 160, 240, 160)
    g.beginPath()
    g.moveTo(0, 0)
    g.lineTo(480, 320)
    g.moveTo(480, 0)
    g.lineTo(0, 320)
    g.lineWidth = 4
    g.strokeStyle = '#000000'
    g.stroke()
    return c.toDataURL('image/png')
  })
  writeFileSync(FIXTURE, Buffer.from(dataUrl.split(',')[1]!, 'base64'))
  return FIXTURE
}

/** 1:1 对照：源图直接画进 canvas 采样（不经预览/导出路径） */
async function scanSourceAt1x(page: Page) {
  return page.evaluate(async () => {
    const res = await fetch(document.querySelector<HTMLImageElement>('#ptv-probe')?.src ?? '')
    const bmp = await createImageBitmap(await res.blob())
    const cv = new OffscreenCanvas(bmp.width, bmp.height)
    const g = cv.getContext('2d')!
    g.drawImage(bmp, 0, 0)
    const d = g.getImageData(0, 0, bmp.width, bmp.height).data
    let pure = 0
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] === 255 && d[i + 1] === 0 && d[i + 2] === 0 && d[i + 3] === 255) pure++
    }
    return { width: bmp.width, height: bmp.height, pureRed: pure }
  })
}

/** 预览画布：目标槽矩形内的近红/纯红像素 + 最红像素 + 高频色（同源几何换算） */
async function scanPreviewCell(page: Page, slotId: string) {
  const inst = presetOf('compare-alpha-v1')
  const { row, col } = slotVisualPos(inst, slotId)
  const { rowHeights } = buildVisualRows(inst)
  let x = 0
  for (let c = 0; c < col; c++) x += colWidthAt(inst, c)
  let y = 0
  for (let r = 0; r < row; r++) y += rowHeights[r] ?? 36
  const w = colWidthAt(inst, col)
  const h = rowHeights[row] ?? 36
  return page.evaluate(
    ({ x, y, w, h }) => {
      const canvases = Array.from(
        document.querySelectorAll('.preview-host canvas'),
      ) as HTMLCanvasElement[]
      let red = 0
      let pureRed = 0
      let best = { r: 0, g: 0, b: 0, a: 0, x: -1, y: -1 }
      let dpr = 0
      const hist = new Map<string, number>()
      for (const cv of canvases) {
        const g = cv.getContext('2d')
        if (!g) continue
        const rect = cv.getBoundingClientRect()
        dpr = rect.width > 0 ? cv.width / rect.width : 1
        const sx = Math.max(0, Math.floor(x * dpr))
        const sy = Math.max(0, Math.floor(y * dpr))
        const sw = Math.min(cv.width - sx, Math.ceil(w * dpr))
        const sh = Math.min(cv.height - sy, Math.ceil(h * dpr))
        if (sw <= 0 || sh <= 0) continue
        const d = g.getImageData(sx, sy, sw, sh).data
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i]!
          const gg = d[i + 1]!
          const b = d[i + 2]!
          const a = d[i + 3]!
          const n = i / 4
          const px = sx + (n % sw)
          const py = sy + Math.floor(n / sw)
          if (r > 200 && gg < 80 && b < 80) red++
          if (r === 255 && gg === 0 && b === 0 && a === 255) pureRed++
          if (a === 255) {
            const key = `${r},${gg},${b}`
            hist.set(key, (hist.get(key) ?? 0) + 1)
          }
          if (a > 0 && r - gg + (r - b) > best.r - best.g + (best.r - best.b)) {
            best = { r, g: gg, b, a, x: px, y: py }
          }
        }
      }
      const topColors = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
      return { dpr, nearRed: red, pureRed, best, topColors, cell: { x, y, w, h } }
    },
    { x, y, w, h },
  )
}

async function uploadToSlot(page: Page) {
  const fixture = await ensureFixture(page)
  // 先给 1:1 对照用的 <img>（data URL，同源可 fetch）
  const b64 = Buffer.from(await (await import('node:fs/promises')).readFile(fixture)).toString('base64')
  await page.evaluate((src) => {
    const img = document.createElement('img')
    img.id = 'ptv-probe'
    img.src = src
    img.style.cssText = 'position:fixed;left:-9999px;top:0'
    document.body.appendChild(img)
  }, `data:image/png;base64,${b64}`)
  await clickSlot(page, presetOf('compare-alpha-v1'), SLOT)
  await expect(page.getByTestId('image-area')).toBeVisible()
  await page.getByTestId('image-file').setInputFiles(fixture)
  await expect(page.getByTestId('image-thumb')).toBeVisible()
  await page.waitForTimeout(600)
}

test.describe('F4 定因 · 预览 dpr=1', () => {
  test('1:1 对照出现纯红；预览格内最红像素量化', async ({ page }) => {
    await openPreset(page, '多列对比表')
    await uploadToSlot(page)
    const oneToOne = await scanSourceAt1x(page)
    const cell = await scanPreviewCell(page, SLOT)
    evidence.dpr1 = { oneToOne, cell }
    expect(oneToOne.pureRed, '1:1 绘制应出现精确 (255,0,0)，证明管线无色彩变换').toBeGreaterThan(0)
    expect(cell.nearRed).toBeGreaterThan(50)
  })
})

test.describe('F4 定因 · 预览 dpr=2', () => {
  test.use({ deviceScaleFactor: 2 })
  test('画布像素翻倍后，预览格内出现纯红 → 差异只随采样密度变化', async ({ page }) => {
    await openPreset(page, '多列对比表')
    await uploadToSlot(page)
    const oneToOne = await scanSourceAt1x(page)
    const cell = await scanPreviewCell(page, SLOT)
    evidence.dpr2 = { oneToOne, cell }
    expect(oneToOne.pureRed).toBeGreaterThan(0)
    expect(cell.nearRed).toBeGreaterThan(50)
  })
})
