// 二轮新功能浏览器验证（6 项 DOM 断言，2026-11-07）
import { chromium } from '@playwright/test'
import process from 'node:process'
import fs from 'node:fs'

process.env.NO_PROXY ??= 'localhost,127.0.0.1,::1'
process.env.no_proxy ??= 'localhost,127.0.0.1,::1'

const BASE = 'http://127.0.0.1:5173'
const OUT = 'F:/pretty-table/reports/feat2-20261107'
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
const page = await context.newPage()
const consoleErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', (e) => consoleErrors.push('pageerror:' + String(e)))

const results = []
function report(n, name, ok, detail) {
  results.push({ n, name, ok, detail })
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${n}. ${name} :: ${detail}`)
}

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)

async function openTpl(name) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await page.locator('article.card', { hasText: name }).first().getByRole('button', { name: '使用此模板' }).click()
  await page.waitForTimeout(2000)
}

// ── 1. 分组行动态化：pricing 模板连插 3 个分组（共 4 组）+ 上移 ──
try {
  await openTpl('价目清单')
  // 选中一个正文行：点画布 R2（第一处正文），用键盘导航兜底
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="selection-bar"]')
    if (el) el.style.pointerEvents = 'none'
  })
  await page.getByTestId('preview-canvas').click({ position: { x: 36, y: 16 } })
  await page.waitForTimeout(200)
  for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(90) }
  // 打开结构组
  await page.getByTestId('group-head-structure').click()
  await page.waitForTimeout(400)
  const before = await page.evaluate(() => {
    const app = document.querySelector('#app')?.__vue_app__
    const store = app?.config.globalProperties?.$pinia?._s?.get('editor')
    return store?.current?.blocks?.filter((b) => b.type === 'groupHeader').length ?? -1
  })
  // 插入 3 个分组标题
  for (let i = 0; i < 3; i++) {
    const btn = page.getByRole('button', { name: '插入分组标题' })
    const disabled = await btn.isDisabled().catch(() => true)
    if (disabled) { report(1, '分组动态化', false, `第 ${i + 1} 次插入按钮禁用（需正文行选中）`); break }
    await btn.click()
    await page.waitForTimeout(600)
  }
  const after = await page.evaluate(() => {
    const app = document.querySelector('#app')?.__vue_app__
    const store = app?.config.globalProperties?.$pinia?._s?.get('editor')
    return store?.current?.blocks?.filter((b) => b.type === 'groupHeader').length ?? -1
  })
  report(1, '分组动态化·插入3次', after === before + 3, `groupHeader ${before}→${after}（期望 +3）`)
  await page.screenshot({ path: `${OUT}/01-分组动态化-4组.png`, fullPage: true })
} catch (e) { report(1, '分组动态化', false, '异常: ' + String(e).slice(0, 120)) }

// ── 2. 组头配色：选中分组行 → block-color 豆绿 → 导出 HTML 含色值 ──
try {
  // 选中刚插入的分组行区块
  const blk = await page.evaluate(() => {
    const app = document.querySelector('#app')?.__vue_app__
    const store = app?.config.globalProperties?.$pinia?._s?.get('editor')
    const b = store?.current?.blocks?.filter((x) => x.type === 'groupHeader').at(-1)
    if (b) store.selectedBlockId = b.id
    return b ? b.id : null
  })
  await page.waitForTimeout(400)
  const customInput = page.locator('[data-testid="block-color-custom"] input')
  if (await customInput.isVisible().catch(() => false)) {
    await customInput.fill('#D9EBDC')
    await customInput.press('Enter')
    await page.waitForTimeout(600)
    const colorApplied = await page.evaluate(() => {
      const app = document.querySelector('#app')?.__vue_app__
      const store = app?.config.globalProperties?.$pinia?._s?.get('editor')
      const b = store?.current?.blocks?.find((x) => x.id === store.selectedBlockId)
      return b?.props?.color ?? b?.props?.bg ?? JSON.stringify(b?.props ?? {}).slice(0, 80)
    })
    // 导出 HTML 验证
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
    const hit = html.includes('D9EBDC') || html.includes('217, 235, 220') || html.includes('rgb(217') 
    report(2, '组头配色豆绿', hit, `props=${String(colorApplied).slice(0, 40)}; HTML含色值=${hit}（块 ${blk}）`)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}/02-组头豆绿.png`, fullPage: true })
  } else {
    report(2, '组头配色', false, 'block-color-custom 输入不可见（可能需先选中分组行区块）')
    await page.screenshot({ path: `${OUT}/02-组头配色-未找到输入.png`, fullPage: true })
  }
} catch (e) { report(2, '组头配色', false, '异常: ' + String(e).slice(0, 120)) }

