// 诊断：wheel 滚动后 footer 块行位置 + 点击
import { launch, openBlank, canvas, silenceSelBar, startPlace, placeAt } from './lib.mjs'
import { execSync } from 'node:child_process'

const { browser, page } = await launch()
try {
  await openBlank(page, 10, 6, 2)
  // 放置 footer
  await startPlace(page, '强调注脚')
  await placeAt(page, 0)
  // 填充高数据使表格超高（3 行文字）
  const grid = [
    ['节次 / 星期', '周一', '周二', '周三', '周四', '周五'],
    ...Array.from({ length: 8 }, (_, i) => [`第 ${i + 1} 节\n08:00`, '语文\n心老师\n302', '数学\n李老师\n302', '英语\n陈老师\n302', '体育\n赵老师\n操场', '音乐\n孙老师\n音乐室']),
  ]
  const cbx = await canvas(page).boundingBox()
  await canvas(page).click({ position: { x: 36, y: 16 } })
  await page.keyboard.press('ArrowDown')
  await page.evaluate(async (t) => { await navigator.clipboard.writeText(t) }, grid.map((r) => r.join('\t')).join('\n'))
  await page.keyboard.press('Control+V')
  await page.waitForTimeout(700)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  // wheel 滚动
  await canvas(page).hover({ position: { x: 400, y: 200 } })
  await page.mouse.wheel(0, 2000)
  await page.waitForTimeout(800)
  // 截图 OCR
  const cbx2 = await canvas(page).boundingBox()
  await page.screenshot({ path: 'F:/pretty-table/reports/tables-20261107/dbg-scroll.png', clip: cbx2 })
  const out = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; & 'F:/pretty-table/reports/tables-20261107/ocr.ps1' -ImgPath 'F:/pretty-table/reports/tables-20261107/dbg-scroll.png' -Scale 2"`, { encoding: 'utf8' })
  const lines = out.split('\n').filter((l) => l.startsWith('Y='))
  console.log('[OCR 底部 6 行]\n' + lines.slice(-6).join('\n'))
  // 找「注脚」或最后一行后点击
  const foot = lines.filter((l) => /注|脚/.test(l)).pop()
  if (foot) {
    const m = /Y=(\d+) X=(\d+)/.exec(foot)
    const y = Math.round(+m[1] / 2) + 8, x = Math.round(+m[2] / 2) + 40
    console.log('footer 行 rel=(', x, ',', y, ') 原行:', foot.trim())
    await silenceSelBar(page)
    await canvas(page).click({ position: { x: Math.min(780, x + 100), y } })
    await page.waitForTimeout(500)
    console.log('block-headline:', await page.getByTestId('block-headline').innerText().catch(() => '(无)'))
  } else { console.log('未找到注脚行') }
} finally { await browser.close() }
console.log('DONE')
