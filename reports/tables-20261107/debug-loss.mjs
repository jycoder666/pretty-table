// 最小复现：footer storeEdit 后哪一步丢了文字
import { launch, openBlank, startPlace, placeAt, storeEditBlock, navFromHome, fillCell, pasteGrid } from './lib.mjs'

const { browser, page } = await launch()
try {
  await openBlank(page, 10, 6, 2)
  await startPlace(page, '强调注脚')
  await placeAt(page, 0)
  // 内联版（与 debug-store 相同结构）
  const r1 = await page.evaluate(() => {
    const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('editor')
    const blk = store.current.blocks.find((b) => b.type === 'emphFooter')
    const ok = store.apply({ kind: 'updateBlock', blockId: blk.id, props: { text: 'BBB-内联文字' } })
    return 'inline apply=' + ok + ' text=' + store.current.blocks.find((b) => b.id === blk.id)?.props?.text
  })
  console.log('内联改:', r1)
  console.log('改后 dump:', await dump(page))
  console.log('lib 版改:', await storeEditBlock(page, { type: 'emphFooter' }, { text: 'AAA-注脚文字' }))
  console.log('lib 后 dump:', await dump(page))
  await navFromHome(page, 0, 0)
  await fillCell(page, '表名测试')
  console.log('填表名后:', await dump(page))
  await navFromHome(page, 1, 0)
  await pasteGrid(page, [['a', 'b', 'c', 'd', 'e', 'f']])
  console.log('粘贴后:', await dump(page))
} finally { await browser.close() }

async function dump(page) {
  return page.evaluate(() => {
    const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('editor')
    return JSON.stringify(store.current.blocks.map((b) => ({ t: b.type, text: b.props?.text })))
  })
}
console.log('DONE')