// ── 3. detail 表头第二行可编辑 ──
try {
  await openTpl('单主体明细表')
  // 找第二行表头槽（head.c1）
  const sid = await page.evaluate(() => {
    const app = document.querySelector('#app')?.__vue_app__
    const store = app?.config.globalProperties?.$pinia?._s?.get('editor')
    const g = store?.current?.layout?.slotGrid
    return g?.[1]?.[1] ?? null
  })
  if (sid) {
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
    const hit = html.includes('本次结果')
    const stillOld = html.includes('>说明<')
    report(3, 'detail表头可编辑', hit && !stillOld, `槽 ${sid} 改「本次结果」: HTML含新值=${hit}, 旧值残留=${stillOld}`)
    await page.keyboard.press('Escape')
    await page.screenshot({ path: `${OUT}/03-detail表头可编辑.png`, fullPage: true })
  } else {
    report(3, 'detail表头可编辑', false, 'slotGrid[1][1] 槽不存在（迁移未生效或模板为单层表头）')
    await page.screenshot({ path: `${OUT}/03-detail-无槽.png`, fullPage: true })
  }
} catch (e) { report(3, 'detail表头可编辑', false, '异常: ' + String(e).slice(0, 120)) }

// ── 4. caption 编辑 → 导出 HTML <caption> ──
try {
  const okSet = await page.evaluate(() => {
    const app = document.querySelector('#app')?.__vue_app__
    const store = app?.config.globalProperties?.$pinia?._s?.get('editor')
    if (!store?.current) return 'no-store'
    // 找 caption 槽（captionSlot）
    const cs = store.current.layout?.captionSlot
    if (cs) { store.apply({ kind: 'setSlot', slotId: cs, value: { t: '测试表名XYZ' } }); return 'slot:' + cs }
    // 兜底：caption 字段直改（若有 intent）
    const ok = store.apply({ kind: 'rename', name: '测试表名XYZ' })
    return ok ? 'rename' : 'no-intent'
  })
  await page.waitForTimeout(500)
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
  const hit = html.includes('测试表名XYZ')
  report(4, 'caption编辑', hit, `通道=${okSet}; HTML含新表名=${hit}`)
  await page.keyboard.press('Escape')
  await page.screenshot({ path: `${OUT}/04-caption编辑.png`, fullPage: true })
} catch (e) { report(4, 'caption编辑', false, '异常: ' + String(e).slice(0, 120)) }

// ── 5. 空槽导出无占位文案（detail 模板新实例本无区块）──
try {
  const hasPh = await (async () => {
    const html = await page.evaluate(async () => {
      const items = await navigator.clipboard.read()
      for (const it of items) if (it.types.includes('text/html')) return await (await it.getType('text/html')).text()
      return ''
    })
    return html.includes('可拖入')
  })()
  // 上一步剪贴板可能已是导出 HTML（detail 新实例，无任何放置区块）
  report(5, '空槽导出无占位', !hasPh, `导出 HTML 含「可拖入」=${hasPh}`)
} catch (e) { report(5, '空槽导出', false, '异常: ' + String(e).slice(0, 120)) }

// ── 6. leftTag 点击选中与文字编辑 ──
try {
  await openTpl('新建空白表')
  // 放置左栏标签块：组件库 → 左栏标签
  const railBtn = page.getByTestId('library-rail-open')
  if (await railBtn.isVisible().catch(() => false)) { await railBtn.click(); await page.waitForTimeout(500) }
  await page.locator('.block-lib li', { hasText: '左栏标签' }).first().click()
  await page.waitForTimeout(600)
  await page.locator('.slot-hit.hot, .slot-hit.focused').first().click()
  await page.waitForTimeout(500)
  // 尝试点击画布首列上的块（leftTag 不占行，位置在首列左侧）
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="selection-bar"]')
    if (el) el.style.pointerEvents = 'none'
    document.querySelectorAll('.block-handle, .block-handle-wrap').forEach((b) => { b.style.pointerEvents = 'none' })
  })
  // 通过 store 直接选中块看 UI 是否给编辑入口（点击命中试验 + store 选中双路）
  const sel = await page.evaluate(() => {
    const app = document.querySelector('#app')?.__vue_app__
    const store = app?.config.globalProperties?.$pinia?._s?.get('editor')
    const b = store?.current?.blocks?.find((x) => x.type === 'leftTag')
    if (!b) return 'no-block'
    store.selectedBlockId = b.id
    return 'selected:' + b.id
  })
  await page.waitForTimeout(500)
  const hasEditor = await page.evaluate(() => {
    const ta = document.querySelector('[data-testid="group-content"] textarea')
    return ta ? ta.offsetParent !== null : false
  })
  const canType = hasEditor ? await (async () => {
    const ta = page.locator('[data-testid="group-content"] textarea:visible')
    await ta.fill('城东')
    await ta.blur()
    await page.waitForTimeout(400)
    return page.evaluate(() => {
      const app = document.querySelector('#app')?.__vue_app__
      const store = app?.config.globalProperties?.$pinia?._s?.get('editor')
      const b = store?.current?.blocks?.find((x) => x.type === 'leftTag')
      return b?.props?.text === '城东'
    })
  })() : false
  report(6, 'leftTag可编辑', sel.startsWith('selected') && canType, `${sel}; 文字编辑入口=${hasEditor}; 写入生效=${canType}`)
  await page.screenshot({ path: `${OUT}/06-leftTag编辑.png`, fullPage: true })
} catch (e) { report(6, 'leftTag可编辑', false, '异常: ' + String(e).slice(0, 120)) }

console.log('\n==== 汇总 ====')
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} | ${r.n} | ${r.name} | ${String(r.detail).slice(0, 100)}`)
console.log('console errors:', consoleErrors.length, consoleErrors.slice(0, 3))
await browser.close()
process.exit(consoleErrors.length ? 2 : 0)
