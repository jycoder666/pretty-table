import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type BrowserContext, type Page } from '@playwright/test'

import { openExportDrawer, openPreset } from '../e2e/acceptance/helpers'

/**
 * TC-PT-086 前置补充：应用内「预览」小窗能否作为富文本复制源。
 * 首轮实测：在 iframe 内点击后 Ctrl+A 选中的是外层应用页（剪贴板 textHead = 应用 UI 文案），
 * 本用例改用 Frame.press 定向到 iframe，并同时验证「导出 HTML 落盘 → 浏览器打开 → 全选复制」对照。
 */

const OUT = join(process.cwd(), 'reports', 'manual-verify-2026-10-22')
mkdirSync(OUT, { recursive: true })

// Chromium 专用：真机剪贴板读写权限
test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

function osClipboard(tag: string) {
  const ps1 = join(OUT, `read-clipboard-${tag}.ps1`)
  const dump = join(OUT, `clipboard-${tag}-htmlformat.txt`)
  const textDump = join(OUT, `clipboard-${tag}-text.txt`)
  writeFileSync(
    ps1,
    [
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      'Add-Type -AssemblyName System.Windows.Forms',
      '$d = [System.Windows.Forms.Clipboard]::GetDataObject()',
      'if ($null -eq $d) { Write-Output "FORMATS:"; Write-Output "TEXTLEN:0"; Write-Output "HTMLLEN:0"; exit }',
      'Write-Output ("FORMATS:" + ($d.GetFormats() -join "|"))',
      '$t = $d.GetData("UnicodeText")',
      'if ($null -eq $t) { Write-Output "TEXTLEN:0" } else { Write-Output ("TEXTLEN:" + $t.Length); [System.IO.File]::WriteAllText("' +
        textDump.replace(/\\/g, '\\\\') +
        '", [string]$t, [System.Text.Encoding]::UTF8) }',
      '$h = $d.GetData("HTML Format")',
      'if ($null -eq $h) { Write-Output "HTMLLEN:0" } else {',
      '  $s = [string]$h',
      '  Write-Output ("HTMLLEN:" + $s.Length)',
      '  Write-Output ("HTMLHAS_TABLE:" + ($s.Contains("<table")).ToString().ToLower())',
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
  return {
    formats: get('FORMATS').split('|').filter(Boolean),
    textLen: Number(get('TEXTLEN') || 0),
    htmlLen: Number(get('HTMLLEN') || 0),
    htmlHasTable: get('HTMLHAS_TABLE') === 'true',
  }
}

async function openPasteTarget(context: BrowserContext): Promise<Page> {
  const p = await context.newPage()
  await p.route('**/*.{js,ts,mjs,vue}', (r) => r.abort())
  await p.goto('http://localhost:5173/')
  await p.evaluate(() => {
    document.body.innerHTML =
      '<div id="ed" contenteditable="true" style="min-height:200px;padding:16px;border:2px dashed #9aabb5;font:14px/1.7 system-ui;outline:none"></div>'
    document.body.style.margin = '0'
  })
  await p.locator('#ed').click()
  return p
}

async function pasteAndSummarize(p: Page) {
  await p.locator('#ed').click()
  await p.keyboard.press('Control+V')
  await p.waitForTimeout(400)
  return p.evaluate(() => {
    const ed = document.getElementById('ed')!
    return {
      tableCount: ed.querySelectorAll('table').length,
      cellCount: ed.querySelectorAll('td,th').length,
      imgCount: ed.querySelectorAll('img').length,
      captionText: ed.querySelector('caption')?.textContent ?? null,
      textHead: (ed.textContent ?? '').slice(0, 90),
    }
  })
}

test.describe('TC-PT-086 补充 · 应用内预览小窗复制源', () => {
  test('iframe 定向 Ctrl+A/Ctrl+C 的剪贴板形态与粘贴结果', async ({ page, context }) => {
    test.setTimeout(180_000)
    await openPreset(page, '多列对比表')
    await openExportDrawer(page)
    await page.getByTestId('html-preview-btn').click()
    await expect(page.getByTestId('html-preview-overlay')).toBeVisible()

    // 定位预览 iframe 的 Frame 对象，键盘事件定向发给它
    const handle = await page.locator('[data-testid="html-preview-frame"]').elementHandle()
    const frame = await handle?.contentFrame()
    if (!frame) console.log('frame urls:', page.frames().map((f) => f.url()))
    expect(frame, '应能定位预览 iframe 的 Frame').toBeTruthy()
    await frame!.locator('body').click()
    const inside = await frame!.evaluate(() => ({
      activeInFrame: document.hasFocus(),
      selLen: (window.getSelection()?.toString() ?? '').length,
    }))
    await frame!.locator('body').press('Control+A')
    const selAfterA = await frame!.evaluate(() => (window.getSelection()?.toString() ?? '').length)
    await frame!.locator('body').press('Control+C')
    await page.waitForTimeout(200)
    const clip = osClipboard('iframe-directed')
    const pasted = await pasteAndSummarize(await openPasteTarget(context))
    const result = { inside, selAfterA, clip, pasted }
    writeFileSync(join(OUT, 'preview-iframe-copy.json'), JSON.stringify(result, null, 2), 'utf8')
    console.log('iframe-copy result:', JSON.stringify(result, null, 2))
  })
})
