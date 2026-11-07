// 表2：餐厅秋季菜单（pricing 改造：删合计行/删 4 列/插 6 行/2 组头块/注脚/KPI 季节副题）
import { launch, openTemplate, navFromHome, fillCell, pasteGrid, railOp, startPlace, placeAt, storeEditBlock, storeRemoveBlock, applyStyle, addKpi, exportAll, assertIncludes, canvas } from './lib.mjs'
import fs from 'node:fs'

const NAME = '餐厅秋季菜单'
const { browser, page, consoleErrors, pageErrors } = await launch()
try {
  await openTemplate(page, '价目清单')
  console.log('[1] pricing 打开:', await page.getByTestId('structure-summary').innerText())
  // 先移除预置分组块（否则粘贴区跨块被拒）
  console.log('[1.2] 移除预置块:', await storeRemoveBlock(page, {}))

  // 删合计行 R12，删列 C5/C3/C2/C0（倒序）
  await railOp(page, 'row', 12, 'remove')
  for (const c of [5, 3, 2, 0]) await railOp(page, 'col', c, 'remove')
  console.log('[2] 删合计+4列:', await page.getByTestId('structure-summary').innerText())

  // 插行：R5 后×4（推 g2 至 after-11），R11 后×2
  for (let i = 0; i < 4; i++) await railOp(page, 'row', 5, 'after')
  for (let i = 0; i < 2; i++) await railOp(page, 'row', 11, 'after')
  console.log('[3] 插6行后:', await page.getByTestId('structure-summary').innerText())

  // 列头 + 表名（readonly 格可编辑，实验室已验证）
  await navFromHome(page, 1, 0)
  await fillCell(page, '品名')
  await navFromHome(page, 1, 1)
  await fillCell(page, '价格（CNY）')
  await navFromHome(page, 0, 0)
  await fillCell(page, '秋季菜单 · AUTUMN MENU')
  console.log('[4] 表名/列头已改')

  // 粘贴 16 品项（R2 锚点，2 列；MAIN/DRINKS 组名并入首项首行——应用分组槽上限 2 的补偿）
  const items = [
    ['慢烤番茄与罗勒\nSLOW-ROASTED TOMATO, BASIL', '58'],
    ['冷切牛舌 · 柚子醋\nBEEF TONGUE, YUZU DRESSING', '78'],
    ['香煎带子 · 青豆泥\nSEARED SCALLOP, PEA PURÉE', '88'],
    ['时令沙拉\nSEASONAL GREENS', '48'],
    ['MAIN · 主菜\n炭烤羊排 · 迷迭香汁\nLAMB RACK, ROSEMARY JUS', '168'],
    ['黑松露野菌意面\nTRUFFLE MUSHROOM PASTA', '138'],
    ['香草烤鸡半只\nHERB ROASTED CHICKEN', '128'],
    ['海鲜烩饭\nSEAFOOD RISOTTO', '158'],
    ['慢炖牛颊肉\nBRAISED BEEF CHEEK', '178'],
    ['黄油煎鳕鱼\nPAN-SEARED COD, BROWN BUTTER', '158'],
    ['焦糖布丁\nCRÈME CARAMEL', '42'],
    ['开心果巴斯克\nPISTACHIO BASQUE', '48'],
    ['DRINKS · 饮品\n手冲单品\nPOUR-OVER, SINGLE ORIGIN', '38'],
    ['气泡柚子\nSPARKLING YUZU', '32'],
    ['云南晒红\nYUNNAN SUN-DRIED BLACK', '36'],
    ['季节果酒\nSEASONAL FRUIT WINE', '48'],
  ]
  // 分两段粘贴（R2-R11 前菜+主菜 10 行；R12-R17 甜点+饮品 6 行）——整段会跨 g2 槽行被拒
  await navFromHome(page, 2, 0)
  const head = await page.getByTestId('slot-headline').innerText().catch(() => '')
  console.log('[5] 粘贴锚点1 headline:', head)
  const pr1 = await pasteGrid(page, items.slice(0, 10))
  console.log('[6] 段1粘贴:', JSON.stringify(pr1))
  await navFromHome(page, 12, 0)
  const head2 = await page.getByTestId('slot-headline').innerText().catch(() => '')
  console.log('[6.1] 粘贴锚点2 headline:', head2)
  const pr2 = await pasteGrid(page, items.slice(10))
  console.log('[6.2] 段2粘贴:', JSON.stringify(pr2), '|', await page.getByTestId('structure-summary').innerText())

  // 分组标题行：g1=前菜、g2=甜点（g2 锚点已随插行平移至主菜后）
  await startPlace(page, '分组标题行')
  await placeAt(page, 0)
  await startPlace(page, '分组标题行')
  await placeAt(page, 1)
  console.log('[7] 两块已放:', await storeEditBlock(page, { slotId: 'gap-g1' }, { text: 'STARTERS · 前菜', styleTier: 1 }))
  console.log('[8] g2 改字:', await storeEditBlock(page, { slotId: 'gap-g2' }, { text: 'DESSERTS · 甜点', styleTier: 1 }))

  // 注脚（footer 槽空置，用 store 放置 emphFooter 再改字？footer 槽 UI 放置）
  const fh = await startPlace(page, '强调注脚')
  if (fh.length) {
    await placeAt(page, 0)
    console.log('[9] 注脚:', await storeEditBlock(page, { type: 'emphFooter' }, {
      text: '食材随季节调整，售罄见谅 · 午市套餐 98 元起（含前菜与主菜）· 现点现做出餐约 20 分钟 · 定价含税不另收服务费 · 菜品与价格仅作排版示意',
    }))
  }

  // 样式 + 列宽 + 行高紧凑
  await applyStyle(page, {
    primary: '#0B211C', headerText: '#FFFFFF', zebra: '#F1E9D8',
    emphasis: '#B4532A', border: '#D8CDB8', background: '#F6F0E3',
  }, [340, 140])
  await page.locator('[data-testid="group-style"] button', { hasText: '紧凑' }).first().click().catch(() => {})

  // KPI 季节副题
  await addKpi(page, [
    { label: '供应季', value: '9 月 – 11 月' },
    { label: '营业时间', value: '11:30 – 21:30' },
    { label: '午市套餐', value: '98', unit: '元起' },
    { label: '在售品项', value: '16' },
  ])

  await page.waitForTimeout(600)
  const { html, pngPath, htmlPath } = await exportAll(page, NAME)
  const okAll = assertIncludes(html, ['秋季菜单 · AUTUMN MENU', '品名', '价格（CNY）', 'STARTERS · 前菜', 'DESSERTS · 甜点', 'MAIN · 主菜', 'DRINKS · 饮品', '慢烤番茄与罗勒', '炭烤羊排', '¥178.00', '季节果酒', '98 元起', '#0b211c'], NAME)
  console.log('[产物] PNG', fs.statSync(pngPath).size, 'B | HTML', fs.statSync(htmlPath).size, 'B')
  console.log('[门禁] 断言', okAll ? 'PASS' : 'FAIL', '| console error:', consoleErrors.length, '| pageerror:', pageErrors.length)
} finally { await browser.close() }
console.log('BUILD2_DONE')
