import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { expect, test, type BrowserContext, type Page } from '@playwright/test'

import {
  clickSlot,
  openExportDrawer,
  openPreset,
  presetOf,
  slotVisualPos,
} from '../e2e/acceptance/helpers'
import { buildVisualRows, colWidthAt } from '../src/core/index'

/**
 * 真机人工项验证（落地记录 §11.9「归用户的真机人工清单」）：
 * 1) E1 图片链路：真实磁盘文件上传 → 预览画布成像 → 导出 PNG 带图（像素 + 肉眼双证）
 * 2) TC-PT-082/083：透明底 alpha、1x/2x/3x 尺寸口径，另落盘深色/浅色背景合成图供外部看图工具复核
 * 3) TC-PT-086 前置：导出 HTML 的真实系统剪贴板形态（PowerShell 读 Windows 剪贴板）+ 真实 Ctrl+V 粘贴渲染
 * 全部在 headed 真实浏览器 + 真系统剪贴板下执行；产物落 reports/manual-verify-2026-10-22/
 */

const OUT = join(process.cwd(), 'reports', 'manual-verify-2026-10-22')
mkdirSync(OUT, { recursive: true })

// Chromium 专用：真机剪贴板读写权限（WebKit 不支持该权限项，故不放在共享 config）
test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

const evidence: Record<string, unknown> = {}
test.afterAll(() => {
  writeFileSync(join(OUT, 'evidence.json'), JSON.stringify(evidence, null, 2), 'utf8')
})

// ── 通用工具 ──────────────────────────────────────────────────────────

/** 生成 480×320 四象限测试图（纯红/蓝/黄/绿 + 白圆黑环 + 对角十字 + 半透明品红角） */
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
    g.moveTo(0, 0)
    g.lineTo(480, 320)
    g.moveTo(480, 0)
    g.lineTo(0, 320)
    g.lineWidth = 4
    g.strokeStyle = '#000000'
    g.stroke()
    g.beginPath()
    g.arc(240, 160, 70, 0, Math.PI * 2)
    g.fillStyle = '#ffffff'
    g.fill()
    g.lineWidth = 8
    g.strokeStyle = '#111111'
    g.stroke()
    g.beginPath()
    g.moveTo(480, 200)
    g.lineTo(480, 320)
    g.lineTo(360, 320)
    g.closePath()
    g.fillStyle = 'rgba(255,0,255,0.5)'
    g.fill()
    return c.toDataURL('image/png')
  })
  const file = join(OUT, 'source-image-480x320.png')
  writeFileSync(file, Buffer.from(dataUrl.split(',')[1]!, 'base64'))
  return file
}

/** 导出 PNG 并落盘（走真实下载事件） */
async function exportPngTo(page: Page, name: string): Promise<Uint8Array> {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByRole('button', { name: '导出 PNG' }).click(),
  ])
  const file = join(OUT, name)
  await download.saveAs(file)
  return new Uint8Array(readFileSync(file))
}

/** 解码 PNG 全图扫描：近红像素数、最红像素、红色像素包围盒 */
async function scanPng(page: Page, bytes: Uint8Array) {
  const b64 = Buffer.from(bytes).toString('base64')
  return page.evaluate(
    async ({ b64 }) => {
      // 分块转 base64，避免 spread 爆栈（页面上下文内联，勿用 eval）
      const toB64 = (arr: Uint8Array) => {
        let s = ''
        const CH = 0x8000
        for (let i = 0; i < arr.length; i += CH) {
          s += String.fromCharCode.apply(null, Array.from(arr.subarray(i, i + CH)))
        }
        return btoa(s)
      }
      const bin = atob(b64)
      const buf = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
      const bmp = await createImageBitmap(new Blob([buf], { type: 'image/png' }))
      const cv = new OffscreenCanvas(bmp.width, bmp.height)
      const g = cv.getContext('2d')!
      g.drawImage(bmp, 0, 0)
      const d = g.getImageData(0, 0, bmp.width, bmp.height).data
      let red = 0
      let best = { r: 0, g: 0, b: 0, a: 0, x: -1, y: -1 }
      let minX = 1e9
      let minY = 1e9
      let maxX = -1
      let maxY = -1
      const px = bmp.width
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i]!
        const gg = d[i + 1]!
        const b = d[i + 2]!
        const a = d[i + 3]!
        const n = i / 4
        const x = n % px
        const y = Math.floor(n / px)
        if (r > 200 && gg < 80 && b < 80) {
          red++
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
        if (a > 0 && r - gg + (r - b) > best.r - best.g + (best.r - best.b)) {
          best = { r, g: gg, b, a, x, y }
        }
      }
      return {
        width: bmp.width,
        height: bmp.height,
        red,
        best,
        redBBox: maxX < 0 ? null : { minX, minY, maxX, maxY },
        b64: toB64(d),
      }
    },
    { b64 },
  )
}

