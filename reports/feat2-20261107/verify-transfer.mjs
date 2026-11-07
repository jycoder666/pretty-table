// 模板 JSON 导出/导入 端到端验收（2026-11-08，登记 TODO_delete.md）
// a) 持久 profile 打开「百万医疗险·横向测评」→ 新「导出 JSON」拿文件（贴字节数）
// b) 全新 context（空 IndexedDB）模板库「导入模板」选该文件 → 我的模板出现 →
//    打开编辑台 structure-summary 与导出前一致；截图落本目录
// 全程 console error / pageerror 必须为 0
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import process from 'node:process'

process.env.NO_PROXY ??= 'localhost,127.0.0.1,::1'
process.env.no_proxy ??= 'localhost,127.0.0.1,::1'

const BASE = 'http://127.0.0.1:5173'
const PROFILE = 'F:/pretty-table/reports/tables-20261107/_work/pw-profile'
const OUT = 'F:/pretty-table/reports/feat2-20261107'
const CARD = '百万医疗险·横向测评'

function watch(page, sink) {
  page.on('console', (m) => { if (m.type() === 'error') sink.push(m.text()) })
  page.on('pageerror', (e) => sink.push(String(e)))
}

// ── a) 导出侧：持久 profile ──
const errsA = []
const ctxA = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  args: ['--no-proxy-server'],
  viewport: { width: 1560, height: 1100 },
})
await ctxA.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
const pa = ctxA.pages()[0] ?? (await ctxA.newPage())
watch(pa, errsA)

let summaryBefore = ''
try {
  await pa.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await pa.waitForTimeout(1200)
  const backBtn = pa.getByRole('button', { name: '← 模板库' })
  if (await backBtn.isVisible().catch(() => false)) {
    await backBtn.click()
    const ok = pa.getByTestId('confirm-ok')
    try { await ok.waitFor({ state: 'visible', timeout: 4000 }); await ok.click() } catch {}
    await pa.waitForTimeout(800)
  }
  const card = pa.locator('article.card', { hasText: CARD }).first()
  await card.waitFor({ timeout: 8000 })
  await card.getByRole('button', { name: '使用此模板' }).click()
  const ok2 = pa.getByTestId('confirm-ok')
  try { await ok2.waitFor({ state: 'visible', timeout: 3000 }); await ok2.click() } catch {}
  await pa.waitForTimeout(2200)

  summaryBefore = (await pa.getByTestId('structure-summary').innerText()).replace(/\s+/g, ' ').trim()
  console.log('[a] 导出侧 structure-summary:', summaryBefore)

  // 新导出 JSON 功能：开抽屉 → 导出 JSON → download 落盘
  await pa.screenshot({ path: `${OUT}/verify-transfer-1-export-editor.png`, fullPage: true })
  await pa.getByRole('button', { name: '导出', exact: true }).click()
  await pa.waitForTimeout(700)
  await pa.screenshot({ path: `${OUT}/verify-transfer-2-export-drawer.png` })
  const dlPromise = pa.waitForEvent('download', { timeout: 30000 })
  await pa.getByTestId('export-json-btn').click()
  const dl = await dlPromise
  const jsonPath = `${OUT}/_transfer-verify-dump.json`
  await dl.saveAs(jsonPath)
  const size = fs.statSync(jsonPath).size
  const j = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  console.log(`[a] JSON 文件: ${jsonPath} ${size}B | displayName="${j.meta?.displayName}" | schema=${j.schemaVersion}`)
  await pa.keyboard.press('Escape')
} finally {
  await ctxA.close()
}

// ── b) 导入侧：全新 context（空 IndexedDB）──
const errsB = []
const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] })
const ctxB = await browser.newContext({ viewport: { width: 1560, height: 1100 } })
const pb = await ctxB.newPage()
watch(pb, errsB)

let summaryAfter = ''
let okAll = true
try {
  await pb.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await pb.waitForTimeout(1500)
  // 全新环境「我的模板」应为空
  const mineEmpty = await pb.locator('section').filter({ hasText: '我的模板' }).locator('.empty').first().isVisible().catch(() => false)
  console.log('[b] 全新 context 我的模板为空:', mineEmpty)

  await pb.getByTestId('import-btn').click()
  await pb.getByTestId('import-dialog').waitFor({ state: 'visible', timeout: 4000 })
  await pb.getByTestId('import-file').setInputFiles(`${OUT}/_transfer-verify-dump.json`)
  await pb.waitForTimeout(400)
  const filled = await pb.getByTestId('import-text').inputValue()
  console.log('[b] 文件读入 textarea:', filled.length, '字符')
  await pb.screenshot({ path: `${OUT}/verify-transfer-3-import-dialog.png` })
  await pb.getByTestId('import-confirm').click()
  await pb.waitForTimeout(900)
  const toast = await pb.locator('.pt-toast-msg').innerText().catch(() => '(无 toast)')
  console.log('[b] 导入 toast:', toast)
  if (!toast.includes('已导入')) okAll = false

  // 「我的模板」出现同名卡
  const mineCard = pb.locator('article.card', { hasText: CARD }).first()
  const appeared = await mineCard.isVisible().catch(() => false)
  console.log('[b] 我的模板出现导入卡:', appeared)
  if (!appeared) okAll = false
  await pb.screenshot({ path: `${OUT}/verify-transfer-4-imported-library.png`, fullPage: true })

  // 打开编辑台 → structure-summary 与导出前一致
  await mineCard.getByRole('button', { name: '使用此模板' }).click()
  await pb.waitForTimeout(2200)
  summaryAfter = (await pb.getByTestId('structure-summary').innerText()).replace(/\s+/g, ' ').trim()
  console.log('[b] 导入侧 structure-summary:', summaryAfter)
  const same = summaryBefore === summaryAfter
  console.log('[b] summary 一致:', same, `("${summaryBefore}" vs "${summaryAfter}")`)
  if (!same) okAll = false
  await pb.screenshot({ path: `${OUT}/verify-transfer-5-imported-editor.png`, fullPage: true })

  // 幂等回归：同一文件再导一次 → 仍是 1 张卡（同 id 覆盖）
  await pb.getByRole('button', { name: '← 模板库' }).click().catch(() => {})
  await pb.waitForTimeout(800)
  await pb.getByTestId('import-btn').click()
  await pb.getByTestId('import-dialog').waitFor({ state: 'visible', timeout: 4000 })
  await pb.getByTestId('import-file').setInputFiles(`${OUT}/_transfer-verify-dump.json`)
  await pb.waitForTimeout(400)
  await pb.getByTestId('import-confirm').click()
  await pb.waitForTimeout(900)
  const mineCount = await pb.locator('article.card', { hasText: CARD }).count()
  console.log('[b] 重复导入后同名卡数（期望 1，同 id 覆盖）:', mineCount)
  if (mineCount !== 1) okAll = false
} finally {
  await ctxB.close()
  await browser.close()
}

console.log(`[console] 导出侧 error: ${errsA.length} | 导入侧 error: ${errsB.length}`)
if (errsA.length) console.log('[console 切片 A]', JSON.stringify(errsA.slice(0, 5)))
if (errsB.length) console.log('[console 切片 B]', JSON.stringify(errsB.slice(0, 5)))
const pass = okAll && errsA.length === 0 && errsB.length === 0
console.log(pass ? 'VERIFY_TRANSFER_PASS' : 'VERIFY_TRANSFER_FAIL')
process.exit(pass ? 0 : 1)
