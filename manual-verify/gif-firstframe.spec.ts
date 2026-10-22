import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import {
  clickSlot,
  openExportDrawer,
  openPreset,
  presetOf,
  slotVisualPos,
} from '../e2e/acceptance/helpers'
import { buildVisualRows, colWidthAt } from '../src/core/index'

/**
 * 真机人工项 · E2「动图按第一帧显示」（落地记录 §11.9 清单：VTable 图片格 / 动图首帧肉眼点验）
 *
 * 夹具：fixture-animated-2x2.gif（自建，帧 1 = 纯红、帧 2 = 纯蓝，各 1s，无限循环）。
 * 本机无 ffmpeg/ImageMagick，GDI+ 不支持多帧 GIF 输出，故按 GIF89a 手写字节；
 * 用例内先用「屏幕截图取样」证明该夹具在 Chromium 里确实是动的（否则本用例不成立），
 * 再验证应用：预览画布与导出 PNG 都稳定呈现帧 1（红），不随动画漂移到帧 2（蓝）。
 */

const OUT = join(process.cwd(), 'reports', 'manual-verify-2026-10-22')
mkdirSync(OUT, { recursive: true })
const GIF = join(OUT, 'fixture-animated-2x2.gif')
const GIF_ALT = join(OUT, 'fixture-animated-2frame.gif')

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

/** 预览画布目标槽内红/蓝像素计数（同源几何换算，与 e2e helpers 一致） */
async function scanCellRedBlue(page: Page, slotId: string) {
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
      let blue = 0
      let scanned = 0
      for (const cv of canvases) {
        const g = cv.getContext('2d')
        if (!g) continue
        const rect = cv.getBoundingClientRect()
        const dpr = rect.width > 0 ? cv.width / rect.width : 1
        const sx = Math.max(0, Math.floor(x * dpr))
        const sy = Math.max(0, Math.floor(y * dpr))
        const sw = Math.min(cv.width - sx, Math.ceil(w * dpr))
        const sh = Math.min(cv.height - sy, Math.ceil(h * dpr))
        if (sw <= 0 || sh <= 0) continue
        scanned++
        const d = g.getImageData(sx, sy, sw, sh).data
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i]!
          const gg = d[i + 1]!
          const b = d[i + 2]!
          if (r > 180 && gg < 90 && b < 90) red++
          if (b > 180 && r < 90 && gg < 90) blue++
        }
      }
      return { red, blue, canvasesScanned: scanned }
    },
    { x, y, w, h },
  )
}

/** 导出 PNG 全图红/蓝像素计数 */
async function scanPngRedBlue(page: Page, bytes: Uint8Array) {
  const b64 = Buffer.from(bytes).toString('base64')
  return page.evaluate(
    async ({ b64 }) => {
      const bin = atob(b64)
      const buf = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
      const bmp = await createImageBitmap(new Blob([buf], { type: 'image/png' }))
      const cv = new OffscreenCanvas(bmp.width, bmp.height)
      const g = cv.getContext('2d')!
      g.drawImage(bmp, 0, 0)
      const d = g.getImageData(0, 0, bmp.width, bmp.height).data
      let red = 0
      let blue = 0
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i]!
        const gg = d[i + 1]!
        const b = d[i + 2]!
        if (r > 180 && gg < 90 && b < 90) red++
        if (b > 180 && r < 90 && gg < 90) blue++
      }
      return { width: bmp.width, height: bmp.height, red, blue }
    },
    { b64 },
  )
}

/** 夹具自检：把 GIF 放进真实页面，按 ~1s 间隔截屏取样（截屏=肉眼所见），返回颜色序列 */
async function fixtureAnimates(page: Page, gifPath: string) {
  const b64 = readFileSync(gifPath).toString('base64')
  const probe = await page.context().newPage()
  await probe.setContent(
    '<body style="margin:0;background:#fff"><img src="data:image/gif;base64,' +
      b64 +
      '" style="width:120px;height:120px;display:block;margin:20px">',
  )
  await probe.waitForTimeout(1200)
  const seq: string[] = []
  for (const wait of [0, 1000, 1000, 1000]) {
    if (wait) await probe.waitForTimeout(wait)
    const shot = await probe.screenshot({ clip: { x: 60, y: 60, width: 10, height: 10 } })
    const px = await probe.evaluate(async (u) => {
      const im = new Image()
      im.src = u
      await im.decode()
      const c = document.createElement('canvas')
      c.width = im.naturalWidth
      c.height = im.naturalHeight
      const g = c.getContext('2d')!
      g.drawImage(im, 0, 0)
      const d = g.getImageData(2, 2, 1, 1).data
      return `${d[0]},${d[1]},${d[2]}`
    }, 'data:image/png;base64,' + shot.toString('base64'))
    seq.push(px)
  }
  await probe.close()
  return seq
}