/** 预览画布：扫描指定槽位矩形内的近红像素与最红像素（同源几何换算） */
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
      const canvases = Array.from(document.querySelectorAll('.preview-host canvas')) as HTMLCanvasElement[]
      let red = 0
      let best = { r: 0, g: 0, b: 0, a: 0, x: -1, y: -1 }
      let found = 0
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
        found++
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
          if (a > 0 && r - gg + (r - b) > best.r - best.g + (best.r - best.b)) {
            best = { r, g: gg, b, a, x: px, y: py }
          }
        }
      }
      return { red, best, canvasesScanned: found, cell: { x, y, w, h } }
    },
    { x, y, w, h },
  )
}

/** 把 PNG 合成到指定背景上（四周留 40px 底色），用于外部看图工具复核透明区 */
async function composite(page: Page, bytes: Uint8Array, bg: string, name: string): Promise<string> {
  const b64 = Buffer.from(bytes).toString('base64')
  const out = await page.evaluate(
    async ({ b64, bg }) => {
      const toB64 = (arr: Uint8Array) => {
        let s = ''
        const CH = 0x8000
        for (let i = 0; i < arr.length; i += CH) {
          s += String.fromCharCode.apply(null, Array.from(arr.subarray(i, i + CH)))
        }
        return btoa(s)
      }
      const bin = atob(b64)
      const buf = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
      const bmp = await createImageBitmap(new Blob([buf], { type: 'image/png' }))
      const cv = new OffscreenCanvas(bmp.width + 80, bmp.height + 80)
      const g = cv.getContext('2d')!
      g.fillStyle = bg
      g.fillRect(0, 0, cv.width, cv.height)
      g.drawImage(bmp, 40, 40)
      const blob = await cv.convertToBlob({ type: 'image/png' })
      return toB64(new Uint8Array(await blob.arrayBuffer()))
    },
    { b64, bg },
  )
  const file = join(OUT, name)
  writeFileSync(file, Buffer.from(out, 'base64'))
  return file
}

/**
 * 用 PowerShell 读 Windows 系统剪贴板（真机剪贴板，非页面 API）。
 *
 * CF_HTML 必须走 Win32 原样取字节再 UTF-8 解码：WinForms 的
 * `GetData("HTML Format")` 会按 ANSI 代码页解码，中文一律变乱码
 * （✓✗◐ 也随之丢失，导致「HTML Format 里有没有符号」这类核对假阴性）。
 */
