// 终验：库页「我的模板」4 张 + 产物清单
import { launch, BASE } from './helpers.mjs'
import fs from 'node:fs'
const log = (...a) => console.log('[v]', ...a)
const { browser, page } = await launch()
try {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: '统计看板' }).waitFor({ timeout: 8000 })
  await page.waitForTimeout(800)
  // 我的模板区（若有恢复横幅先记录）
  const body = await page.locator('body').innerText()
  const names = ['百万医疗险·横向测评', '三款机型参数对比', '十月·家庭收支账', '年度体检·指标解读']
  for (const n of names) {
    log(`模板「${n}」存在:`, body.includes(n))
  }
} finally {
  await browser.close()
}
const OUT = 'F:/pretty-table/reports/tables-20261107'
log('--- 产物清单 ---')
for (const f of fs.readdirSync(OUT)) {
  if (f === '_work') continue
  const st = fs.statSync(`${OUT}/${f}`)
  log(`${f}  ${st.size} bytes`)
}
console.log('[v] DONE')
