// 重建表2：大理四天三晚行程（2026-11-07 建表重排）
// 约束适配：应用硬上限「可见行=逻辑行+组锚点≤20」(LIMITS.maxRows)；
// 行程 15 个时段行不宜并行李（每行=独立时间安排），故 levels=1 单表头行 + 15 行 + 4 组行 = 插入期恰好 20。
// 代价（如实登记）：levels=2 的 R0 标题行放不下（21 超限），表名仅经 caption-input → displayName → HTML <caption>；
// PNG 渲染器不画 <caption>（png.ts 无 caption 逻辑），PNG 侧无表名文字——旧行数预算（表头2）在本应用内不可达。
// D2/D4 组头文字系从旧导出合并损坏态 + OCR（img7.txt）复原：D2 环洱海约130km / D4 返程。
import { launch, openBlank, navFromHome, fillCell, pasteGrid, startPlace, placeAt, storeEditBlock, applyStyle, addKpi, exportAll, assertIncludes, exportJson } from '../tables-20261107/lib.mjs'
import fs from 'node:fs'

const NAME = '大理四天三晚行程'

const GROUPS = [
  { aboveRow: 1, anchor: 0, text: 'D1 · 10.02 周四 · 入住古城客栈，先适应海拔', color: '#f7e3d2', label: '杏橙' },
  { aboveRow: 5, anchor: 4, text: 'D2 · 10.03 周五 · 环洱海 · 约 130km', color: '#d9ebdc', label: '豆绿' },
  { aboveRow: 9, anchor: 8, text: 'D3 · 10.04 周六 · 苍山（山上比古城低 8–10℃）', color: '#dce8f7', label: '雾蓝' },
  { aboveRow: 13, anchor: 12, text: 'D4 · 10.05 周日 · 返程', color: '#e9e1f5', label: '浅紫' },
]

// R0 表头（levels=1）由 fillCell 填；R1..R15 时段 15 行粘贴
const ROWS = [
  ['09:40', '落地 · 取车', '机场到古城约 40 分钟'],
  ['12:00', '古城午餐', '人民路 · 本地菜'],
  ['15:00', '崇圣寺三塔', '倒影公园 · 日落侧光最好'],
  ['19:30', '人民路夜逛', '小吃与手作小摊'],
  ['08:30', '才村码头', '看洱海日出，风大要外套'],
  ['11:00', '喜洲古镇', '严家大院与喜洲粑粑'],
  ['14:30', '海舌公园', '湿地栈道，步行 40 分钟'],
  ['18:30', '小普陀 · 落日', '提前 40 分钟占位'],
  ['09:00', '感通索道', '上行 8 分钟，排队较长'],
  ['12:30', '寂照庵素斋', '11:30 开始派号'],
  ['15:30', '玉带云游路', '平路，适合慢走'],
  ['20:00', '客栈露台观星', '远离月光更清楚'],
  ['09:00', '古城早市', '鲜花饼与菌子汤 · 提前 2 小时到机场'],
  ['11:30', '退房 · 还车', '检查行李与租车油量'],
  ['14:20', '机场返程', '预计 18:05 落地'],
]

const FOOTER_TEXT = 'BUDGET 合计约 5,250 元/两人（往返机票 2,100 + 住宿 3 晚 1,950 + 餐食与门票 1,200）· 出行提示：防晒霜与帽子、薄外套、保温杯与少量现金、相机备用电池 · 示例样张：行程、时间与价格仅作示意'

function storeInfo(page) {
  return page.evaluate(() => {
    const app = document.querySelector('#app')?.__vue_app__
    const st = app?.config.globalProperties?.$pinia?._s?.get('editor')
    const cur = st?.current
    if (!cur) return null
    const anchorOf = (b) => {
      const def = cur.layout.blockSlots.find((s) => s.id === b.slotId)
      const m = /^after-(\d+)$/.exec(def?.rowHint ?? '')
      return m ? Number(m[1]) : null
    }
    const anchors = new Set(cur.blocks.map((b) => anchorOf(b)).filter((a) => a !== null))
    const logical = cur.layout.slotGrid?.length ?? cur.layout.rowCount
    return {
      logical,
      headerLevels: cur.layout.headerLevels ?? 1,
      visible: logical + anchors.size,
      anchors: [...anchors].sort((a, b) => a - b),
      groups: cur.blocks
        .filter((b) => b.type === 'groupHeader')
        .map((b) => ({ anchor: anchorOf(b), text: b.props?.text, color: b.props?.color })),
      selection: st.selectionRange?.start ?? null,
      displayName: cur.meta?.displayName ?? '',
      captionSlot: cur.layout.captionSlot ?? null,
    }
  })
}