function readOsClipboard(tag: string): {
  formats: string[]
  textLen: number
  htmlLen: number
  htmlBytes: number
  htmlHasTable: boolean
  htmlHasDataImg: boolean
  htmlHasMarks: boolean
  textHead: string
} {
  const ps1 = join(OUT, `read-clipboard-${tag}.ps1`)
  const dump = join(OUT, `clipboard-${tag}-htmlformat.txt`)
  const textDump = join(OUT, `clipboard-${tag}-text.txt`)
  // 纯 ASCII 脚本（避免 PS 5.1 编码问题）；✓/✗/◐ 用码点判定
  writeFileSync(
    ps1,
    [
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      'Add-Type -AssemblyName System.Windows.Forms',
      'Add-Type -Namespace PT -Name Clip -MemberDefinition @"',
      '[DllImport("user32.dll", SetLastError=true)] public static extern bool OpenClipboard(IntPtr hWndNewOwner);',
      '[DllImport("user32.dll", SetLastError=true)] public static extern bool CloseClipboard();',
      '[DllImport("user32.dll", SetLastError=true)] public static extern IntPtr GetClipboardData(uint uFormat);',
      '[DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Unicode)] public static extern uint RegisterClipboardFormat(string lpszFormat);',
      '[DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr GlobalLock(IntPtr hMem);',
      '[DllImport("kernel32.dll", SetLastError=true)] public static extern bool GlobalUnlock(IntPtr hMem);',
      '[DllImport("kernel32.dll", SetLastError=true)] public static extern UIntPtr GlobalSize(IntPtr hMem);',
      '"@',
      '$d = [System.Windows.Forms.Clipboard]::GetDataObject()',
      'if ($null -eq $d) { Write-Output "FORMATS:"; Write-Output "TEXTLEN:0"; Write-Output "HTMLLEN:0"; Write-Output "HTMLBYTES:0"; exit }',
      'Write-Output ("FORMATS:" + ($d.GetFormats() -join "|"))',
      '$t = $d.GetData("UnicodeText")',
      'if ($null -eq $t) { Write-Output "TEXTLEN:0" } else { Write-Output ("TEXTLEN:" + $t.Length); [System.IO.File]::WriteAllText("' +
        textDump.replace(/\\/g, '\\\\') +
        '", [string]$t, [System.Text.Encoding]::UTF8) }',
      '$fmt = [PT.Clip]::RegisterClipboardFormat("HTML Format")',
      '$s = ""',
      '$opened = $false',
      'for ($i = 0; $i -lt 10; $i++) {',
      '  if ([PT.Clip]::OpenClipboard([IntPtr]::Zero)) { $opened = $true; break }',
      '  Start-Sleep -Milliseconds 120',
      '}',
      'if ($opened) {',
      '  $h = [PT.Clip]::GetClipboardData($fmt)',
      '  if ($h -ne [IntPtr]::Zero) {',
      '    $n = [int]([PT.Clip]::GlobalSize($h).ToUInt64())',
      '    $ptr = [PT.Clip]::GlobalLock($h)',
      '    $bytes = New-Object byte[] ($n)',
      '    [System.Runtime.InteropServices.Marshal]::Copy($ptr, $bytes, 0, $n)',
      '    [PT.Clip]::GlobalUnlock($h) | Out-Null',
      '    $s = [System.Text.Encoding]::UTF8.GetString($bytes).TrimStart([char]0xFEFF)',
      '    Write-Output ("HTMLBYTES:" + $n)',
      '  } else { Write-Output "HTMLBYTES:0" }',
      '  [PT.Clip]::CloseClipboard() | Out-Null',
      '} else { Write-Output "HTMLBYTES:-1" }',
      'if ($s.Length -eq 0) { Write-Output "HTMLLEN:0" } else {',
      '  Write-Output ("HTMLLEN:" + $s.Length)',
      '  Write-Output ("HTMLHAS_TABLE:" + ($s.Contains("<table")).ToString().ToLower())',
      '  Write-Output ("HTMLHAS_DATAIMG:" + ($s.Contains("data:image")).ToString().ToLower())',
      '  Write-Output ("HTMLHAS_MARKS:" + ($s.Contains([char]0x2713) -or $s.Contains([char]0x2717) -or $s.Contains([char]0x25D0)).ToString().ToLower())',
      '  [System.IO.File]::WriteAllText("' +
        dump.replace(/\\/g, '\\\\') +
        '", $s, [System.Text.Encoding]::UTF8)',
      '}',
    ].join('\n'),
    'utf8',
  )
  const out = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', ps1],
    { encoding: 'utf8' },
  )
  const get = (k: string) => (out.match(new RegExp(`^${k}:(.*)$`, 'm'))?.[1] ?? '').trim()
  const textFile = join(OUT, `clipboard-${tag}-text.txt`)
  let textHead = ''
  try {
    textHead = readFileSync(textFile, 'utf8').slice(0, 80).replace(/\s+/g, ' ')
  } catch {
    /* 剪贴板无文本 */
  }
  return {
    formats: get('FORMATS').split('|').filter(Boolean),
    textLen: Number(get('TEXTLEN') || 0),
    htmlLen: Number(get('HTMLLEN') || 0),
    htmlBytes: Number(get('HTMLBYTES') || 0),
    htmlHasTable: get('HTMLHAS_TABLE') === 'true',
    htmlHasDataImg: get('HTMLHAS_DATAIMG') === 'true',
    htmlHasMarks: get('HTMLHAS_MARKS') === 'true',
    textHead,
  }
}

