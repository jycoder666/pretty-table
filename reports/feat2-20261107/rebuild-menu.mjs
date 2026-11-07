// 重建表1：餐厅秋季菜单 v2（2026-11-07 建表重排）
// 约束适配：应用硬上限「可见行=逻辑行+组锚点≤20」(LIMITS.maxRows)，任务原口径 表头2+组行4+品项16=22 超限不可达；
// v2 方案：levels=2（R0 合并标题行 + R1 列头）+ 14 品项行（焦糖布丁/开心果巴斯克 1 并行、云南晒红/季节果酒 1 并行，
// 16 品项与价格仍全部在表）+ 4 真分组行 = 插入期可见行恰好 20。v1（levels=1）已验证可行但 PNG 不渲染 <caption> 丢表名，故升级 v2。
// 表名同时走 caption-input（blank 无 captionSlot → displayName → 导出 <caption>），HTML 侧与旧导出一致（caption + 标题行双保险）。
import { launch, openBlank, navFromHome, fillCell, pasteGrid, startPlace, placeAt, storeEditBlock, applyStyle, addKpi, exportAll, assertIncludes } from '../tables-20261107/lib.mjs'
import fs from 'node:fs'

const NAME = '餐厅秋季菜单'

const GROUPS = [
  { aboveRow: 2, anchor: 1, text: 'STARTERS · 前菜', color: '#f7e3d2', label: '杏橙' },
  { aboveRow: 6, anchor: 5, text: 'MAIN · 主菜', color: '#d9ebdc', label: '豆绿' },
  { aboveRow: 12, anchor: 11, text: 'DESSERTS · 甜点', color: '#dce8f7', label: '雾蓝' },
  { aboveRow: 13, anchor: 12, text: 'DRINKS · 饮品', color: '#e9e1f5', label: '浅紫' },
]

// R2..R15 品项 14 行（16 品项，2 行各并 2 品）
const ROWS = [
  ['慢烤番茄与罗勒\nSLOW-ROASTED TOMATO, BASIL', '¥58'],
  ['冷切牛舌 · 柚子醋\nBEEF TONGUE, YUZU DRESSING', '¥78'],
  ['香煎带子 · 青豆泥\nSEARED SCALLOP, PEA PURÉE', '¥88'],
  ['时令沙拉\nSEASONAL GREENS', '¥48'],
  ['炭烤羊排 · 迷迭香汁\nLAMB RACK, ROSEMARY JUS', '¥168'],
  ['黑松露野菌意面\nTRUFFLE MUSHROOM PASTA', '¥138'],
  ['香草烤鸡半只\nHERB ROASTED CHICKEN', '¥128'],
  ['海鲜烩饭\nSEAFOOD RISOTTO', '¥158'],
  ['慢炖牛颊肉\nBRAISED BEEF CHEEK', '¥178'],
  ['黄油煎鳕鱼\nPAN-SEARED COD, BROWN BUTTER', '¥158'],
  ['焦糖布丁 · 开心果巴斯克\nCRÈME CARAMEL / PISTACHIO BASQUE', '¥42 / ¥48'],
  ['手冲单品\nPOUR-OVER, SINGLE ORIGIN', '¥38'],
  ['气泡柚子\nSPARKLING YUZU', '¥32'],
  ['云南晒红 · 季节果酒\nYUNNAN SUN-DRIED BLACK / SEASONAL FRUIT WINE', '¥36 / ¥48'],
]

