// pretty-table 建表辅助库（临时脚本，不入库）
// 用法：import { ... } from './helpers.mjs'
import { chromium } from '@playwright/test'
import process from 'node:process'
import fs from 'node:fs'

process.env.NO_PROXY ??= 'localhost,127.0.0.1,::1'
process.env.no_proxy ??= 'localhost,127.0.0.1,::1'

export const BASE = 'http://127.0.0.1:5173'
export const OUT = 'F:/pretty-table/reports/tables-20261107'

// 持久化浏览器 profile（临时目录，登记待删）：IndexedDB 里的「我的模板」跨脚本保留，另存模板真实可复用
const PROFILE_DIR = 'F:/pretty-table/reports/tables-20261107/_work/pw-profile'

export async function launch() {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: ['--no-proxy-server'],
    viewport: { width: 1560, height: 1100 },
  })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
  const page = context.pages()[0] ?? (await context.newPage())
  // CSS 注入（页面级，不改应用源码）：画布高度跟随容器，避免 VTable 固定 400px 裁掉底部行
  await page.addStyleTag({ content: '.vtable-root{height:100% !important;min-height:100% !important}' })
  const consoleErrors = []
  const pageErrors = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  return { browser: context, context, page, consoleErrors, pageErrors }
}

export async function openTemplate(page, cardTitle) {
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
  await page.getByRole('heading', { name: cardTitle }).waitFor({ timeout: 8000 })
  const card = page.locator('article.card', { hasText: cardTitle }).first()
  await card.getByRole('button', { name: '使用此模板' }).click()
  // 有未另存改动时弹「替换当前的表格」确认
  const ok2 = page.getByTestId('confirm-ok')
  try {
    await ok2.waitFor({ state: 'visible', timeout: 3000 })
    await ok2.click()
  } catch {
    /* 无弹窗 */
  }
  await page.waitForTimeout(2000) // 渲染核动态加载 + 首帧几何
}

/** 在库页（须已回到库页，勿 reload——reload 会恢复最近编辑进编辑台）打开空白向导并创建 */
export async function createBlank(page, rows, cols, levels) {
  await page.getByTestId('blank-card').waitFor({ state: 'visible', timeout: 8000 })
  await page.getByTestId('blank-open').click()
  await page.getByTestId('blank-rows').fill(String(rows))
  await page.getByTestId('blank-cols').fill(String(cols))
  await page.getByTestId('blank-levels').selectOption(String(levels))
  await page.getByTestId('blank-create').click()
  // 有未另存改动时弹「替换当前的表格」确认
  const ok = page.getByTestId('confirm-ok')
  try {
    await ok.waitFor({ state: 'visible', timeout: 3000 })
    await ok.click()
  } catch {
    /* 无弹窗直接创建 */
  }
  await page.waitForTimeout(2000)
}

export async function scrollTop(page) {
  await page.evaluate(() => {
    const h = document.querySelector('.preview-host')
    if (h) h.scrollTop = 0
  })
  await page.waitForTimeout(150)
}

// ── 样式 ──
async function ensureGroupOpen(page, testid) {
  const expanded = await page.getByTestId(testid).getAttribute('aria-expanded')
  if (expanded !== 'true') {
    await page.getByTestId(testid).click()
    await page.waitForTimeout(250)
  }
}

export async function setTheme(page, label) {
  await ensureGroupOpen(page, 'group-head-style')
  await page.locator('.theme-btn', { hasText: label }).click()
  await page.waitForTimeout(400)
}

/** 覆盖 6 角色色；hexMap: {primary,headerText,zebra,emphasis,border,background} */
export async function setColors(page, hexMap, labels) {
  await ensureGroupOpen(page, 'group-head-style')
  for (const [role, hex] of Object.entries(hexMap)) {
    const lab = labels[role]
    const input = page.locator(`[data-testid="color-field-${role}"] input[aria-label="${lab}色值"]`)
    await input.fill(hex)
    await input.press('Tab')
    await page.waitForTimeout(250)
  }
}

export const CREAM = {
  // 小红书奶油风统一视觉（任务给定）
  primary: '#0B211C',
  headerText: '#FFFFFF',
  zebra: '#F1E9D8',
  emphasis: '#B4532A',
  border: '#D8CDB8',
  background: '#F6F0E3',
}
export const COLOR_LABELS = {
  primary: '表头底色',
  headerText: '表头文字',
  zebra: '斑马纹',
  emphasis: '强调色',
  border: '边框色',
  background: '表格底色',
}

// ── 结构（轨道）──
async function railHover(page, axis, index) {
  await page.getByTestId(`rail-${axis}-${index}`).scrollIntoViewIfNeeded().catch(() => {})
  await page.getByTestId(`rail-${axis}-${index}`).hover()
  await page.waitForTimeout(250)
}

export async function railInsertAfter(page, axis, index) {
  await railHover(page, axis, index)
  await page.getByTestId(`rail-${axis}-plus-${index}`).click()
  await page.waitForTimeout(450)
}