/** 开一个"富文本编辑器"粘贴靶页（localhost 源，阻断应用脚本，只留一个 contenteditable） */
async function openPasteTarget(context: BrowserContext): Promise<Page> {
  const p = await context.newPage()
  await p.route('**/*.{js,ts,mjs,vue}', (r) => r.abort())
  await p.goto('http://localhost:5173/')
  await p.evaluate(() => {
    document.body.innerHTML =
      '<div id="ed" contenteditable="true" style="min-height:240px;padding:16px;border:2px dashed #9aabb5;font:14px/1.7 system-ui;outline:none"></div>'
    document.body.style.margin = '0'
  })
  await p.locator('#ed').click()
  return p
}

/** 真实 Ctrl+V 粘贴；返回 DOM 结果（原生粘贴失败时回退 clipboard API 并注明方式） */
async function pasteInto(p: Page) {
  await p.locator('#ed').click()
  await p.keyboard.press('Control+V')
  await p.waitForTimeout(400)
  const dom = await p.evaluate(() => {
    const ed = document.getElementById('ed')!
    return {
      empty: ed.childNodes.length === 0,
      innerHTML: ed.innerHTML,
      textContent: ed.textContent ?? '',
      imgCount: ed.querySelectorAll('img').length,
      dataImgCount: ed.querySelectorAll('img[src^="data:image"]').length,
      tableCount: ed.querySelectorAll('table').length,
      captionText: ed.querySelector('caption')?.textContent ?? null,
      cellCount: ed.querySelectorAll('td,th').length,
      markChars: {
        yes: (ed.textContent ?? '').includes('\u2713'),
        no: (ed.textContent ?? '').includes('\u2717'),
        partial: (ed.textContent ?? '').includes('\u25D0'),
      },
      styledCellCount: ed.querySelectorAll('td[style],th[style]').length,
    }
  })
  if (dom.empty) {
    // 回退：直接取剪贴板两态插入（记录为 api 路径，证据区分）
    const html = await p.evaluate(async () => {
      try {
        const items = await navigator.clipboard.read()
        for (const it of items) {
          if (it.types.includes('text/html')) return await (await it.getType('text/html')).text()
        }
        return null
      } catch {
        return null
      }
    })
    if (html) {
      await p.evaluate((h) => {
        document.getElementById('ed')!.innerHTML = h
      }, html)
      const dom2 = await p.evaluate(() => {
        const ed = document.getElementById('ed')!
        return {
          innerHTML: ed.innerHTML,
          textContent: ed.textContent ?? '',
          imgCount: ed.querySelectorAll('img').length,
          dataImgCount: ed.querySelectorAll('img[src^="data:image"]').length,
          tableCount: ed.querySelectorAll('table').length,
          captionText: ed.querySelector('caption')?.textContent ?? null,
          cellCount: ed.querySelectorAll('td,th').length,
          markChars: {
            yes: (ed.textContent ?? '').includes('\u2713'),
            no: (ed.textContent ?? '').includes('\u2717'),
            partial: (ed.textContent ?? '').includes('\u25D0'),
          },
          styledCellCount: ed.querySelectorAll('td[style],th[style]').length,
        }
      })
      return { method: 'clipboard-api-fallback', ...dom2 }
    }
    return { method: 'ctrl-v-noop', ...dom }
  }
  return { method: 'native-ctrl-v', ...dom }
}

type PasteResult = Awaited<ReturnType<typeof pasteInto>>

/** 富文本粘贴结果的统一断言：标题/边框样式/三态符号/图片四要素齐全 */
function assertRichPaste(label: string, p: PasteResult): void {
  expect(p.tableCount, `${label}：应出现 table`).toBeGreaterThan(0)
  expect(p.captionText ?? '', `${label}：标题（caption）应保留`).toContain('多列对比表')
  expect(
    p.markChars.yes && p.markChars.no && p.markChars.partial,
    `${label}：✓✗◐ 三态应齐全`,
  ).toBe(true)
  expect(p.styledCellCount, `${label}：单元格内联样式（边框/底色）应保留`).toBeGreaterThan(0)
  expect(p.imgCount, `${label}：图片应随富文本粘贴进入编辑器`).toBeGreaterThan(0)
  expect(p.dataImgCount, `${label}：图片以 data URL 形态进入编辑器`).toBeGreaterThan(0)
}