test.describe('真机人工项 · E2 动图首帧', () => {
  test('夹具自检：自建 GIF 在 Chromium 中确实在动（帧 1 红 / 帧 2 蓝 交替）', async ({ page }) => {
    const seq2 = await fixtureAnimates(page, GIF)
    const seq1 = await fixtureAnimates(page, GIF_ALT)
    const uniq2 = [...new Set(seq2)]
    expect(uniq2.length, `2×2 夹具应出现两种颜色，实测 ${JSON.stringify(seq2)}`).toBeGreaterThan(1)
    expect(uniq2.some((c) => c.startsWith('255,0,0'))).toBe(true)
    expect(uniq2.some((c) => c.startsWith('0,0,255'))).toBe(true)
    writeFileSync(
      join(OUT, 'evidence-gif-fixture.json'),
      JSON.stringify({ '2x2': seq2, '1x1': seq1, uniq1: [...new Set(seq1)] }, null, 2),
      'utf8',
    )
  })

  test('上传动图 → 提示文案可见 → 预览与导出 PNG 稳定为帧 1（红），不漂移到帧 2（蓝）', async ({
    page,
  }) => {
    await openPreset(page, '多列对比表')
    await clickSlot(page, presetOf('compare-alpha-v1'), 'row.6.val.a')
    await expect(page.getByTestId('image-area')).toBeVisible()
    // 规格文案：图片区提示「动图按第一帧显示」
    await expect(page.getByText('动图按第一帧显示')).toBeVisible()

    await page.getByTestId('image-file').setInputFiles(GIF)
    await expect(page.getByTestId('image-thumb')).toBeVisible()
    await expect(page.getByTestId('slot-headline')).toHaveText('图片')
    await page.waitForTimeout(600)

    // 跨过动图换帧时刻连续取样三次（间隔 1.1s > 帧长 1s）
    const s1 = await scanCellRedBlue(page, 'row.6.val.a')
    await page.waitForTimeout(1100)
    const s2 = await scanCellRedBlue(page, 'row.6.val.a')
    await page.waitForTimeout(1100)
    const s3 = await scanCellRedBlue(page, 'row.6.val.a')
    await page.locator('.preview-host').screenshot({ path: join(OUT, 'app-preview-gif.png') })

    await openExportDrawer(page)
    await page.locator('.seg-btn', { hasText: '2×' }).click()
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      page.getByRole('button', { name: '导出 PNG' }).click(),
    ])
    const pngPath = join(OUT, 'exported-2x-gif.png')
    await download.saveAs(pngPath)
    const pngBytes = new Uint8Array(readFileSync(pngPath))
    const png = await scanPngRedBlue(page, pngBytes)

    const result = { preview: [s1, s2, s3], png, bytes: pngBytes.length }
    writeFileSync(join(OUT, 'evidence-gif.json'), JSON.stringify(result, null, 2), 'utf8')

    // 预览：三次取样都必须有帧 1 的红色像素、且没有帧 2 的蓝色像素
    for (const [i, s] of [s1, s2, s3].entries()) {
      expect(s.red, `第 ${i + 1} 次取样应有帧 1 红色像素`).toBeGreaterThan(50)
      expect(s.blue, `第 ${i + 1} 次取样不应出现帧 2 蓝色像素`).toBe(0)
    }
    // 导出 PNG：同为帧 1
    expect(png.red, '导出 PNG 应有帧 1 红色像素').toBeGreaterThan(50)
    expect(png.blue, '导出 PNG 不应出现帧 2 蓝色像素').toBe(0)
  })
})