async function navRowChecked(page, row, tag) {
  await navFromHome(page, row, 0)
  let sel = (await storeInfo(page))?.selection
  if (sel !== null && sel[0] !== row) {
    const delta = row - sel[0]
    for (let i = 0; i < Math.abs(delta); i++) {
      await page.keyboard.press(delta > 0 ? 'ArrowDown' : 'ArrowUp')
      await page.waitForTimeout(90)
    }
    sel = (await storeInfo(page))?.selection
  }
  if (sel === null || sel[0] !== row) {
    throw new Error(`[${tag}] 选行失败：目标 ${row}，实际 ${JSON.stringify(sel)}（如实中断，不伪造）`)
  }
  return sel
}

const { browser, page, consoleErrors, pageErrors } = await launch()
let okAll = false
try {
  // [1] 空白底稿 16 行 × 3 列 × 1 层表头（逻辑 16 = 表头 1 + 时段 15）
  await openBlank(page, 16, 3, 1)
  console.log('[1] blank 16x3 L1:', await page.getByTestId('structure-summary').innerText())
  const s0 = await storeInfo(page)
  console.log('[1] store:', JSON.stringify({ logical: s0.logical, headerLevels: s0.headerLevels, visible: s0.visible }))

  // [2] 表头行（R0）：时段 | 安排 | 贴士
  await navRowChecked(page, 0, '表头C0')
  await fillCell(page, '时段')
  await navRowChecked(page, 0, '表头C1')
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(150)
  await fillCell(page, '安排')
  await navRowChecked(page, 0, '表头C2')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(150)
  await fillCell(page, '贴士')
  console.log('[2] 表头三格填入')

  // [3] 时段 15 行粘贴（锚 R1C0）
  await navRowChecked(page, 1, '粘贴锚点')
  const pr = await pasteGrid(page, ROWS)
  console.log('[3] 粘贴:', JSON.stringify(pr))

  // [4] 4 个真分组行 D1~D4（先组行后 footer，避开 20 可见行上限）
  await page.getByTestId('group-head-structure').click()
  await page.waitForTimeout(400)
  for (const g of GROUPS) {
    await navRowChecked(page, g.aboveRow, `组行${g.label}`)
    const btn = page.getByTestId('group-add')
    if (await btn.isDisabled().catch(() => true)) {
      throw new Error(`[组行${g.label}] group-add 置灰（aboveRow=${g.aboveRow}），如实中断`)
    }
    await btn.click()
    await page.waitForTimeout(900)
    const s = await storeInfo(page)
    const last = s.groups.at(-1)
    const expectN = GROUPS.filter((x) => x.aboveRow <= g.aboveRow).length
    const ok = s.groups.length === expectN && last?.anchor === g.anchor
    console.log(`[4] 插入 ${g.label}: anchor=${last?.anchor}(期望 ${g.anchor}) visible=${s.visible} ${ok ? 'OK' : 'MISMATCH'}`)
    if (!ok) throw new Error(`组行 ${g.label} 锚点不符：${JSON.stringify(last)}`)
  }

  // [5] 组头文字与四色轮换（updateBlock 与预设按钮同款意图）
  for (const g of GROUPS) {
    const r = await page.evaluate(({ anchor, text, color }) => {
      const app = document.querySelector('#app')?.__vue_app__
      const st = app?.config.globalProperties?.$pinia?._s?.get('editor')
      const cur = st?.current
      if (!cur) return 'no-store'
      const b = cur.blocks.find((x) => {
        if (x.type !== 'groupHeader') return false
        const def = cur.layout.blockSlots.find((s) => s.id === x.slotId)
        const m = /^after-(\d+)$/.exec(def?.rowHint ?? '')
        return m && Number(m[1]) === anchor
      })
      if (!b) return 'no-block@' + anchor
      const ok = st.apply({ kind: 'updateBlock', blockId: b.id, props: { text, color } })
      const fresh = st.current.blocks.find((x) => x.id === b.id)?.props
      return ok ? `ok|${fresh?.text}|${fresh?.color}` : 'apply-false'
    }, { anchor: g.anchor, text: g.text, color: g.color })
    console.log(`[5] ${g.label} @after-${g.anchor}:`, r)
    if (!String(r).startsWith('ok')) throw new Error(`组头 D${g.anchor} 写入失败: ${r}`)
  }

  // [6] 注脚块（BUDGET + 出行贴士）
  const fh = await startPlace(page, '强调注脚')
  if (!fh.length) throw new Error('强调注脚无放置槽，如实中断')
  await placeAt(page, 0)
  console.log('[6] 注脚:', await storeEditBlock(page, { type: 'emphFooter' }, { text: FOOTER_TEXT }))

  // [7] KPI 四张
  await addKpi(page, [
    { label: '行程', value: '4 天 3 晚' },
    { label: '方式', value: '两人自驾' },
    { label: '往返里程', value: '约 1,860', unit: 'km' },
    { label: '预算合计', value: '5,250', unit: '元/两人' },
  ])
  console.log('[7] KPI 4 张填入')

  // [8] 统一样式（同款暖色系）
  await applyStyle(page, {
    primary: '#0B211C', headerText: '#FFFFFF', zebra: '#F1E9D8',
    emphasis: '#B4532A', border: '#D8CDB8', background: '#F6F0E3',
  }, [110, 190, 330])

  // [9] 表名 caption（displayName → 导出 <caption>）
  const cap = page.getByTestId('caption-input')
  if (!(await cap.isVisible().catch(() => false))) {
    await page.getByTestId('group-head-content').click()
    await page.waitForTimeout(300)
  }
  await cap.fill('大理四天三晚 · TRAVEL ITINERARY')
  await cap.blur()
  await page.waitForTimeout(300)
  const s9 = await storeInfo(page)
  console.log('[9] caption 落库:', JSON.stringify({ displayName: s9.displayName, captionSlot: s9.captionSlot }))
  if (s9.displayName !== '大理四天三晚 · TRAVEL ITINERARY') throw new Error('displayName 未写入，如实中断')

  // [10] 终态核对 + 导出四件套
  const sF = await storeInfo(page)
  console.log('[10] 终态:', JSON.stringify({ logical: sF.logical, visible: sF.visible, anchors: sF.anchors, groups: sF.groups.length }))
  const { html, pngPath, htmlPath, tplCount } = await exportAll(page, NAME)
  okAll = assertIncludes(html, [
    '大理四天三晚 · TRAVEL ITINERARY', '时段', '安排', '贴士',
    'D1 · 10.02 周四', 'D2 · 10.03 周五', 'D3 · 10.04 周六', 'D4 · 10.05 周日',
    '环洱海', '崇圣寺三塔', '寂照庵素斋', '古城早市', '客栈露台观星',
    'BUDGET', '5,250', '防晒霜与帽子', '预计 18:05 落地',
  ], NAME)
  const colorHits = GROUPS.filter((g) => new RegExp(g.color.replace('#', '#?'), 'i').test(html))
  console.log(`[10] 组头四色进 HTML: ${colorHits.length}/4 →`, colorHits.map((g) => g.label).join('/'))
  if (colorHits.length < 4) okAll = false
  console.log('[产物] PNG', fs.statSync(pngPath).size, 'B | HTML', fs.statSync(htmlPath).size, 'B | tpl键', tplCount)
  console.log('[门禁] 断言', okAll ? 'PASS' : 'FAIL', '| console error:', consoleErrors.length, '| pageerror:', pageErrors.length)
  if (consoleErrors.length) console.log('[console 切片]', JSON.stringify(consoleErrors.slice(0, 5)))

  // [11] 模板 JSON 导出（跨设备同步）：新导出功能落 tables/
  const jsonPath = await exportJson(page, 'F:/pretty-table/tables/大理四天三晚行程.json')
  console.log('[11] JSON 落盘:', jsonPath, fs.statSync(jsonPath).size, 'B')
} finally {
  await browser.close()
}
console.log(okAll ? 'REBUILD_DALI_PASS' : 'REBUILD_DALI_FAIL')
