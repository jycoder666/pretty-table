// v4：只重测 1（分组动态化）/ 2（组头配色）/ 6（leftTag）——3/4/5 已 PASS
import { chromium } from '@playwright/test'
import process from 'node:process'
import fs from 'node:fs'

process.env.NO_PROXY ??= 'localhost,127.0.0.1,::1'
process.env.no_proxy ??= 'localhost,127.0.0.1,::1'

const BASE = 'http://127.0.0.1:5173'
const OUT = 'F:/pretty-table/reports/feat2-20261107'

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

const selBarSilence = (page) => page.evaluate(() => {
  const el = document.querySelector('[data-testid="selection-bar"]')
  if (el) el.style.pointerEvents = 'none'
  document.querySelectorAll('.block-handle, .block-handle-wrap').forEach((b) => { b.style.pointerEvents = 'none' })
})

async function openTpl(page, name) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await page.locator('article.card', { hasText: name }).first().getByRole('button', { name: '使用此模板' }).click()
  await page.waitForTimeout(2200)
}

const ghCount = (page) => page.evaluate(() => {
  const app = document.querySelector('#app')?.__vue_app__
  const store = app?.config.globalProperties?.$pinia?._s?.get('editor')
  return store?.current?.blocks?.filter((b) => b.type === 'groupHeader').length ?? -1
})

// ── 1+2 ──
await withPage(async (page) => {
  await openTpl(page, '价目清单')
  await page.getByTestId('group-head-structure').click()
  await page.waitForTimeout(400)
  const before = await ghCount(page)
  let okInserts = 0
  for (let i = 0; i < 3; i++) {
    await selBarSilence(page)
    await page.getByTestId('preview-canvas').click({ position: { x: 36, y: 16 } })
    await page.waitForTimeout(250)
    for (let k = 0; k < 2 + i; k++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(120) }
    const btn = page.getByTestId('group-add')
    if (await btn.isDisabled().catch(() => true)) continue
    await btn.click()
    await page.waitForTimeout(900)
    const now = await ghCount(page)
    if (now > before + okInserts) okInserts++
  }
  const after = await ghCount(page)
  const pass = after >= before + 3
  console.log(`[${pass ? 'PASS' : 'FAIL'}] 1. 分组动态化 :: groupHeader ${before}→${after}（成功插入 ${okInserts} 次；模板原生锚点 2 个 → 动态插入突破固定槽上限）`)
  await page.screenshot({ path: `${OUT}/01-分组动态化.png`, fullPage: true })

  // 组头配色：选最后一个分组块 → 预设「豆绿」按钮（block-color-豆绿）
  const sel = await page.evaluate(() => {
    const app = document.querySelector('#app')?.__vue_app__
    const store = app?.config.globalProperties?.$pinia?._s?.get('editor')
    const b = store?.current?.blocks?.filter((x) => x.type === 'groupHeader').at(-1)
    if (!b) return 'no-block'
    store.selectedBlockId = b.id
    return b.id
  })
  await page.waitForTimeout(600)
  const presetBtn = page.getByTestId('block-color-豆绿')
  const vis = await presetBtn.isVisible().catch(() => false)
  if (sel !== 'no-block' && vis) {
    await presetBtn.click()
    await page.waitForTimeout(700)
    const colorInStore = await page.evaluate(() => {
      const app = document.querySelector('#app')?.__vue_app__
      const store = app?.config.globalProperties?.$pinia?._s?.get('editor')
      const b = store?.current?.blocks?.find((x) => x.id === store.selectedBlockId)
      return JSON.stringify(b?.props ?? {})
    })
    // 导出 HTML 验证豆绿色
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
    const hit = /D9EBDC|217,\s*235,\s*220|rgb\(217/i.test(html)
    console.log(`[${hit ? 'PASS' : 'FAIL'}] 2. 组头配色豆绿→HTML :: 块=${sel} props=${colorInStore.slice(0, 60)} HTML含色=${hit}`)
    await page.keyboard.press('Escape')
    await page.screenshot({ path: `${OUT}/02-组头豆绿.png`, fullPage: true })
  } else {
    console.log(`[FAIL] 2. 组头配色 :: 选中=${sel} 豆绿预设按钮可见=${vis}`)
    await page.screenshot({ path: `${OUT}/02-组头配色-不可见.png`, fullPage: true })
  }
})

// ── 6. leftTag（空白表走向导）──
await withPage(async (page) => {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await page.getByTestId('blank-card').getByRole('button', { name: '配置并新建' }).click()
  await page.getByTestId('blank-wizard').waitFor({ state: 'visible', timeout: 5000 })
  await page.getByTestId('blank-rows').fill('8')
  await page.getByTestId('blank-cols').fill('4')
  await page.getByTestId('blank-levels').selectOption('1')
  await page.getByTestId('blank-create').click()
  await page.waitForTimeout(2200)

  const railBtn = page.getByTestId('library-rail-open')
  if (await railBtn.isVisible().catch(() => false)) { await railBtn.click(); await page.waitForTimeout(500) }
  await page.locator('.block-lib li', { hasText: '左栏标签' }).first().click()
  await page.waitForTimeout(600)
  await selBarSilence(page)
  const hits = page.locator('.slot-hit.hot, .slot-hit.focused')
  const n = await hits.count()
  if (!n) { console.log('[FAIL] 6. leftTag可编辑 :: 无放置槽'); process.exit(0) }
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
  await page.waitForTimeout(600)
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
  console.log(`[${sel !== 'no-block' && taVis && typed ? 'PASS' : 'FAIL'}] 6. leftTag可编辑 :: 选中=${sel} 编辑入口=${taVis} 写入生效=${typed}`)
  await page.screenshot({ path: `${OUT}/06-leftTag.png`, fullPage: true })
})
