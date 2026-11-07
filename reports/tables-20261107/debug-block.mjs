// 诊断：pricing g1 块「材料」行位置 OCR + 点击选中实验
import { launch, openTemplate, canvas, silenceSelBar } from './lib.mjs'
import { chromium } from '@playwright/test'

const { browser, page, consoleErrors } = await launch()
try {
  await openTemplate(page, '价目清单')
  const cbx = await canvas(page).boundingBox()
  console.log('canvas:', JSON.stringify(cbx))
  // 截画布区域
  await page.screenshot({ path: 'F:/pretty-table/reports/tables-20261107/dbg-canvas.png', clip: cbx })
  // OCR 找「材料」
  const { execSync } = await import('node:child_process')
  const out = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; & 'F:/pretty-table/reports/tables-20261107/ocr.ps1' -ImgPath 'F:/pretty-table/reports/tables-20261107/dbg-canvas.png' -Scale 2"`, { encoding: 'utf8' })
  console.log('[OCR]\n' + out.split('\n').filter((l) => l.startsWith('Y=')).slice(0, 12).join('\n'))
  const m = /Y=(\d+) X=(\d+) \| ([^\n]*材[^\n]*)/.exec(out)
  if (m) {
    const y = Math.round(+m[1] / 2), x = Math.round(+m[2] / 2) + 30
    console.log(`材料块行位置 rel=(${x},${y})`)
    await silenceSelBar(page)
    await canvas(page).click({ position: { x, y } })
    await page.waitForTimeout(500)
    console.log('block-headline:', await page.getByTestId('block-headline').innerText().catch(() => '(无)'))
    console.log('slot-headline:', await page.getByTestId('slot-headline').innerText().catch(() => '(无)'))
  } else {
    console.log('OCR 未找到 材料行')
  }
} finally { await browser.close() }
console.log('DONE errors:', consoleErrors.length)