export async function railRemove(page, axis, index) {
  await railHover(page, axis, index)
  await page.getByTestId(`rail-${axis}-menu-${index}`).click()
  await page.waitForTimeout(300)
  await page.getByTestId(`menu-${axis}-remove`).click()
  await page.waitForTimeout(300)
  const ok = page.getByTestId('confirm-ok')
  if (await ok.isVisible().catch(() => false)) {
    await ok.click()
    await page.waitForTimeout(450)
  }
}

export async function assertSummary(page, rows, cols, levels) {
  const text = await page.getByTestId('structure-summary').innerText()
  const expect = `${rows} 行 × ${cols} 列 · ${levels} 层表头`
  if (!text.includes(expect)) throw new Error(`结构摘要不符: "${text}" 期望含 "${expect}"`)
  return text
}

// ── 画布点击与编辑 ──
/**
 * 内容坐标直点（debug7 实证：VTable cellRects 即内容坐标，el.getBoundingClientRect 实时取）。
 * rowHeights: 视觉行高数组（数据 36 / 区块 32）；vr: 目标视觉行号；x: 列内容坐标。
 */
export async function clickCellV(page, rowHeights, vr, x) {
  const g = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="preview-canvas"]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { l: r.left, t: r.top }
  })
  if (!g) throw new Error('preview-canvas 不存在')
  let cy = 0
  for (let i = 0; i < vr; i++) cy += rowHeights[i]
  cy += rowHeights[vr] / 2
  await page.mouse.click(Math.round(g.l + x), Math.round(g.t + cy))
  await page.waitForTimeout(280)
}

export async function clickCell(page, x, y) {
  await page.getByTestId('preview-canvas').click({ position: { x: Math.round(x), y: Math.round(y) } })
  await page.waitForTimeout(300)
}

/** 读当前选中槽 headline（属性面板） */
export async function slotHeadline(page) {
  return await page.getByTestId('slot-headline').innerText().catch(() => '')
}

/** 填当前选中槽文字（内容组 textarea），并 blur 提交 */
export async function fillSlot(page, text) {
  const panel = page.locator('[data-testid="group-content"]')
  const ta = panel.locator('.section', { has: page.getByTestId('slot-headline') }).locator('textarea')
  await ta.fill(text)
  await ta.press('Tab')
  await page.waitForTimeout(200)
}

/** 填当前选中区块文字（区块 textarea 在内容组第二个 section） */
export async function fillBlock(page, text) {
  const panel = page.locator('[data-testid="group-content"]')
  const sec = panel.locator('.section', { has: page.getByTestId('block-headline') })
  const ta = sec.locator('textarea')
  await ta.fill(text)
  await ta.press('Tab')
  await page.waitForTimeout(200)
}

/** 强调当前格：emphs 数组含 'red'|'bold'|'bg' */
export async function emphasize(page, emphs) {
  const panel = page.locator('[data-testid="group-content"]')
  const row = panel.locator('.section', { has: page.getByTestId('slot-headline') }).locator('.row', { hasText: '红字' })
  for (const e of emphs) {
    const name = e === 'red' ? '红字' : e === 'bold' ? '加粗' : '底色'
    await row.getByRole('button', { name, exact: true }).click()
    await page.waitForTimeout(200)
  }
}

/** 对齐当前格 */
export async function align(page, a) {
  const panel = page.locator('[data-testid="group-content"]')
  const row = panel.locator('.section', { has: page.getByTestId('slot-headline') }).locator('.row', { hasText: '左' }).first()
  const name = a === 'left' ? '左' : a === 'center' ? '中' : '右'
  await row.getByRole('button', { name, exact: true }).click()
  await page.waitForTimeout(200)
}

// ── 区块放置 ──
/** 点组件库某区块进入放置态，再点第 nth 个虚线槽（按屏幕 top 排序，0=最上） */
export async function placeBlock(page, libLabel, nth) {
  // 组件库默认窄栏（44px）：先展开
  const openBtn = page.getByTestId('library-rail-open')
  if (await openBtn.isVisible().catch(() => false)) {
    await openBtn.click()
    await page.waitForTimeout(350)
  }
  const item = page.locator('.block-lib li', { hasText: libLabel }).first()
  await item.waitFor({ state: 'visible', timeout: 5000 })
  await item.click()
  await page.waitForTimeout(400)
  const hits = page.locator('.slot-hit')
  const count = await hits.count()
  if (count === 0) throw new Error(`放置 ${libLabel} 无可放槽位`)
  // 按屏幕位置排序选目标槽
  const boxes = []
  for (let i = 0; i < count; i++) boxes.push({ i, box: await hits.nth(i).boundingBox() })
  boxes.sort((a, b) => (a.box?.top ?? 0) - (b.box?.top ?? 0))
  const target = boxes[Math.min(nth, boxes.length - 1)]
  await hits.nth(target.i).click()
  await page.waitForTimeout(1200) // 放置后几何重绘（渲染核 async paint），等 rail/命中面恢复
  return { total: count, chosenTop: target.box?.top }
}

