// 表4：大理四天三晚行程（pricing 改造留 no/item/spec 三个 text 列 → 时段/安排/贴士；
// detail 模板表头固定且分组槽不足，改用 pricing——报告说明）
import { launch, openTemplate, navFromHome, fillCell, pasteGrid, railOp, startPlace, placeAt, storeEditBlock, applyStyle, addKpi, exportAll, assertIncludes } from './lib.mjs'
import fs from 'node:fs'

const NAME = '大理四天三晚行程'
const { browser, page, consoleErrors, pageErrors } = await launch()
try {
  await openTemplate(page, '价目清单')
  console.log('[1] pricing 打开:', await page.getByTestId('structure-summary').innerText())

  // 删合计行；删列 C5/C4/C3 留 [no(text), item(text), spec(text)]
  await railOp(page, 'row', 12, 'remove')
  for (const c of [5, 4, 3]) await railOp(page, 'col', c, 'remove')
  console.log('[2] 删行删列:', await page.getByTestId('structure-summary').innerText())

  // 插 5 行：R6 前×2（g2: 7→9）+ R12 前×3（g2 不动）
  for (let i = 0; i < 2; i++) await railOp(page, 'row', 5, 'after')
  for (let i = 0; i < 3; i++) await railOp(page, 'row', 11, 'after')
  console.log('[3] 插行后:', await page.getByTestId('structure-summary').innerText())

  // 表名 + 列头
  await navFromHome(page, 0, 0)
  await fillCell(page, '大理四天三晚 · TRAVEL ITINERARY')
  await navFromHome(page, 1, 0)
  await fillCell(page, '时段')
  await navFromHome(page, 1, 1)
  await fillCell(page, '安排')
  await navFromHome(page, 1, 2)
  await fillCell(page, '贴士')
  console.log('[4] 表名列头已改')

  // 粘贴两段：R2-R9（D1 4 + D2 4）与 R10-R16（D3 4 + D4 3）
  const seg1 = [
    ['09:40', '落地 · 取车', '机场到古城约 40 分钟'],
    ['12:00', '古城午餐', '人民路 · 本地菜'],
    ['15:00', '崇圣寺三塔', '倒影公园 · 日落侧光最好'],
    ['19:30', '人民路夜逛', '小吃与手作小摊'],
    ['08:30', 'D2 · 环洱海 · 约 130km ▸ 才村码头', '看洱海日出，风大要外套'],
    ['11:00', '喜洲古镇', '严家大院与喜洲粑粑'],
    ['14:30', '海舌公园', '湿地栈道，步行 40 分钟'],
    ['18:30', '小普陀 · 落日', '提前 40 分钟占位'],
  ]
  const seg2 = [
    ['09:00', '感通索道', '上行 8 分钟，排队较长'],
    ['12:30', '寂照庵素斋', '11:30 开始派号'],
    ['15:30', '玉带云游路', '平路，适合走'],
    ['20:00', '客栈露台观星', '远离月光更清楚'],
    ['09:00', 'D4 · 返程 ▸ 古城早市', '鲜花饼与菌子汤；提前 2 小时到机场'],
    ['11:30', '退房 · 还车', '检查行李与租车油量'],
    ['14:20', '机场返程', '预计 18:05 落地'],
  ]
  await navFromHome(page, 2, 0)
  const p1 = await pasteGrid(page, seg1)
  await navFromHome(page, 10, 0)
  const p2 = await pasteGrid(page, seg2)
  console.log('[5] 两段粘贴:', JSON.stringify(p1), JSON.stringify(p2), '|', await page.getByTestId('structure-summary').innerText())

  // 分组标题行：g1=D1（after-1）、g2=D3（插行后 after-9）
  await startPlace(page, '分组标题行')
  await placeAt(page, 0)
  await startPlace(page, '分组标题行')
  await placeAt(page, 1)
  console.log('[6] g1:', await storeEditBlock(page, { slotId: 'gap-g1' }, { text: 'D1 · 10.02 周四 · 入住古城客栈，先适应海拔', styleTier: 1 }))
  console.log('[7] g2:', await storeEditBlock(page, { slotId: 'gap-g2' }, { text: 'D3 · 10.04 周六 · 苍山（山上比古城低 8–10℃）', styleTier: 1 }))

  // 注脚（BUDGET + 贴士）
  const fh = await startPlace(page, '强调注脚')
  if (fh.length) {
    await placeAt(page, 0)
    console.log('[8] 注脚:', await storeEditBlock(page, { type: 'emphFooter' }, {
      text: 'BUDGET 合计约 5,250 元/两人（往返机票 2,100 + 住宿 3 晚 1,950 + 餐食与门票 1,200）· 出行提示：防晒霜与帽子、薄外套、保温杯与少量现金、相机备用电池 · 示例样张：行程、时间与价格仅作示意',
    }))
  }

  // 样式 + 列宽
  await applyStyle(page, {
    primary: '#0B211C', headerText: '#FFFFFF', zebra: '#F1E9D8',
    emphasis: '#B4532A', border: '#D8CDB8', background: '#F6F0E3',
  }, [90, 320, 330])

  // KPI
  await addKpi(page, [
    { label: '行程', value: '4 天 3 晚' },
    { label: '方式', value: '两人自驾' },
    { label: '往返里程', value: '约 1,860', unit: 'km' },
    { label: '预算合计', value: '5,250', unit: '元/两人' },
  ])

  await page.waitForTimeout(600)
  const { html, pngPath, htmlPath } = await exportAll(page, NAME)
  const okAll = assertIncludes(html, ['大理四天三晚 · TRAVEL ITINERARY', 'D1 · 10.02 周四', 'D3 · 10.04 周六 · 苍山', 'D2 · 环洱海', 'D4 · 返程', '落地 · 取车', '寂照庵素斋', '提前 40 分钟占位', '5,250', '防晒霜与帽子', '18:05', '#0b211c'], NAME)
  console.log('[产物] PNG', fs.statSync(pngPath).size, 'B | HTML', fs.statSync(htmlPath).size, 'B')
  console.log('[门禁] 断言', okAll ? 'PASS' : 'FAIL', '| console error:', consoleErrors.length, '| pageerror:', pageErrors.length)
} finally { await browser.close() }
console.log('BUILD4_DONE')