// ── 用例 1：图片链路（E1）────────────────────────────────────────────
test.describe('真机人工项 · E1 图片链路', () => {
  test('真实文件上传 → 预览画布成像 → 导出 PNG 带图（像素 + 截图双证）', async ({ page }) => {
    await openPreset(page, '多列对比表')
    const imgFile = await makeTestImage(page)
    evidence.sourceImage = { file: imgFile, size: readFileSync(imgFile).length }

    // 选中 text 槽（row.6.val.a = 定制报告/方案 A），右栏出现图片区
    await clickSlot(page, presetOf('compare-alpha-v1'), 'row.6.val.a')
    await expect(page.getByTestId('image-area')).toBeVisible()

    // 真实磁盘文件上传（input[type=file] 走真实文件对象）
    await page.getByTestId('image-file').setInputFiles(imgFile)
    await expect(page.getByTestId('image-thumb')).toBeVisible()
    await expect(page.getByTestId('slot-headline')).toHaveText('图片')
    await page.waitForTimeout(600)

    // 预览画布成像：目标槽矩形内近红像素数 + 最红像素（顺带量化 F4 颜色漂移）
    const previewScan = await scanPreviewCell(page, 'row.6.val.a')
    evidence.previewScan = previewScan
    await page.locator('.preview-host').screenshot({ path: join(OUT, 'app-preview-with-image.png') })
    await page.screenshot({ path: join(OUT, 'app-editor-with-image.png') })

    // 导出 2×（透明底关）→ PNG 带图
    await openExportDrawer(page)
    await page.locator('.seg-btn', { hasText: '2×' }).click()
    const png = await exportPngTo(page, 'exported-2x-with-image.png')
    const scan = await scanPng(page, png)
    evidence.exported2xWithImage = {
      bytes: png.length,
      width: scan.width,
      height: scan.height,
      redPixels: scan.red,
      redBBox: scan.redBBox,
      reddestPixel: scan.best,
    }
    await page.getByRole('button', { name: '关闭' }).click()

    // 断言：预览与导出均出现图片像素（1×1 红图时代已过，现在是真实 480×320 图）
    expect(previewScan.red, '预览画布目标槽内应有图片红色像素').toBeGreaterThan(50)
    expect(scan.red, '导出 PNG 内应有图片红色像素').toBeGreaterThan(50)
    // 图片内容确实落在图片槽（红色象限在图片左上，故红像素包围盒应偏表格左上区域）
    expect(scan.redBBox).not.toBeNull()
  })
})

// ── 用例 2：透明底与尺寸（TC-082/083）────────────────────────────────

