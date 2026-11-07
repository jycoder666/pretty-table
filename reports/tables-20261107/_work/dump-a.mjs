// A组 4 张表 JSON 导出落 tables/（2026-11-08 跨设备同步任务，临时脚本登记 TODO_delete.md）
// 通道：持久 profile（_work/pw-profile，IndexedDB「我的模板」）→ 打开模板 →
// 新「导出 JSON」功能（导出抽屉 export-json-btn）→ download 落 tables/<名>.json
// 注意：「我的模板」存在历史同 displayName 重复卡（recaption 时另存过一次），
// 列表按 savedAt 降序 → 一律 .first() 取最新版本；helpers.openTemplate 的 heading waitFor
// 会 strict violation，故本地实现 openCard（全链 .first()）。
import fs from 'node:fs'
import { launch as launchPersistent } from './helpers.mjs'
import { BASE, exportJson } from '../lib.mjs'

const OUT_DIR = 'F:/pretty-table/tables'
const TABLES = [
  { card: '百万医疗险·横向测评', file: '百万医疗险·横向测评' },
  { card: '三款机型参数对比', file: '三款机型参数对比' },
  { card: '十月·家庭收支账', file: '十月·家庭收支账' },
  { card: '年度体检·指标解读', file: '年度体检·指标解读' },
]

async function openCard(page, title) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  // 持久 profile：应用可能恢复最近草稿直接进编辑台 → 先返回库页
  const backBtn = page.getByRole('button', { name: '← 模板库' })
  if (await backBtn.isVisible().catch(() => false)) {
    await backBtn.click()
    const ok = page.getByTestId('confirm-ok')
    try {
      await ok.waitFor({ state: 'visible', timeout: 4000 })
      await ok.click()
    } catch {
      /* 非直接走 */
    }
    await page.waitForTimeout(800)
  }
  const card = page.locator('article.card', { hasText: title }).first()
  await card.waitFor({ timeout: 8000 })
  await card.getByRole('button', { name: '使用此模板' }).click()
  // 有未另存改动时弹「替换当前的表格」确认
  const ok2 = page.getByTestId('confirm-ok')
  try {
    await ok2.waitFor({ state: 'visible', timeout: 3000 })
    await ok2.click()
  } catch {
    /* 无弹窗 */
  }
  await page.waitForTimeout(2000)
}

function storeInfo(page) {
  return page.evaluate(() => {
    const app = document.querySelector('#app')?.__vue_app__
    const cur = app?.config.globalProperties?.$pinia?._s?.get('editor')?.current
    if (!cur) return null
    return {
      displayName: cur.meta?.displayName ?? '',
      savedAt: cur.meta?.savedAt ?? '',
      rows: cur.layout.rowCount,
      cols: cur.layout.colCount,
      levels: cur.layout.headerLevels ?? 1,
    }
  })
}

let fail = 0
for (const t of TABLES) {
  const { context, page, consoleErrors, pageErrors } = await launchPersistent()
  try {
    await openCard(page, t.card)
    const st = await storeInfo(page)
    console.log(`[dump] ${t.card} 打开版本:`, JSON.stringify(st))
    const path = `${OUT_DIR}/${t.file}.json`
    await exportJson(page, path)
    const size = fs.statSync(path).size
    const head = fs.readFileSync(path, 'utf8').slice(0, 160).replace(/\n/g, ' ')
    console.log(`[dump] ${t.card}: ${path} ${size}B consoleErr=${consoleErrors.length} pageErr=${pageErrors.length}`)
    console.log(`[dump] 头部: ${head}`)
    if (size < 100) {
      fail++
      console.log('[dump] 文件过小，可疑，如实登记')
    }
    // 同版本新鲜 HTML 覆盖旧产物（旧 HTML caption 系改名前残留；旧文件已备份 .bak-2026-11-08）。
    // 只走「复制 HTML」不另存模板，避免制造重复卡。
    await page.getByRole('button', { name: '导出', exact: true }).click()
    await page.waitForTimeout(700)
    await page.evaluate(() => navigator.clipboard.writeText(''))
    await page.getByRole('button', { name: '复制 HTML' }).click()
    await page.waitForTimeout(1000)
    const html = await page.evaluate(async () => {
      const items = await navigator.clipboard.read()
      for (const it of items) {
        if (it.types.includes('text/html')) return await (await it.getType('text/html')).text()
      }
      return ''
    })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    const htmlPath = `F:/pretty-table/reports/tables-20261107/${t.file}.html`
    fs.writeFileSync(htmlPath, html, 'utf8')
    console.log(`[dump] HTML 覆盖: ${htmlPath} ${html.length}B`)
  } catch (e) {
    fail++
    console.log(`[dump] ${t.card} FAIL: ${e.message}`)
  } finally {
    await context.close()
  }
}
console.log(fail === 0 ? 'DUMP_A_PASS' : `DUMP_A_FAIL(${fail})`)