// ── KPI ──
export async function openKpiGroup(page) {
  await page.getByTestId('group-head-kpi').click()
  await page.waitForTimeout(250)
}

export async function kpiAdd(page) {
  await page.getByTestId('kpi-add').click()
  await page.waitForTimeout(250)
}

export async function kpiFill(page, i, { label, value, unit, accent }) {
  if (label !== undefined) {
    await page.getByTestId(`kpi-label-${i}`).fill(label)
    await page.getByTestId(`kpi-label-${i}`).press('Tab')
  }
  if (value !== undefined) {
    await page.getByTestId(`kpi-value-${i}`).fill(String(value))
    await page.getByTestId(`kpi-value-${i}`).press('Tab')
  }
  if (unit !== undefined) {
    await page.getByTestId(`kpi-unit-${i}`).fill(unit)
    await page.getByTestId(`kpi-unit-${i}`).press('Tab')
  }
  if (accent && !(await page.getByTestId(`kpi-accent-${i}`).isChecked())) {
    await page.getByTestId(`kpi-accent-${i}`).check()
  }
  await page.waitForTimeout(200)
}

// ── 条形（当前选中数据格）──
export async function barOn(page, percent, color) {
  await page.getByTestId('bar-toggle').check()
  await page.waitForTimeout(300)
  if (percent !== undefined) {
    await page.getByTestId('bar-ratio').fill(String(percent))
    await page.getByTestId('bar-ratio').press('Tab')
    await page.waitForTimeout(200)
  }
  if (color) {
    await page.evaluate(() => {})
  }
}

// ── 推荐列 ──
export async function setRecommend(page, colLabel) {
  await page.getByTestId('group-head-structure').click()
  await page.waitForTimeout(250)
  await page.locator('[data-testid="group-structure"] .section', { hasText: '推荐列' })
    .getByRole('button', { name: new RegExp(colLabel) }).click()
  await page.waitForTimeout(300)
}

// ── 列宽 ──
export async function setColWidth(page, col, width) {
  await page.locator(`input[aria-label="第${col + 1}列宽"]`).fill(String(width))
  await page.locator(`input[aria-label="第${col + 1}列宽"]`).press('Tab')
  await page.waitForTimeout(250)
}

// ── 导出四件套 ──
/** 截图编辑台整页 / 导出 PNG(2x) / 复制 HTML 落盘 / 另存模板 */
export async function exportAll(page, tableName, shotName) {
  const results = {}
  // a) 编辑台整页截图
  const shot = `${OUT}/${shotName}`
  await page.screenshot({ path: shot, fullPage: true })
  results.shot = shot
  // b) 导出 PNG 2x（download 事件落盘）
  await page.getByRole('button', { name: '导出', exact: true }).click()
  await page.waitForTimeout(500)
  // 确认倍率 2x（默认记住上次；不点即默认）
  const pngPath = `${OUT}/${tableName}.png`
  const dlPromise = page.waitForEvent('download', { timeout: 30000 })
  await page.getByRole('button', { name: '导出 PNG' }).click()
  const dl = await dlPromise
  await dl.saveAs(pngPath)
  results.png = pngPath
  // c) 复制 HTML（text/html 风味）
  await page.getByRole('button', { name: '复制 HTML' }).click()
  await page.waitForTimeout(1000)
  const html = await page.evaluate(async () => {
    const items = await navigator.clipboard.read()
    for (const it of items) {
      if (it.types.includes('text/html')) return await (await it.getType('text/html')).text()
    }
    return ''
  })
  const htmlPath = `${OUT}/${tableName}.html`
  fs.writeFileSync(htmlPath, html, 'utf8')
  results.html = htmlPath
  results.htmlLen = html.length
  await page.getByRole('button', { name: '关闭' }).click()
  await page.waitForTimeout(300)
  // d) 另存为模板
  await page.getByRole('button', { name: '另存为模板' }).click()
  await page.waitForTimeout(400)
  const dlg = page.locator('.dialog', { hasText: '另存为模板' })
  await dlg.locator('input').fill(tableName)
  await dlg.getByRole('button', { name: '保存' }).click()
  await page.waitForTimeout(600)
  results.saved = true
  return results
}

export function fileSize(p) {
  try {
    return fs.statSync(p).size
  } catch {
    return -1
  }
}

// ── 几何 ──
/** 由列宽与行高（含区块行 32）计算格中心坐标。rowsSpec: [{h:36, kind:'row'|'block'}, ...] */
export function cellCenter(cols, visualRow, col, rowHeights) {
  const x = cols.slice(0, col).reduce((a, b) => a + b, 0) + cols[col] / 2
  let y = 0
  for (let i = 0; i < visualRow; i++) y += rowHeights[i]
  y += rowHeights[visualRow] / 2
  return { x, y }
}
