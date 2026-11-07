// 临时调试：点统计看板卡后页面处于什么状态
import { chromium } from '@playwright/test'
import process from 'node:process'
process.env.NO_PROXY ??= 'localhost,127.0.0.1,::1'
process.env.no_proxy ??= 'localhost,127.0.0.1,::1'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' })
await page.getByRole('heading', { name: '统计看板' }).waitFor({ timeout: 8000 })
// 模板卡结构：找「统计看板」卡的可点击容器
const card = page.locator('article.card', { hasText: '统计看板' })
console.log('卡片数:', await card.count())
await card.first().click()
await page.waitForTimeout(2500)
console.log('点击后 URL:', page.url())
console.log('有编辑台(导出按钮):', await page.getByRole('button', { name: '导出', exact: true }).count())
console.log('有 kpi-hero:', await page.getByTestId('kpi-hero').count())
console.log('banner:', await page.locator('.banner').allTextContents().catch(() => []))
console.log('确认弹窗:', await page.locator('[role="dialog"]').allTextContents().catch(() => []))
console.log('body 前 600 字:', (await page.locator('body').innerText()).slice(0, 600).replace(/\n/g, '|'))
console.log('console errors:', JSON.stringify(errors))
await browser.close()
