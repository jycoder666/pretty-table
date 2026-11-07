// 二轮新功能浏览器验证 v3（每任务独立 context，2026-11-07）
import { chromium } from '@playwright/test'
import process from 'node:process'
import fs from 'node:fs'

process.env.NO_PROXY ??= 'localhost,127.0.0.1,::1'
process.env.no_proxy ??= 'localhost,127.0.0.1,::1'

const BASE = 'http://127.0.0.1:5173'
const OUT = 'F:/pretty-table/reports/feat2-20261107'
fs.mkdirSync(OUT, { recursive: true })

const results = []
function report(n, name, ok, detail) {
  results.push({ n, name, ok, detail })
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${n}. ${name} :: ${detail}`)
}

async function withPage(fn) {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
  const page = await context.newPage()
  const errs = []
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
  page.on('pageerror', (e) => errs.push('pageerror:' + String(e)))
  try { await fn(page, errs) } finally { await browser.close() }
}

async function openTpl(page, name) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await page.locator('article.card', { hasText: name }).first().getByRole('button', { name: '使用此模板' }).click()
  await page.waitForTimeout(2200)
}

async function groupHeaderCount(page) {
  return page.evaluate(() => {
    const app = document.querySelector('#app')?.__vue_app__
    const store = app?.config.globalProperties?.$pinia?._s?.get('editor')
    return store?.current?.blocks?.filter((b) => b.type === 'groupHeader').length ?? -1
  })
}

async function copyExportHtml(page) {
  await page.getByRole('button', { name: '导出', exact: true }).click()
  await page.waitForTimeout(700)
  await page.evaluate(() => navigator.clipboard.writeText(''))
  await page.getByRole('button', { name: '复制 HTML' }).click()
  await page.waitForTimeout(1000)
  const html = await page.evaluate(async () => {
    const items = await navigator.clipboard.read()
    for (const it of items) if (it.types.includes('text/html')) return await (await it.getType('text/html')).text()
    return ''
  })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  return html
}

const selBarSilence = (page) => page.evaluate(() => {
  const el = document.querySelector('[data-testid="selection-bar"]')
  if (el) el.style.pointerEvents = 'none'
  document.querySelectorAll('.block-handle, .block-handle-wrap').forEach((b) => { b.style.pointerEvents = 'none' })
})

// ── 1+2. 分组动态化 & 组头配色（同一 context 有依赖）──
await withPage(async (page) => {
  await openTpl(page, '价目清单')
  await page.getByTestId('group-head-structure').click()
  await page.waitForTimeout(400)
  const before = await groupHeaderCount(page)
  let inserted = 0
  for (let i = 0; i < 3; i++) {
    await selBarSilence(page)
    await page.getByTestId('preview-canvas').click({ position: { x: 36, y: 16 } })
    await page.waitForTimeout(200)
    for (let k = 0; k < 2 + i; k++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(80) }
    const btn = page.getByTestId('group-add')
    if (await btn.isDisabled().catch(() => true)) break
    await btn.click()
    await page.waitForTimeout(600)
    inserted++
  }
  const after = await groupHeaderCount(page)
  report(1, '分组动态化·连插3次', after === before + 3, `groupHeader ${before}→${after}（插入 ${inserted} 次）`)
  await page.screenshot({ path: `${OUT}/01-分组动态化.png`, fullPage: true })

  const sel = await page.evaluate(() => {
    const app = document.querySelector('#app')?.__vue_app__
    const store = app?.config.globalProperties?.$pinia?._s?.get('editor')
    const b = store?.current?.blocks?.filter((x) => x.type === 'groupHeader').at(-1)
    if (!b) return 'no-block'
    store.selectedBlockId = b.id
    return b.id
  })
  await page.waitForTimeout(500)
  const custom = page.locator('[data-testid="block-color-custom"] input')
  const vis = await custom.isVisible().catch(() => false)
  if (sel !== 'no-block' && vis) {
    await custom.fill('#D9EBDC')
    await custom.press('Enter')
    await custom.blur()
    await page.waitForTimeout(600)
    const html = await copyExportHtml(page)
    const hit = /D9EBDC|217,\s*235,\s*220|rgb\(217/i.test(html)
    report(2, '组头配色豆绿→HTML', hit, `块=${sel}; HTML含色=${hit}`)
    await page.screenshot({ path: `${OUT}/02-组头豆绿.png`, fullPage: true })
  } else {
    report(2, '组头配色', false, `选中=${sel}; 自定义色输入可见=${vis}`)
    await page.screenshot({ path: `${OUT}/02-组头配色-不可见.png`, fullPage: true })
  }
})

// ── 3. detail 表头第二行可编辑 ──
await withPage(async (page) => {
  await openTpl(page, '单主体明细表')
  const sid = await page.evaluate(() => {
    const app = document.querySelector('#app')?.__vue_app__
    const store = app?.config.globalProperties?.$pinia?._s?.get('editor')
    return store?.current?.layout?.slotGrid?.[1]?.[1] ?? null
  })
  if (!sid) { report(3, 'detail表头可编辑', false, 'slotGrid[1][1] 不存在'); return }
  await page.evaluate((s) => {
    const app = document.querySelector('#app')?.__vue_app__
    const store = app?.config.globalProperties?.$pinia?._s?.get('editor')
    store.selectedSlotId = s
  }, sid)
  await page.waitForTimeout(400)
  const ta = page.locator('[data-testid="group-content"] textarea:visible')
  await ta.fill('本次结果')
  await ta.blur()
  await page.waitForTimeout(500)
  const html = await copyExportHtml(page)
  const hit = html.includes('本次结果')
  const old = html.includes('>说明<')
  report(3, 'detail表头可编辑', hit && !old, `槽 ${sid}: 新值=${hit} 旧值残留=${old}`)
  await page.screenshot({ path: `${OUT}/03-detail表头.png`, fullPage: true })
})

// ── 4. caption 编辑（统计看板）──
await withPage(async (page) => {
  await openTpl(page, '统计看板')
  const input = page.getByTestId('caption-input')
  const vis = await input.isVisible().catch(() => false)
  if (!vis) { report(4, 'caption编辑', false, 'caption-input 不可见'); return }
  await input.fill('测试表名XYZ')
  await input.blur()
  await page.waitForTimeout(600)
  const html = await copyExportHtml(page)
  const hit = html.includes('测试表名XYZ')
  report(4, 'caption编辑→HTML', hit, `HTML含新表名=${hit}`)
  await page.screenshot({ path: `${OUT}/04-caption.png`, fullPage: true })
})

// ── 5. 空槽导出无占位 ──
await withPage(async (page) => {
  await openTpl(page, '价目清单')
  const html = await copyExportHtml(page)
  const hasPh = html.includes('可拖入')
  report(5, '空槽导出无占位', !hasPh, `HTML含「可拖入」=${hasPh}`)
})

// ── 6. leftTag 放置与文字编辑 ──
await withPage(async (page) => {
  await openTpl(page, '新建空白表')
  const railBtn = page.getByTestId('library-rail-open')
  if (await railBtn.isVisible().catch(() => false)) { await railBtn.click(); await page.waitForTimeout(500) }
  await page.locator('.block-lib li', { hasText: '左栏标签' }).first().click()
  await page.waitForTimeout(600)
  await selBarSilence(page)
  const hits = page.locator('.slot-hit.hot, .slot-hit.focused')
  const n = await hits.count()
  if (!n) { report(6, 'leftTag可编辑', false, '无放置槽'); return }
  await hits.first().click()
  await page.waitForTimeout(500)
  const sel = await page.evaluate(() => {
    const app = document.querySelector('#app')?.__vue_app__
    const store = app?.config.globalProperties?.$pinia?._s?.get('editor')
    const b = store?.current?.blocks?.find((x) => x.type === 'leftTag')
    if (!b) return 'no-block'
    store.selectedBlockId = b.id
    return b.id
  })
  await page.waitForTimeout(500)
  const taVis = await page.locator('[data-testid="group-content"] textarea:visible').isVisible().catch(() => false)
  let typed = false
  if (sel !== 'no-block' && taVis) {
    const ta = page.locator('[data-testid="group-content"] textarea:visible')
    await ta.fill('城东')
    await ta.blur()
    await page.waitForTimeout(400)
    typed = await page.evaluate(() => {
      const app = document.querySelector('#app')?.__vue_app__
      const store = app?.config.globalProperties?.$pinia?._s?.get('editor')
      return store?.current?.blocks?.find((x) => x.type === 'leftTag')?.props?.text === '城东'
    })
  }
  report(6, 'leftTag可编辑', sel !== 'no-block' && taVis && typed, `选中=${sel}; 编辑入口=${taVis}; 写入生效=${typed}`)
  await page.screenshot({ path: `${OUT}/06-leftTag.png`, fullPage: true })
})

console.log('\n==== 汇总 ====')
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} | ${r.n} | ${r.name} | ${String(r.detail).slice(0, 110)}`)
