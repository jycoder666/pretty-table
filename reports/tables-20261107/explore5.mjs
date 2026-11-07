// 实验室：pricing 列头编辑/删行删列/块放置/HTML 导出验证
import { chromium } from '@playwright/test'
import process from 'node:process'

process.env.NO_PROXY ??= 'localhost,127.0.0.1,::1'
process.env.no_proxy ??= 'localhost,127.0.0.1,::1'

const OUT = 'F:/pretty-table/reports/tables-20261107'
const BASE = 'http://127.0.0.1:5173'
const consoleErrors = []

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
const page = await context.newPage()
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', (e) => consoleErrors.push(String(e)))

async function clipHtml() {
  await page.evaluate(() => navigator.clipboard.writeText(''))
  await page.getByRole('button', { name: '复制 HTML' }).click()
  await page.waitForTimeout(900)
  return page.evaluate(() => navigator.clipboard.readText())
}

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)

// 开 pricing 模板
await page.locator('article.card', { hasText: '价目清单' }).first().getByRole('button', { name: '使用此模板' }).click()
await page.waitForTimeout(2000)
console.log('[pricing 打开] summary:', await page.getByTestId('structure-summary').innerText())

// 打开导出抽屉拿 HTML 基线（先开抽屉留待后用）
await page.getByRole('button', { name: '导出', exact: true }).click()
await page.waitForTimeout(600)
let html = await clipHtml()
console.log('[HTML 长度]', html.length)
const textOnly = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
console.log('[HTML 文本预览]', textOnly.slice(0, 300))
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// 1) 列头 R1C1「项目」能否编辑：点击画布该格
// 画布布局：pricing 13 逻辑行+2块行。先点 R1C1。canvas 坐标：列宽未知，先点试试
const canvas = page.getByTestId('preview-canvas')
const box = await canvas.boundingBox()
console.log('[canvas]', JSON.stringify(box))
// R1 是逻辑行1；可见行0=caption。R1 y ≈ caption 高度后。先粗点 x=150,y=60
await canvas.click({ position: { x: 150, y: 62 } })
await page.waitForTimeout(500)
const head = await page.getByTestId('slot-headline').innerText().catch(() => '(无)')
console.log('[点 R1 附近 headline]', head)
const ta = page.locator('[data-testid="group-content"] textarea')
const taCount = await ta.count()
console.log('[textarea 数]', taCount)
if (taCount) {
  const before = await ta.first().inputValue()
  try {
    await ta.first().fill('测试列头', { timeout: 2000 })
    await page.waitForTimeout(400)
    const after = await ta.first().inputValue()
    console.log('[列头编辑]', JSON.stringify({ before, after, editable: after === '测试列头' }))
  } catch (e) {
    console.log('[列头编辑失败]', String(e).slice(0, 100))
  }
}

// 2) 删合计行：打开行轨道菜单 rail-row-12（0基=第13行）→ menu-row-remove
await page.getByTestId('rail-row-12').click()
await page.waitForTimeout(400)
const removeBtn = page.getByTestId('menu-row-remove')
if (await removeBtn.count()) {
  const dis = await removeBtn.isDisabled()
  console.log('[删合计行按钮 disabled]', dis)
  if (!dis) {
    await removeBtn.click()
    await page.waitForTimeout(600)
    // 确认对话框（含内容删除会弹确认）
    const confirmBtn = page.getByRole('button', { name: /确定|删除/ }).last()
    if (await confirmBtn.isVisible().catch(() => false)) {
      console.log('[确认框]', await confirmBtn.innerText())
      await confirmBtn.click()
      await page.waitForTimeout(600)
    }
    console.log('[删后 summary]', await page.getByTestId('structure-summary').innerText())
  }
} else {
  console.log('[删合计行] 菜单未出现')
}

// 3) 删列 C0（序号列）
await page.getByTestId('rail-col-0').click()
await page.waitForTimeout(400)
const rmCol = page.getByTestId('menu-col-remove')
if (await rmCol.count()) {
  console.log('[删列C0 disabled]', await rmCol.isDisabled())
  if (!(await rmCol.isDisabled())) {
    await rmCol.click()
    await page.waitForTimeout(600)
    const cBtn = page.getByRole('button', { name: /确定|删除/ }).last()
    if (await cBtn.isVisible().catch(() => false)) { await cBtn.click(); await page.waitForTimeout(500) }
    console.log('[删列后 summary]', await page.getByTestId('structure-summary').innerText())
  }
} else {
  console.log('[删列菜单未出现]')
}

// 4) 组件放置：分组标题行 → gap-g1（已有 preset-g1「材料」，会替换）
await page.getByTestId('library-rail-open').click()
await page.waitForTimeout(600)
const gh = page.getByText('分组标题行', { exact: true })
console.log('[组件项可见]', await gh.isVisible().catch(() => false))
await gh.click()
await page.waitForTimeout(600)
// 虚线槽：SlotOverlay。查出现的高亮槽元素
const slots = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('[data-testid*="slot"], .slot-overlay [class], [class*="drop"]')).slice(0, 12).map((el) =>
    (el.getAttribute('data-testid') || el.className).toString().slice(0, 60))
})
console.log('[放置态元素]', JSON.stringify(slots))
// 选中区块后内容面板显示 block（点画布上已有块行？块行位置 after-1 → 可见行2）
// 先 Esc 取消放置
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// 5) 点已有 groupHeader 块（可见行2 = 块行）改文字：块行在 caption(R0)+head(R1) 之后
await canvas.click({ position: { x: 200, y: 100 } })
await page.waitForTimeout(500)
console.log('[点块行 headline]', await page.getByTestId('slot-headline').innerText().catch(() => '(无)'))
const bta = page.locator('[data-testid="group-content"] textarea')
if (await bta.count()) console.log('[块 textarea]', JSON.stringify(await bta.first().inputValue()))
const bt = await page.getByTestId('block-tier').innerText().catch(() => '(无)')
console.log('[块 tier]', bt)

console.log('[gate] console error 数:', consoleErrors.length)
consoleErrors.slice(0, 8).forEach((e) => console.log('  console.error:', e.slice(0, 140)))
await browser.close()
console.log('LAB_DONE')
