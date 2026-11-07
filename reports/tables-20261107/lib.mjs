// pretty-table 建表公共库（2026-11-07）
import { chromium } from '@playwright/test'
import process from 'node:process'

process.env.NO_PROXY ??= 'localhost,127.0.0.1,::1'
process.env.no_proxy ??= 'localhost,127.0.0.1,::1'

export const BASE = 'http://127.0.0.1:5173'
export const OUT = 'F:/pretty-table/reports/tables-20261107'

export async function launch(viewport = { width: 1600, height: 1000 }) {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
  const page = await context.newPage()
  const consoleErrors = []
  const pageErrors = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  return { browser, context, page, consoleErrors, pageErrors }
}

export async function openHome(page) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
}

export async function openBlank(page, rows, cols, levels) {
  await openHome(page)
  await page.getByTestId('blank-card').getByRole('button', { name: /配置并新建/ }).click()
  await page.getByTestId('blank-wizard').waitFor({ state: 'visible', timeout: 5000 })
  await page.getByTestId('blank-rows').fill(String(rows))
  await page.getByTestId('blank-cols').fill(String(cols))
  await page.getByTestId('blank-levels').selectOption(String(levels))
  await page.getByTestId('blank-create').click()
  await page.waitForTimeout(2000)
}

export async function openTemplate(page, tplName) {
  await openHome(page)
  await page.locator('article.card', { hasText: tplName }).first().getByRole('button', { name: '使用此模板' }).click()
  await page.waitForTimeout(2000)
}

/** 画布与轨道工具 */
export function canvas(page) { return page.getByTestId('preview-canvas') }

/** 选区工具条浮层会拦截画布点击：置 pointer-events:none（纯 UI，不影响功能） */
export async function silenceSelBar(page) {
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="selection-bar"]')
    if (el) el.style.pointerEvents = 'none'
    document.querySelectorAll('.block-handle, .block-handle-wrap').forEach((b) => { b.style.pointerEvents = 'none' })
  }).catch(() => {})
}

/** 盲导航：点画布左上 (36,16) 定位 R0C0，再按方向键计数导航（不依赖 headline） */
export async function navFromHome(page, down, right) {
  await silenceSelBar(page)
  await canvas(page).click({ position: { x: 36, y: 16 } })
  await page.waitForTimeout(200)
  for (let i = 0; i < down; i++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(90) }
  for (let i = 0; i < right; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(90) }
  await page.waitForTimeout(150)
}

/** 选中格文字（内容面板 textarea） */
export function cellTextarea(page) {
  return page.locator('[data-testid="group-content"] textarea:visible')
}

/** 填当前选中格多行文字 */
export async function fillCell(page, text) {
  const ta = cellTextarea(page)
  await ta.fill(text, { timeout: 5000 })
  await ta.blur()
  await page.waitForTimeout(120)
}

