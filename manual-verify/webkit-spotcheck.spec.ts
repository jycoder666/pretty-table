import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { clickSlot, openExportDrawer, openPreset, presetOf } from '../e2e/acceptance/helpers'
import { buildVisualRows, colWidthAt } from '../src/core/index'

/**
 * Mac/Safari 抽查的 Windows 近似：Playwright WebKit（Safari 引擎）真机运行。
 * 覆盖用户清单：PNG 抽查 / 拖拽 / 刷新恢复。
 * 注意：WebKit 不支持 Playwright 的 clipboard-read/write 权限授予，故本文件不用剪贴板。
 * 运行：pnpm exec playwright test --config manual-verify/playwright.manual.config.ts webkit-spotcheck --browser=webkit
 */

const OUT = join(process.cwd(), 'reports', 'manual-verify-2026-10-22')
mkdirSync(OUT, { recursive: true })
const evidence: Record<string, unknown> = {}
test.afterAll(() => {
  writeFileSync(join(OUT, 'evidence-webkit.json'), JSON.stringify(evidence, null, 2), 'utf8')
})

async function makeTestImage(page: Page): Promise<string> {
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
    g.arc(240, 160, 70, 0, Math.PI * 2)
    g.fillStyle = '#ffffff'
    g.fill()
    g.lineWidth = 8
    g.strokeStyle = '#111111'
    g.stroke()
    return c.toDataURL('image/png')
  })
  const file = join(OUT, 'source-image-webkit.png')
  writeFileSync(file, Buffer.from(dataUrl.split(',')[1]!, 'base64'))
  return file
}

async function exportPng(page: Page, name: string): Promise<Uint8Array> {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByRole('button', { name: '导出 PNG' }).click(),
  ])
  const file = join(OUT, name)
  await download.saveAs(file)
  return new Uint8Array(readFileSync(file))
}

async function scanPng(page: Page, bytes: Uint8Array) {
  const b64 = Buffer.from(bytes).toString('base64')
  // WebKit 不支持 OffscreenCanvas/createImageBitmap：用 <img> + <canvas> 解码
  return page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const cv = document.createElement('canvas')
    cv.width = img.naturalWidth
    cv.height = img.naturalHeight
    const g = cv.getContext('2d')!
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, cv.width, cv.height).data
    let red = 0
    let cornerAlpha = -1
    let centerAlpha = -1
    const W = cv.width
    const H = cv.height
    for (let i = 0; i < d.length; i += 4) {
      const n = i / 4
      const x = n % W
      const y = Math.floor(n / W)
      if (d[i]! > 200 && d[i + 1]! < 80 && d[i + 2]! < 80) red++
      if (x === 2 && y === 2) cornerAlpha = d[i + 3]!
      if (x === Math.floor(W / 2) && y === Math.floor(H / 2)) centerAlpha = d[i + 3]!
    }
    return { width: W, height: H, red, cornerAlpha, centerAlpha }
  }, b64)
}