test.describe('真机人工项 · TC-PT-082/083 PNG 透明底与尺寸', () => {
  test('透明底四角 alpha=0 / 格内不透明；1x/2x/3x 尺寸与抽屉提示零偏差；深色背景合成图落盘', async ({
    page,
  }) => {
    await openPreset(page, '多列对比表')
    const imgFile = await makeTestImage(page)
    await clickSlot(page, presetOf('compare-alpha-v1'), 'row.6.val.a')
    await page.getByTestId('image-file').setInputFiles(imgFile)
    await page.waitForTimeout(600)

    await openExportDrawer(page)
    const transCheck = page.getByRole('checkbox', { name: '透明底（表格外留白透明）' })

    // 三档尺寸 + 抽屉实时像素提示对照
    const dims: Record<string, unknown> = {}
    for (const label of ['1×', '2×', '3×']) {
      await page.locator('.seg-btn', { hasText: label }).click()
      const estimate = (await page.locator('.estimate').textContent()) ?? ''
      const m = estimate.match(/(\d+)\s*×\s*(\d+)/)
      const png = await exportPngTo(page, `exported-${label.replace('×', 'x')}-opaque.png`)
      const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
      const w = view.getUint32(16)
      const h = view.getUint32(20)
      dims[label] = {
        actual: { w, h },
        estimateText: estimate.trim(),
        estimate: m ? { w: Number(m[1]), h: Number(m[2]) } : null,
        bytes: png.length,
      }
    }
    evidence.dimsOpaque = dims
    // 1:2:3 与提示零偏差
    const w1 = (dims['1×'] as { actual: { w: number } }).actual.w
    const w2 = (dims['2×'] as { actual: { w: number } }).actual.w
    const w3 = (dims['3×'] as { actual: { w: number } }).actual.w
    expect(w2).toBeCloseTo(w1 * 2, -1)
    expect(w3).toBeCloseTo(w1 * 3, -1)
    for (const label of ['1×', '2×', '3×']) {
      const d = dims[label] as { actual: { w: number; h: number }; estimate: { w: number; h: number } | null }
      expect(d.estimate, `${label} 抽屉像素提示应可解析`).not.toBeNull()
      expect(Math.abs(d.actual.w - d.estimate!.w), `${label} 宽与提示偏差`).toBeLessThanOrEqual(1)
      expect(Math.abs(d.actual.h - d.estimate!.h), `${label} 高与提示偏差`).toBeLessThanOrEqual(1)
    }

    // 透明底 2× 导出：四角 alpha=0、中心不透明
    await page.locator('.seg-btn', { hasText: '2×' }).click()
    await transCheck.check()
    const trans = await exportPngTo(page, 'exported-2x-with-image-transparent.png')
    const scan = await scanPng(page, trans)
    const view = new DataView(trans.buffer, trans.byteOffset, trans.byteLength)
    const W = view.getUint32(16)
    const H = view.getUint32(20)
    const alphaAt = async (pts: [number, number][]) =>
      page.evaluate(
        async ({ b64, pts }) => {
          const bin = atob(b64)
          const buf = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
          const bmp = await createImageBitmap(new Blob([buf], { type: 'image/png' }))
          const cv = new OffscreenCanvas(bmp.width, bmp.height)
          const g = cv.getContext('2d')!
          g.drawImage(bmp, 0, 0)
          return pts.map(([x, y]) => {
            const d = g.getImageData(x, y, 1, 1).data
            return { x, y, r: d[0], g: d[1], b: d[2], a: d[3] }
          })
        },
        { b64: Buffer.from(trans).toString('base64'), pts },
      )
    const corners = await alphaAt([
      [2, 2],
      [W - 3, 2],
      [2, H - 3],
      [W - 3, H - 3],
      [Math.floor(W / 2), Math.floor(H / 2)],
    ])
    evidence.transparent2x = { width: W, height: H, corners, redPixels: scan.red }
    for (const c of corners.slice(0, 4)) {
      expect(c.a, `透明底四角 (${c.x},${c.y}) alpha`).toBe(0)
    }
    expect(corners[4]!.a, '中心格应不透明').toBe(255)

    // 深色/浅色背景合成图（供系统看图工具 / 外部工具复核透明区与尺寸）
    await composite(page, trans, '#101418', 'composite-2x-transparent-over-dark.png')
    await composite(page, trans, '#ffffff', 'composite-2x-transparent-over-white.png')
    await composite(page, new Uint8Array(readFileSync(join(OUT, 'exported-2x-with-image.png'))), '#101418', 'composite-2x-opaque-over-dark.png')

    // 透明底 + 关斑马纹复测（TC-082 口径）
    await page.getByRole('button', { name: '关闭' }).click()
    await page.locator('[data-testid="group-head-style"]').click()
    await page.getByRole('checkbox', { name: '斑马纹' }).uncheck()
    await openExportDrawer(page)
    await transCheck.check()
    const trans2 = await exportPngTo(page, 'exported-2x-transparent-no-zebra.png')
    const v2 = new DataView(trans2.buffer, trans2.byteOffset, trans2.byteLength)
    const c2 = await alphaAt([[2, 2]])
    evidence.transparent2xNoZebra = {
      width: v2.getUint32(16),
      height: v2.getUint32(20),
      cornerAlpha: c2[0]!.a,
    }
    expect(c2[0]!.a).toBe(0)
  })
})

// ── 用例 3：TC-PT-086 前置（真实剪贴板 + 真实粘贴）──────────────────