/** TSV 粘贴：锚点 = 当前选中格。cells = 二维数组；含换行/制表/引号的格自动加引号包裹 */
export async function pasteGrid(page, cells) {
  const tsv = cells.map((row) => row.map((c) => {
    const s = String(c ?? '')
    return /[\t\n"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }).join('\t')).join('\n')
  await page.evaluate(async (t) => { await navigator.clipboard.writeText(t) }, tsv)
  await page.keyboard.press('Control+V')
  await page.waitForTimeout(700)
  const toast = await page.locator('.pt-toast-msg').innerText().catch(() => '')
  // 多格 → 预览态，Enter 确认
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  const toast2 = await page.locator('.pt-toast-msg').innerText().catch(() => '')
  return { toastAfterPaste: toast, toastAfterEnter: toast2 }
}

/** 行/列轨道操作（前插/后插/删除/移动）。axis: 'row'|'col'; idx 0 基 */
export async function railOp(page, axis, idx, key, confirmDelete = true) {
  const item = page.getByTestId(`rail-${axis}-${idx}`)
  await item.scrollIntoViewIfNeeded()
  await item.hover()
  await page.waitForTimeout(250)
  await page.getByTestId(`rail-${axis}-menu-${idx}`).click()
  await page.waitForTimeout(350)
  await page.getByTestId(`menu-${axis}-${key}`).click()
  await page.waitForTimeout(500)
  if (confirmDelete && key === 'remove') {
    const dlg = page.getByRole('button', { name: /删除/ }).last()
    if (await dlg.isVisible().catch(() => false)) { await dlg.click(); await page.waitForTimeout(500) }
  }
}

/** 通过 pinia store 删除块（如预置分组块挡粘贴时） */
export async function storeRemoveBlock(page, match) {
  return page.evaluate((m) => {
    const app = document.querySelector('#app')?.__vue_app__
    if (!app) return 'no-app'
    const store = app.config.globalProperties?.$pinia?._s?.get('editor')
    if (!store || !store.current) return 'no-store'
    const blks = store.current.blocks.filter((b) => (m.slotId ? b.slotId === m.slotId : b.type === m.type))
    for (const b of blks) {
      const ok = store.apply({ kind: 'removeBlock', blockId: b.id })
      if (!ok) return 'remove-false:' + b.id
    }
    return 'ok:removed=' + blks.length
  }, match)
}

/** 通过 pinia store 直改块 props（footer 等视口外块行点击不可达时的可靠通道；应用公开 store 机制） */
export async function storeEditBlock(page, match, patch) {
  return page.evaluate(({ m, p }) => {
    const app = document.querySelector('#app')?.__vue_app__
    if (!app) return 'no-app'
    const pinia = app.config.globalProperties?.$pinia
    const store = pinia?._s?.get('editor')
    if (!store || !store.current) return 'no-store'
    const blk = store.current.blocks.find((b) => (m.slotId ? b.slotId === m.slotId : b.type === m.type))
    if (!blk) return 'no-block:' + JSON.stringify(store.current.blocks.map((b) => b.type + '@' + b.slotId))
    const ok = store.apply({ kind: 'updateBlock', blockId: blk.id, props: p })
    const after = store.current.blocks.find((b) => b.id === blk.id)?.props?.text ?? '(无)'
    return ok ? `ok|after=${String(after).slice(0, 16)}` : 'apply-false'
  }, { m: match, p: patch })
}
export async function startPlace(page, label) {
  const railBtn = page.getByTestId('library-rail-open')
  if (await railBtn.isVisible().catch(() => false)) { await railBtn.click(); await page.waitForTimeout(500) }
  await page.locator('.block-lib li', { hasText: label }).first().click()
  await page.waitForTimeout(600)
  const hits = page.locator('.slot-hit.hot, .slot-hit.focused')
  const n = await hits.count()
  const info = []
  for (let i = 0; i < n; i++) {
    const el = hits.nth(i)
    info.push({ i, text: (await el.innerText()).slice(0, 30), box: await el.boundingBox() })
  }
  return info
}

/** 点击第 k 个 slot-hit 放入区块 */
export async function placeAt(page, k) {
  await silenceSelBar(page)
  await page.locator('.slot-hit.hot, .slot-hit.focused').nth(k).click()
  await page.waitForTimeout(500)
}

/** 扫射点击画布 y 区间选中块（footer 等块行位置不定），命中后填文字；可选先滚动到底 */
export async function editBlockScan(page, x, yFrom, yTo, text, step = 4) {
  for (let y = yFrom; y <= yTo; y += step) {
    await silenceSelBar(page)
    await canvas(page).click({ position: { x, y } })
    await page.waitForTimeout(220)
    const ta = page.locator('[data-testid="block-headline"] + textarea')
    if (await ta.isVisible().catch(() => false)) {
      await ta.fill(text, { timeout: 4000 })
      await ta.blur()
      await page.waitForTimeout(200)
      return true
    }
  }
  return false
}

/** footer 块编辑：先在画布底部滚轮下滚，再扫射；失败再回顶部扫射 */
export async function editFooterBlock(page, text) {
  await silenceSelBar(page)
  await canvas(page).hover({ position: { x: 400, y: 380 } })
  await page.mouse.wheel(0, 800)
  await page.waitForTimeout(500)
  let ok = await editBlockScan(page, 410, 320, 396, text)
  if (ok) return true
  await page.mouse.wheel(0, -1600)
  await page.waitForTimeout(500)
  ok = await editBlockScan(page, 410, 8, 120, text)
  console.log('[editFooterBlock]', ok ? '命中(顶部)' : '失败')
  return ok
}
export async function editBlockAt(page, x, y, text, tier) {
  await silenceSelBar(page)
  await canvas(page).click({ position: { x, y } })
  await page.waitForTimeout(400)
  const ta = page.locator('[data-testid="block-headline"] + textarea')
  if (!(await ta.isVisible().catch(() => false))) {
    const sh = await page.getByTestId('slot-headline').innerText().catch(() => '(无)')
    const bh = await page.getByTestId('block-headline').innerText().catch(() => '(无)')
    console.log(`[editBlockAt 诊断] 点击(${Math.round(x)},${Math.round(y)}) 后 slot-headline="${sh}" block-headline="${bh}"`)
  }
  await ta.fill(text, { timeout: 5000 })
  await ta.blur()
  if (tier) {
    const t = page.getByTestId('block-tier')
    if (await t.isVisible().catch(() => false)) {
      await t.getByText(tier === 2 ? '深' : tier === 3 ? '大' : '浅', { exact: false }).click().catch(() => {})
      await page.waitForTimeout(250)
    }
  }
  await page.waitForTimeout(200)
}

/** 样式：选主题 + 覆盖 6 色 + 列宽 */
export async function applyStyle(page, colors, colWidths) {
  await page.getByTestId('group-head-style').click()
  await page.waitForTimeout(500)
  // 主题（按钮组）
  await page.locator('[data-testid="group-style"] button', { hasText: '暖灰金' }).click().catch(async () => {
    // 主题名可能不同，点第 3 个主题按钮
    const btns = page.locator('[data-testid="group-style"] .seg button, [data-testid="group-style"] .themes button')
    if (await btns.count()) await btns.nth(2).click()
  })
  await page.waitForTimeout(400)
  const map = { primary: '表头底色', headerText: '表头文字', zebra: '斑马纹', emphasis: '强调色', border: '边框色', background: '表格底色' }
  for (const [key, label] of Object.entries(map)) {
    if (!colors[key]) continue
    const field = page.locator(`[data-testid="color-field-${key}"]`)
    const input = field.locator('input[type="text"], input:not([type])').last()
    await input.fill(colors[key], { timeout: 4000 })
    await input.press('Enter').catch(() => {})
    await page.waitForTimeout(150)
  }
  if (colWidths) {
    // 列宽输入在样式面板（格式微调下方，按「第N列」顺序）
    const inputs = page.locator('[data-testid="group-style"] input[type="number"]')
    const cnt = await inputs.count()
    for (let i = 0; i < Math.min(cnt, colWidths.length); i++) {
      if (colWidths[i] == null) continue
      await inputs.nth(i).fill(String(colWidths[i]))
      await page.waitForTimeout(120)
    }
  }
  await page.waitForTimeout(400)
}

/** KPI 卡（先展开统计卡组） */
export async function addKpi(page, cards) {
  await page.getByTestId('group-head-kpi').click()
  await page.waitForTimeout(400)
  for (const c of cards) {
    await page.getByTestId('kpi-add').click()
    await page.waitForTimeout(350)
  }
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i]
    await page.getByTestId(`kpi-label-${i}`).fill(c.label)
    await page.getByTestId(`kpi-label-${i}`).press('Tab')
    await page.waitForTimeout(120)
    await page.getByTestId(`kpi-value-${i}`).fill(c.value)
    await page.getByTestId(`kpi-value-${i}`).press('Tab')
    await page.waitForTimeout(120)
    if (c.unit) {
      await page.getByTestId(`kpi-unit-${i}`).fill(c.unit)
      await page.getByTestId(`kpi-unit-${i}`).press('Tab')
      await page.waitForTimeout(120)
    }
    if (c.accent != null) {
      const a = page.getByTestId(`kpi-accent-${i}`)
      if (await a.count()) { await a.click(); await page.waitForTimeout(150) }
    }
  }
  await page.waitForTimeout(300)
}

/** 对齐/强调当前选中格：align left/center/right；em red/bold/bg */
export async function cellAlign(page, align) {
  await page.locator('[data-testid="group-content"] button', { hasText: align === 'left' ? '左' : align === 'center' ? '中' : '右' }).first().click()
  await page.waitForTimeout(200)
}
export async function cellEm(page, em) {
  const t = { red: '红字', bold: '加粗', bg: '底色' }[em]
  await page.locator('[data-testid="group-content"] button', { hasText: t }).first().click()
  await page.waitForTimeout(200)
}

/** 四件套导出：整页截图 + 2x PNG 下载 + 复制 HTML 存文件 + 另存模板 */
export async function exportAll(page, name, consoleErrors) {
  // a) 编辑台整页截图
  await page.screenshot({ path: `${OUT}/${name}-editor.png`, fullPage: true })
  // b) 导出 PNG 2x
  await page.getByRole('button', { name: '导出', exact: true }).click()
  await page.waitForTimeout(700)
  await page.getByRole('button', { name: '2×' }).click()
  await page.waitForTimeout(300)
  const dlPromise = page.waitForEvent('download', { timeout: 30000 })
  await page.getByRole('button', { name: '导出 PNG' }).click()
  const dl = await dlPromise
  await dl.saveAs(`${OUT}/${name}.png`)
  // c) 复制 HTML（读 text/html 风味；readText 只有 TSV plain 风味）
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
  const fs = await import('node:fs')
  fs.writeFileSync(`${OUT}/${name}.html`, html, 'utf8')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  // d) 另存为模板 + IndexedDB 落库验证（同 context 内）
  await page.getByRole('button', { name: '另存为模板' }).click()
  await page.waitForTimeout(600)
  const dlgInput = page.locator('dialog input, [class*="dialog"] input, .modal input').first()
  await dlgInput.fill(name)
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.waitForTimeout(900)
  const tplCount = await page.evaluate(() => new Promise((res) => {
    const req = indexedDB.open('pretty-table')
    req.onsuccess = () => {
      try {
        const tx = req.result.transaction('kv', 'readonly')
        const rq = tx.objectStore('kv').getAllKeys()
        rq.onsuccess = () => res(rq.result.filter((k) => String(k).startsWith('tpl:')).length)
        rq.onerror = () => res(-1)
      } catch { res(-2) }
    }
    req.onerror = () => res(-3)
  }))
  console.log(`[另存模板] ${name}: IndexedDB tpl:键 ${tplCount} 个`)
  return { html, pngPath: `${OUT}/${name}.png`, htmlPath: `${OUT}/${name}.html`, tplCount }
}

export function assertIncludes(html, keys, label) {
  const missing = keys.filter((k) => !html.includes(k))
  if (missing.length) console.log(`[ASSERT-FAIL ${label}] 缺少: ${JSON.stringify(missing)}`)
  else console.log(`[ASSERT-OK ${label}] ${keys.length} 个关键词全部命中`)
  return missing.length === 0
}

/** 模板 JSON 导出（2026-11-08 跨设备同步）：开导出抽屉 → 点「导出 JSON」捕获 download 落盘到 savePath */
export async function exportJson(page, savePath) {
  await page.getByRole('button', { name: '导出', exact: true }).click()
  await page.waitForTimeout(700)
  const dlPromise = page.waitForEvent('download', { timeout: 30000 })
  await page.getByTestId('export-json-btn').click()
  const dl = await dlPromise
  await dl.saveAs(savePath)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  return savePath
}