test.describe('WebKit（Safari 引擎）抽查', () => {
  test('PNG 导出：含图 + 三档尺寸 + 透明底', async ({ page }) => {
    test.setTimeout(180_000)
    await openPreset(page, '多列对比表')
    const imgFile = await makeTestImage(page)
    await clickSlot(page, presetOf('compare-alpha-v1'), 'row.6.val.a')
    await page.getByTestId('image-file').setInputFiles(imgFile)
    await expect(page.getByTestId('image-thumb')).toBeVisible()
    await page.waitForTimeout(600)

    await openExportDrawer(page)
    const dims: Record<string, { w: number; h: number }> = {}
    for (const label of ['1×', '2×', '3×']) {
      await page.locator('.seg-btn', { hasText: label }).click()
      const png = await exportPng(page, `webkit-exported-${label.replace('×', 'x')}.png`)
      const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
      dims[label] = { w: view.getUint32(16), h: view.getUint32(20) }
    }
    expect(dims['2×']!.w).toBeCloseTo(dims['1×']!.w * 2, -1)
    expect(dims['3×']!.w).toBeCloseTo(dims['1×']!.w * 3, -1)

    await page.locator('.seg-btn', { hasText: '2×' }).click()
    await page.getByRole('checkbox', { name: '透明底（表格外留白透明）' }).check()
    const trans = await exportPng(page, 'webkit-exported-2x-transparent.png')
    const scan = await scanPng(page, trans)
    evidence.png = { dims, transparent2x: scan }
    expect(scan.cornerAlpha, 'WebKit 透明底四角 alpha').toBe(0)
    expect(scan.centerAlpha, 'WebKit 中心不透明').toBe(255)
    expect(scan.red, 'WebKit 导出 PNG 内应有图片像素').toBeGreaterThan(50)
  })

  test('拖拽：组件库「分区色条」拖入表内槽位（真实指针手势）', async ({ page }) => {
    test.setTimeout(180_000)
    await openPreset(page, '多列对比表')

    // 拖前基线：应用内预览小窗（srcdoc iframe = 导出 HTML）里没有「分区」区块
    await openExportDrawer(page)
    await page.getByTestId('html-preview-btn').click()
    await expect(page.getByTestId('html-preview-overlay')).toBeVisible()
    const frame = await (await page.locator('[data-testid="html-preview-frame"]').elementHandle())?.contentFrame()
    expect(frame, '预览 iframe 应可访问').toBeTruthy()
    const before = (await frame!.locator('body').innerText()).replace(/\s+/g, '')
    expect(before.includes('分区'), '拖前不应有「分区」区块').toBe(false)
    await page.getByTestId('html-preview-close').click()
    // 关掉导出抽屉：抽屉遮罩会挡住左侧组件库，指针按下会落在遮罩上
    await page.getByRole('button', { name: '关闭' }).click()
    await expect(page.locator('.drawer')).toBeHidden()

    // 真实指针拖拽：库项 → 槽位（槽位仅拖拽期出现，故先按下再取坐标）
    const libItem = page.locator('.block-lib li', { hasText: '分区色条' })
    const libBox = (await libItem.boundingBox())!
    const cx = libBox.x + libBox.width / 2
    const cy = libBox.y + libBox.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.waitForTimeout(120)
    await page.mouse.move(cx + 12, cy + 6, { steps: 3 })
    await page.waitForTimeout(120)
    await page.mouse.move(cx + 60, cy + 30, { steps: 8 })
    await page.waitForTimeout(300)

    let path = 'pointer-drag'
    let slotCount = await page.locator('.slot-hit').count()
    if (slotCount === 0) {
      // 手势未激活：移出再回（部分实现需首帧阈值），仍无则回落 place 模式
      await page.mouse.move(cx + 200, cy + 200, { steps: 10 })
      await page.waitForTimeout(300)
      slotCount = await page.locator('.slot-hit').count()
      if (slotCount === 0) {
        await page.mouse.up()
        await page.waitForTimeout(200)
        path = 'place-mode-fallback'
        await libItem.click()
        await page.waitForTimeout(300)
        slotCount = await page.locator('.slot-hit').count()
      }
    }
    expect(slotCount, '应出现可放置槽位（拖拽期或待放置模式）').toBeGreaterThan(0)

    // 目标：第 2 个 gap 槽（gap-g2，accept 含 sectionBar）
    const target = page.locator('.slot-hit').nth(Math.min(1, slotCount - 1))
    const tb = (await target.boundingBox())!
    if (path === 'pointer-drag') {
      await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 20 })
      await page.waitForTimeout(300)
      await page.mouse.up()
    } else {
      await target.click()
    }
    await page.waitForTimeout(600)

    // 落位校验：导出 HTML（预览 iframe）里出现新「分区」区块
    await openExportDrawer(page)
    await page.getByTestId('html-preview-btn').click()
    await expect(page.getByTestId('html-preview-overlay')).toBeVisible()
    const frame2 = await (await page.locator('[data-testid="html-preview-frame"]').elementHandle())?.contentFrame()
    const after = (await frame2!.locator('body').innerText()).replace(/\s+/g, '')
    evidence.drag = {
      path,
      slotCount,
      beforeHasBlock: before.includes('分区'),
      afterHasBlock: after.includes('分区'),
      changed: before !== after,
    }
    expect(after.includes('分区'), '拖拽落位后导出 HTML 应含新「分区」区块').toBe(true)
    expect(after === before, '拖拽应改变表格内容').toBe(false)
  })

  test('刷新恢复：草稿（标记改动 + 图片）跨刷新保留', async ({ page }) => {
    test.setTimeout(180_000)
    await openPreset(page, '多列对比表')
    const imgFile = await makeTestImage(page)

    // 改一个标记槽为 ✗，再放一张图
    await clickSlot(page, presetOf('compare-alpha-v1'), 'row.2.val.a')
    const marks = page.getByRole('radiogroup', { name: '支持状态' })
    await marks.getByRole('button', { name: /不支持/ }).click()
    await expect(marks.getByRole('button', { name: /不支持/ })).toHaveAttribute('aria-pressed', 'true')
    await clickSlot(page, presetOf('compare-alpha-v1'), 'row.6.val.a')
    await page.getByTestId('image-file').setInputFiles(imgFile)
    await expect(page.getByTestId('image-thumb')).toBeVisible()
    await page.waitForTimeout(1200)

    // 刷新
    await page.reload()
    await expect(page.locator('.preview-host canvas').first()).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(600)

    // 恢复校验 1：✗ 标记仍在
    await clickSlot(page, presetOf('compare-alpha-v1'), 'row.2.val.a')
    const restored = await page
      .getByRole('radiogroup', { name: '支持状态' })
      .getByRole('button', { name: /不支持/ })
      .getAttribute('aria-pressed')

    // 恢复校验 2：图片格仍有图片像素
    const inst = presetOf('compare-alpha-v1')
    const { row, col } = (() => {
      const { metas } = buildVisualRows(inst)
      for (let r = 0; r < metas.length; r++)
        for (let c = 0; c < (metas[r]?.length ?? 0); c++)
          if (metas[r]![c]?.slotId === 'row.6.val.a') return { row: r, col: c }
      throw new Error('slot not found')
    })()
    const { rowHeights } = buildVisualRows(inst)
    let x = 0
    for (let c = 0; c < col; c++) x += colWidthAt(inst, c)
    let y = 0
    for (let r = 0; r < row; r++) y += rowHeights[r] ?? 36
    const w = colWidthAt(inst, col)
    const h = rowHeights[row] ?? 36
    const red = await page.evaluate(
      ({ x, y, w, h }) => {
        const canvases = Array.from(document.querySelectorAll('.preview-host canvas')) as HTMLCanvasElement[]
        let n = 0
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
          const d = g.getImageData(sx, sy, sw, sh).data
          for (let i = 0; i < d.length; i += 4) {
            if (d[i]! > 200 && d[i + 1]! < 80 && d[i + 2]! < 80) n++
          }
        }
        return n
      },
      { x, y, w, h },
    )
    evidence.refreshRecovery = { markNoPressedAfterReload: restored, imageRedPixelsAfterReload: red }
    await page.locator('.preview-host').screenshot({ path: join(OUT, 'webkit-after-reload.png') })
    expect(restored, '刷新后 ✗ 标记应保留').toBe('true')
    expect(red, '刷新后图片格应仍有图片像素').toBeGreaterThan(50)
  })
})
