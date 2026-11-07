// 诊断：pinia store 直改块文字
import { launch, openBlank, startPlace, placeAt } from './lib.mjs'

const { browser, page } = await launch()
try {
  await openBlank(page, 10, 6, 2)
  await startPlace(page, '强调注脚')
  await placeAt(page, 0)
  const r = await page.evaluate(() => {
    const app = document.querySelector('#app')?.__vue_app__
    if (!app) return 'no-app'
    const pinia = app.config.globalProperties?.$pinia
    const store = pinia?._s?.get('editor')
    if (!store || !store.current) return 'no-store:' + Array.from(pinia?._s?.keys?.() ?? []).join(',')
    const blocks = store.current.blocks.map((b) => b.type + '@' + b.slotId + '#' + b.id)
    const blk = store.current.blocks.find((b) => b.type === 'emphFooter')
    if (!blk) return 'no-block:' + JSON.stringify(blocks)
    const ok = store.apply({ kind: 'updateBlock', blockId: blk.id, props: { text: '注：测试注脚文字' } })
    return 'apply=' + ok + ' blocks=' + JSON.stringify(blocks) + ' text=' + (store.current.blocks.find((b) => b.id === blk.id)?.props?.text ?? '(空)')
  })
  console.log('[store]', r)
  await page.waitForTimeout(600)
  // 复制 HTML 验证
  await page.getByRole('button', { name: '导出', exact: true }).click()
  await page.waitForTimeout(600)
  await page.evaluate(() => navigator.clipboard.writeText(''))
  await page.getByRole('button', { name: '复制 HTML' }).click()
  await page.waitForTimeout(900)
  const html = await page.evaluate(async () => {
    const items = await navigator.clipboard.read()
    for (const it of items) if (it.types.includes('text/html')) return (await it.getType('text/html')).text()
    return ''
  })
  console.log('[HTML 含测试注脚]', html.includes('测试注脚'), '| 长度', html.length)
} finally { await browser.close() }
console.log('DONE')
