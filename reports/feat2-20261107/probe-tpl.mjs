// 探测 pw-profile IndexedDB 中已入库模板（任务二前置调查）
import { chromium } from '@playwright/test'
import process from 'node:process'

process.env.NO_PROXY ??= 'localhost,127.0.0.1,::1'
process.env.no_proxy ??= 'localhost,127.0.0.1,::1'

const PROFILE = 'F:/pretty-table/reports/tables-20261107/_work/pw-profile'
const BASE = 'http://127.0.0.1:5173'

const context = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  args: ['--no-proxy-server'],
  viewport: { width: 1560, height: 1100 },
})
const page = context.pages()[0] ?? (await context.newPage())
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)

const keys = await page.evaluate(() => new Promise((res) => {
  const req = indexedDB.open('pretty-table')
  req.onsuccess = () => {
    try {
      const tx = req.result.transaction('kv', 'readonly')
      const rq = tx.objectStore('kv').getAllKeys()
      rq.onsuccess = () => res(rq.result.map(String))
      rq.onerror = () => res(['ERR-getAllKeys'])
    } catch (e) { res(['ERR-' + e.message]) }
  }
  req.onerror = () => res(['ERR-open'])
}))
console.log('[IndexedDB keys]', JSON.stringify(keys, null, 0))

// 每个模板的标题（displayName）
for (const k of keys.filter((x) => x.startsWith('tpl:'))) {
  const val = await page.evaluate((key) => new Promise((res) => {
    const req = indexedDB.open('pretty-table')
    req.onsuccess = () => {
      const tx = req.result.transaction('kv', 'readonly')
      const rq = tx.objectStore('kv').get(key)
      rq.onsuccess = () => {
        try {
          const raw = rq.result
          const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
          res(obj?.meta?.displayName ?? obj?.meta ?? '(unknown)')
        } catch (e) { res('parse-err:' + e.message) }
      }
      rq.onerror = () => res('get-err')
    }
    req.onerror = () => res('open-err')
  }), k)
  console.log(`[tpl] ${k} → ${JSON.stringify(val)}`)
}

// 库页卡片列表（我的模板区）
const cards = await page.locator('article.card').allInnerTexts().catch(() => [])
console.log('[库页卡片]', cards.map((c) => c.split('\n')[0]).join(' | '))

await context.close()
console.log('PROBE_DONE')
