import { launch, BASE } from './helpers.mjs'
const log = (...a) => console.log('[dbg15]', ...a)
const { browser, page } = await launch()
try {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: '统计看板' }).waitFor({ timeout: 8000 })
  await page.waitForTimeout(1000)
  const mine = await page.evaluate(() => {
    const out = {}
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      const v = localStorage.getItem(k) ?? ''
      out[k] = v.length > 200 ? v.slice(0, 200) + `...(len ${v.length})` : v
    }
    return out
  })
  log('localStorage keys:', JSON.stringify(Object.keys(mine)))
  for (const [k, v] of Object.entries(mine)) log(`  ${k} = ${v}`)
  const cards = await page.locator('article.card').allInnerTexts()
  log('卡片数:', cards.length)
  cards.forEach((c, i) => log(`  card[${i}]:`, c.replace(/\n/g, '|').slice(0, 60)))
} finally { await browser.close() }
console.log('[dbg15] DONE')