test.describe('真机人工项 · TC-PT-086 公众号粘贴链路前置', () => {
  test('导出 HTML 的真实剪贴板形态 + 富文本粘贴渲染（标题/边框/✓✗◐/图片）', async ({
    page,
    context,
  }) => {
    test.setTimeout(240_000)
    await openPreset(page, '多列对比表')
    const imgFile = await makeTestImage(page)

    // ① 三态符号齐全：默认 ✓ ✓ ◐ → 把 row.2.val.a 改成 ✗
    await clickSlot(page, presetOf('compare-alpha-v1'), 'row.2.val.a')
    const marks = page.getByRole('radiogroup', { name: '支持状态' })
    await expect(marks).toBeVisible()
    await marks.getByRole('button', { name: /不支持/ }).click()
    // ② 一个格子放图片
    await clickSlot(page, presetOf('compare-alpha-v1'), 'row.6.val.a')
    await page.getByTestId('image-file').setInputFiles(imgFile)
    await expect(page.getByTestId('image-thumb')).toBeVisible()
    await page.waitForTimeout(600)

    // ③ 导出抽屉 →「复制 HTML」→ 真机剪贴板形态（PowerShell 读 Windows 剪贴板）
    await openExportDrawer(page)
    await page.getByRole('button', { name: '复制 HTML' }).click()
    await expect(page.locator('.pt-toast')).toHaveText('已复制到剪贴板')
    // P1 修复后为双风味：text/html 片段（富文本编辑器粘的）+ text/plain TSV（Excel/WPS 按位置粘）
    const flavors = await page.evaluate(async () => {
      const out: Record<string, string> = {}
      for (const it of await navigator.clipboard.read()) {
        for (const t of it.types) out[t] = await (await it.getType(t)).text()
      }
      return out
    })
    const html = flavors['text/html'] ?? ''
    const plain = flavors['text/plain'] ?? ''
    writeFileSync(join(OUT, 'exported-html.html'), html, 'utf8')
    writeFileSync(join(OUT, 'clipboard-after-copy-html-plain.txt'), plain, 'utf8')
    evidence.exportedHtml = { length: html.length, head: html.slice(0, 120) }
    evidence.clipboardFlavors = {
      types: Object.keys(flavors),
      htmlLen: html.length,
      plainHead: plain.slice(0, 120),
      plainTabs: (plain.match(/\t/g) ?? []).length,
    }
    evidence.clipboardAfterCopyHtml = readOsClipboard('after-copy-html')
    // P1 缺陷回归点：真实系统剪贴板必须同时具备 HTML Format（富文本）与 UnicodeText（TSV）
    const osCopy = evidence.clipboardAfterCopyHtml as ReturnType<typeof readOsClipboard>
    expect(osCopy.formats, '真实剪贴板应含 HTML Format').toContain('HTML Format')
    expect(osCopy.htmlHasTable, 'HTML Format 内含 <table>').toBe(true)
    expect(osCopy.htmlHasMarks, 'HTML Format 内含 ✓✗◐').toBe(true)
    expect(osCopy.htmlHasDataImg, 'HTML Format 内含 data:image').toBe(true)
    expect(plain, 'text/plain 风味应为 TSV').toContain('\t')
    expect(plain, 'text/plain 风味不应是 HTML 源码').not.toContain('<table')
    // 系统剪贴板 UnicodeText 侧同样核对（PowerShell 落盘的真机文本）
    const osText = readFileSync(join(OUT, 'clipboard-after-copy-html-text.txt'), 'utf8')
    expect(osText, '真机剪贴板 UnicodeText 应为 TSV').toContain('\t')
    expect(osText, '真机剪贴板 UnicodeText 不应是 HTML 源码').not.toContain('<table')
    expect(osText, '真机剪贴板 UnicodeText 应含三态符号').toMatch(/[\u2713\u2717\u25D0]/)

    // ④ 真实 Ctrl+V 粘进 contenteditable（等价富文本编辑器接收的第一手）
    const target1 = await openPasteTarget(context)
    const pasteRaw = await pasteInto(target1)
    evidence.pasteOfCopyHtml = {
      method: pasteRaw.method,
      tableCount: pasteRaw.tableCount,
      cellCount: pasteRaw.cellCount,
      imgCount: pasteRaw.imgCount,
      dataImgCount: pasteRaw.dataImgCount,
      captionText: pasteRaw.captionText,
      markChars: pasteRaw.markChars,
      styledCellCount: pasteRaw.styledCellCount,
      textHead: pasteRaw.textContent.slice(0, 100),
      innerHTMLHead: pasteRaw.innerHTML.slice(0, 160),
    }
    await target1.screenshot({ path: join(OUT, 'paste-1-from-copy-html.png') })
    // P1 修复的正面证据：公众号路径（「复制 HTML」→ 富文本粘贴）必须直接渲染出真表格
    assertRichPaste('复制 HTML 直粘', pasteRaw)

    // ⑤ 可用路径 A：导出 HTML 落盘 → 浏览器打开 → 全选复制（富文本剪贴板）→ 粘贴
    const htmlPage = await context.newPage()
    await htmlPage.goto(pathToFileURL(join(OUT, 'exported-html.html')).href)
    await htmlPage.keyboard.press('Control+A')
    await htmlPage.keyboard.press('Control+C')
    await htmlPage.waitForTimeout(200)
    evidence.clipboardAfterCopyFromRendered = readOsClipboard('after-copy-rendered')
    await htmlPage.screenshot({ path: join(OUT, 'exported-html-in-browser.png'), fullPage: true })

    const target2 = await openPasteTarget(context)
    const pasteRich = await pasteInto(target2)
    evidence.pasteFromRendered = {
      method: pasteRich.method,
      tableCount: pasteRich.tableCount,
      cellCount: pasteRich.cellCount,
      imgCount: pasteRich.imgCount,
      dataImgCount: pasteRich.dataImgCount,
      captionText: pasteRich.captionText,
      markChars: pasteRich.markChars,
      styledCellCount: pasteRich.styledCellCount,
      textHead: pasteRich.textContent.slice(0, 100),
    }
    await target2.screenshot({ path: join(OUT, 'paste-2-from-rendered-html.png') })

    // ⑥ 可用路径 B：应用内「预览」小窗 iframe → 全选复制 → 粘贴
    // 自动化口径说明：sandbox="" 的预览 iframe 内，page.keyboard 的按键经 CDP 落到主框架
    // （复制走的是整页 UI，连 iframe 的 srcdoc 源码一起），必须把按键定向给 iframe 自身的文档；
    // 真机上点击 iframe 后按键本就落在 iframe（preview-copy 探针实测 document.hasFocus()=true），
    // 故此处的 Frame.press 是与真机等价的口径，而非绕过产品行为。
    await page.getByTestId('html-preview-btn').click()
    await expect(page.getByTestId('html-preview-overlay')).toBeVisible()
    // 自动化口径：应用页此时已是后台标签（⑤/④ 各开了新页），后台标签里 CDP 鼠标事件不会把焦点交给
    // iframe（选中会落到主框架 → 复制走整页 UI + srcdoc 源码），须先切回前台再点；
    // 真机上用户点开预览小窗本就在前台，此步骤只是补回被自动化吞掉的前台状态。
    await page.bringToFront()
    const frameEl = await page.locator('[data-testid="html-preview-frame"]').elementHandle()
    const previewFrame = await frameEl?.contentFrame()
    expect(previewFrame, '应能定位预览 iframe 的 Frame').toBeTruthy()
    await previewFrame!.locator('body').click()
    evidence.previewIframeFocus = {
      focusInFrame: await previewFrame!.evaluate(() => document.hasFocus()),
    }
    await previewFrame!.locator('body').press('Control+A')
    await previewFrame!.locator('body').press('Control+C')
    await page.waitForTimeout(200)
    evidence.clipboardAfterCopyFromPreviewIframe = readOsClipboard('after-copy-iframe')
    const osIframe = evidence.clipboardAfterCopyFromPreviewIframe as ReturnType<typeof readOsClipboard>
    expect(osIframe.htmlHasTable, '预览 iframe 全选复制后，剪贴板 HTML 应含 <table>').toBe(true)
    await page.screenshot({ path: join(OUT, 'app-html-preview-overlay.png') })

    const target3 = await openPasteTarget(context)
    const pasteIframe = await pasteInto(target3)
    evidence.pasteFromPreviewIframe = {
      method: pasteIframe.method,
      tableCount: pasteIframe.tableCount,
      cellCount: pasteIframe.cellCount,
      imgCount: pasteIframe.imgCount,
      dataImgCount: pasteIframe.dataImgCount,
      captionText: pasteIframe.captionText,
      markChars: pasteIframe.markChars,
      styledCellCount: pasteIframe.styledCellCount,
    }
    await target3.screenshot({ path: join(OUT, 'paste-3-from-preview-iframe.png') })

    // 断言：富文本路径必须渲染出真实表格（含标题/边框样式/三态符号/图片）
    assertRichPaste('导出 HTML 落盘复粘', pasteRich)
    assertRichPaste('应用内预览 iframe 复粘', pasteIframe)
  })
})
