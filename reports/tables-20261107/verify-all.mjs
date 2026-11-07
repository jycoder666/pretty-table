// 终验：模板库出现 4 张另存模板 + 产物文件清单 + PNG 尺寸
import { launch, BASE } from './lib.mjs'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const { browser, page, consoleErrors } = await launch()
try {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  const cards = await page.locator('article.card').allInnerTexts()
  const names = ['三年级2班课程表', '餐厅秋季菜单', '产品改版排期', '大理四天三晚行程']
  for (const n of names) {
    const hit = cards.find((c) => c.includes(n))
    console.log(`[模板另存] ${n}: ${hit ? '在库 ✓' : '未找到 ✗'}`)
  }
  console.log('[库中共]', cards.length, '张卡')
} finally { await browser.close() }

// 文件清单
const OUT = 'F:/pretty-table/reports/tables-20261107'
for (const n of names) {
  for (const suffix of ['.png', '.html', '-editor.png']) {
    const p = `${OUT}/${n}${suffix}`
    try {
      const st = fs.statSync(p)
      console.log(`[文件] ${n}${suffix} ${st.size} B`)
    } catch { console.log(`[文件缺失] ${p}`) }
  }
}
// PNG 尺寸（node 读 IHDR）
for (const n of names) {
  const buf = fs.readFileSync(`${OUT}/${n}.png`)
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20)
  console.log(`[PNG 尺寸] ${n}: ${w}x${h}`)
}
console.log('[gate] console error:', consoleErrors.length)
console.log('VERIFY_DONE')