const FOOTER_TEXT = '食材随季节调整，售罄见谅 · 午市套餐 98 元起（含前菜与主菜）· 现点现做出餐约 20 分钟 · 定价含税不另收服务费 · 菜品与价格仅作排版示意'

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
      merges: cur.layout.merges ?? [],
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
  // [1] 空白底稿 16 行 × 2 列 × 2 层表头（逻辑 16 = 表头 2 + 品项 14）
  await openBlank(page, 16, 2, 2)
  console.log('[1] blank 16x2 L2:', await page.getByTestId('structure-summary').innerText())
  const s0 = await storeInfo(page)
  console.log('[1] store:', JSON.stringify({ logical: s0.logical, headerLevels: s0.headerLevels, visible: s0.visible }))

  // [2] R0 合并表名（build3 同款流程：填字 → 重聚焦 → 扩选 → 合并）
  await page.getByTestId('group-head-structure').click()
  await page.waitForTimeout(400)
  await navRowChecked(page, 0, '表名C0')
  await fillCell(page, '秋季菜单 · AUTUMN MENU')
  await navRowChecked(page, 0, '合并扩选')
  await page.keyboard.press('Shift+ArrowRight')
  await page.waitForTimeout(150)
  await page.getByTestId('merge-btn').click()
  await page.waitForTimeout(400)
  const sMerge = await storeInfo(page)
  console.log('[2] R0 合并:', JSON.stringify(sMerge.merges))
  if (!sMerge.merges.length) throw new Error('R0 合并失败，如实中断')

  // [3] R1 列头：品名 | 价格（CNY）
  await navRowChecked(page, 1, '列头C0')
  await fillCell(page, '品名')
  await navRowChecked(page, 1, '列头C1')
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(150)
  await fillCell(page, '价格（CNY）')
  console.log('[3] 列头两格填入')

  // [4] 品项 14 行粘贴（锚 R2C0）
  await navRowChecked(page, 2, '粘贴锚点')
  const pr = await pasteGrid(page, ROWS)
  console.log('[4] 粘贴:', JSON.stringify(pr))

  // [5] 4 个真分组行（顺序关键：先插组行再放 footer；插入期可见行 16→20 恰好合规）
  for (const g of GROUPS) {
    await navRowChecked(page, g.aboveRow, `组行${g.text}`)
    const btn = page.getByTestId('group-add')
    if (await btn.isDisabled().catch(() => true)) {
      throw new Error(`[组行${g.text}] group-add 置灰（aboveRow=${g.aboveRow}），如实中断`)
    }
    await btn.click()
    await page.waitForTimeout(900)
    const s = await storeInfo(page)
    const last = s.groups.at(-1)
    const expectN = GROUPS.filter((x) => x.aboveRow <= g.aboveRow).length
    const ok = s.groups.length === expectN && last?.anchor === g.anchor
    console.log(`[5] 插入 ${g.text}: anchor=${last?.anchor}(期望 ${g.anchor}) visible=${s.visible} ${ok ? 'OK' : 'MISMATCH'}`)
    if (!ok) throw new Error(`组行 ${g.text} 锚点不符：${JSON.stringify(last)}`)
  }

  // [6] 组头文字与四色轮换（updateBlock 与预设按钮同款意图；apply 为不可变快照，回读以导出 HTML 为准）
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
    console.log(`[6] ${g.label} @after-${g.anchor}:`, r)
    if (!String(r).startsWith('ok')) throw new Error(`组头 ${g.text} 写入失败: ${r}`)
  }

  // [7] 注脚块（addBlock 无行数校验，组行之后放置）
  const fh = await startPlace(page, '强调注脚')
  if (!fh.length) throw new Error('强调注脚无放置槽，如实中断')
  await placeAt(page, 0)
  console.log('[7] 注脚:', await storeEditBlock(page, { type: 'emphFooter' }, { text: FOOTER_TEXT }))

  // [8] KPI 四张
  await addKpi(page, [
    { label: '供应季', value: '9 月 – 11 月' },
    { label: '营业时间', value: '11:30 – 21:30' },
    { label: '午市套餐', value: '98', unit: '元起' },
    { label: '在售品项', value: '16' },
  ])
  console.log('[8] KPI 4 张填入')

  // [9] 统一样式（表头 #0B211C 白字 + 暖色系，与既有导出同款）
  await applyStyle(page, {
    primary: '#0B211C', headerText: '#FFFFFF', zebra: '#F1E9D8',
    emphasis: '#B4532A', border: '#D8CDB8', background: '#F6F0E3',
  }, [430, 150])

  // [10] 表名 caption（displayName → 导出 <caption>；content 组默认展开，仅在收起时点开）
  const cap = page.getByTestId('caption-input')
  if (!(await cap.isVisible().catch(() => false))) {
    await page.getByTestId('group-head-content').click()
    await page.waitForTimeout(300)
  }
  await cap.fill('秋季菜单 · AUTUMN MENU')
  await cap.blur()
  await page.waitForTimeout(300)
  const s10 = await storeInfo(page)
  console.log('[10] caption 落库:', JSON.stringify({ displayName: s10.displayName, captionSlot: s10.captionSlot }))
  if (s10.displayName !== '秋季菜单 · AUTUMN MENU') throw new Error('displayName 未写入，如实中断')

  // [11] 终态核对 + 导出四件套
  const sF = await storeInfo(page)
  console.log('[11] 终态:', JSON.stringify({ logical: sF.logical, visible: sF.visible, anchors: sF.anchors, groups: sF.groups.length }))
  const { html, pngPath, htmlPath, tplCount } = await exportAll(page, NAME)
  okAll = assertIncludes(html, [
    '秋季菜单 · AUTUMN MENU', '品名', '价格（CNY）',
    'STARTERS · 前菜', 'MAIN · 主菜', 'DESSERTS · 甜点', 'DRINKS · 饮品',
    '慢烤番茄与罗勒', '炭烤羊排', '季节果酒', '焦糖布丁', '开心果巴斯克',
    '¥168', '¥58', '¥42 / ¥48', '¥38', '¥36 / ¥48',
    '食材随季节调整', '午市套餐 98 元起',
  ], NAME)
  const colorHits = GROUPS.filter((g) => new RegExp(g.color.replace('#', '#?'), 'i').test(html))
  console.log(`[11] 组头四色进 HTML: ${colorHits.length}/4 →`, colorHits.map((g) => g.label).join('/'))
  if (colorHits.length < 4) okAll = false
  console.log('[产物] PNG', fs.statSync(pngPath).size, 'B | HTML', fs.statSync(htmlPath).size, 'B | tpl键', tplCount)
  console.log('[门禁] 断言', okAll ? 'PASS' : 'FAIL', '| console error:', consoleErrors.length, '| pageerror:', pageErrors.length)
  if (consoleErrors.length) console.log('[console 切片]', JSON.stringify(consoleErrors.slice(0, 5)))
} finally {
  await browser.close()
}
console.log(okAll ? 'REBUILD_MENU_PASS' : 'REBUILD_MENU_FAIL')
