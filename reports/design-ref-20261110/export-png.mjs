// 批 B 视觉验收导出脚本：3 张重写模板 → 编辑台截图 + PNG（2×） + HTML
// 用法：node reports/design-ref-20261110/export-png.mjs [名称 ...]（缺省 = 三张全导）
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = HERE
const BASE = 'http://127.0.0.1:5173'

const ALL = [
  { card: '三年级2班课程表', file: '01-课程表' },
  { card: '百万医疗险·横向测评', file: '02-保险测评' },
  { card: '十月·家庭收支账', file: '03-家庭收支账' },
  { card: '三款机型参数对比', file: '04-机型对比' },
  { card: '年度体检·指标解读', file: '05-体检报告' },
  { card: '餐厅秋季菜单', file: '06-秋季菜单' },
  { card: '产品改版排期', file: '07-项目排期' },
  { card: '大理四天三晚行程', file: '08-旅行行程' },
  { card: '推拉腿·四分化训练', file: '09-训练计划' },
  { card: '十月·家庭账本', file: '10-家庭账本' },
  { card: '城市杯·八强淘汰赛', file: '11-淘汰赛' },
  { card: '二十一天·习惯打卡', file: '12-习惯打卡' },
]

const wanted = process.argv.slice(2)
const targets = wanted.length ? ALL.filter((t) => wanted.some((w) => t.card.includes(w))) : ALL

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } })
const consoleErrors = []
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200))
})
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 200)))

async function dismissRestore() {
  const banner = page.getByRole('button', { name: '不恢复，重新选模板' })
  if (await banner.count()) {
    await banner.click()
    await page.waitForTimeout(500)
    const confirm = page.getByRole('button', { name: '丢弃，重新选模板' })
    if (await confirm.count()) {
      await confirm.click()
      await page.waitForTimeout(800)
    }
  }
}

async function replaceConfirm() {
  const yes = page.getByRole('button', { name: /替换|离开/ })
  if (await yes.count()) {
    await yes.first().click()
    await page.waitForTimeout(800)
  }
}

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2200)
  await dismissRestore()

  for (const t of targets) {
    // 回模板库
    const back = page.getByRole('button', { name: '← 模板库' })
    if (await back.count()) {
      await back.click()
      await page.waitForTimeout(900)
      await replaceConfirm()
    }
    const card = page.locator('article', { has: page.locator('h3', { hasText: t.card }) })
    await card.first().getByRole('button', { name: '使用此模板' }).click()
    await page.waitForTimeout(600)
    await replaceConfirm()
    await page.waitForTimeout(2600)

    await page.screenshot({ path: path.join(OUT, `${t.file}-editor.png`), fullPage: true })

    // 导出 PNG（2×）
    await page.getByRole('button', { name: '导出', exact: true }).click()
    await page.waitForTimeout(700)
    const dlPromise = page.waitForEvent('download', { timeout: 30000 })
    await page.getByRole('button', { name: '导出 PNG' }).click()
    const dl = await dlPromise
    await dl.saveAs(path.join(OUT, `${t.file}.png`))
    console.log(`[ok] ${t.file}.png`)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }
} finally {
  await browser.close()
}
if (consoleErrors.length) {
  console.log('CONSOLE ERRORS:')
  for (const e of consoleErrors) console.log('  -', e)
  process.exitCode = 2
} else {
  console.log('console clean')
}
