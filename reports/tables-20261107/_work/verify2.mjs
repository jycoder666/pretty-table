// 终验（持久 profile）：库页「我的模板」4 张 + 产物清单
import { launch } from './helpers.mjs'
import fs from 'node:fs'
const log = (...a) => console.log('[v2]', ...a)
const { browser, page } = await launch()
try {
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(1500)
  const backBtn = page.getByRole('button', { name: '← 模板库' })
  if (await backBtn.isVisible().catch(() => false)) {
    await backBtn.click()
    const ok = page.getByTestId('confirm-ok')
    try { await ok.waitFor({ state: 'visible', timeout: 4000 }); await ok.click() } catch {}
    await page.waitForTimeout(800)
  }
  await page.getByRole('heading', { name: '统计看板' }).waitFor({ timeout: 8000 })
  await page.waitForTimeout(1200)
  const body = await page.locator('body').innerText()
  const names = ['百万医疗险·横向测评', '三款机型参数对比', '十月·家庭收支账', '年度体检·指标解读']
  for (const n of names) log(`模板「${n}」在库页:`, body.includes(n))
  await page.screenshot({ path: 'F:/pretty-table/reports/tables-20261107/05-我的模板入库验证.png', fullPage: false })
} finally {
  await browser.close()
}
const OUT = 'F:/pretty-table/reports/tables-20261107'
log('--- 本次产物 ---')
for (const f of ['01-百万医疗险-编辑台.png','百万医疗险·横向测评.png','百万医疗险·横向测评.html','02-三款机型参数对比-编辑台.png','三款机型参数对比.png','三款机型参数对比.html','03-十月家庭收支账-编辑台.png','十月·家庭收支账.png','十月·家庭收支账.html','04-年度体检指标解读-编辑台.png','04a-detail模板加列实测.png','年度体检·指标解读.png','年度体检·指标解读.html','05-我的模板入库验证.png']) {
  try { log(`${f}  ${fs.statSync(`${OUT}/${f}`).size} bytes`) } catch { log(`${f}  缺失!`) }
}
console.log('[v2] DONE')
