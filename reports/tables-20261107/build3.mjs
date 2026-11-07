// 表3：产品改版排期（blank 12 行×5 列·2 层表头；matrix 数据槽为 mark/percent 不收文字，故用 blank）
import { launch, openBlank, navFromHome, fillCell, pasteGrid, storeEditBlock, applyStyle, addKpi, exportAll, assertIncludes, cellEm, startPlace, placeAt, canvas } from './lib.mjs'
import fs from 'node:fs'

const NAME = '产品改版排期'
const { browser, page, consoleErrors, pageErrors } = await launch()
try {
  await openBlank(page, 12, 5, 2)
  console.log('[1] blank 12x5 L2:', await page.getByTestId('structure-summary').innerText())

  // 表底注脚（先放置，store 填字）
  const fh = await startPlace(page, '强调注脚')
  if (fh.length) {
    await placeAt(page, 0)
    console.log('[2] 注脚:', await storeEditBlock(page, { type: 'emphFooter' }, {
      text: '注：工期按自然日，节假日已扣除 · 示例样张：项目名、任务与工期仅作排版示意',
    }))
  }

  // R0 合并表名
  await page.getByTestId('group-head-structure').click()
  await page.waitForTimeout(400)
  await navFromHome(page, 0, 0)
  await fillCell(page, '产品改版项目排期 · 2026 Q3-Q4')
  // 重新聚焦画布后扩选合并（fillCell 的 blur 会让键盘选区失效）
  await navFromHome(page, 0, 0)
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Shift+ArrowRight'); await page.waitForTimeout(100) }
  await page.getByTestId('merge-btn').click()
  await page.waitForTimeout(400)
  console.log('[3] 表名合并填入')

  // 数据粘贴 R1-R11（列头 + 10 任务；周期为推断值——原图甘特条无文字）
  const rows = [
    ['任务 TASK', '周期', '里程碑', '负责角色', '关键产出'],
    ['需求调研 · 用户访谈', '5/1 – 5/12', '', '产品', '14 场用户访谈'],
    ['竞品分析与功能清单', '5/13 – 5/26', '', '产品', '输出 68 条需求'],
    ['交互原型与视觉稿', '5/27 – 6/16', '', '设计', '32 个界面'],
    ['技术方案与架构评审', '6/17 – 6/30', 'M1', '技术', '评审通过 · M1'],
    ['核心模块开发', '7/1 – 8/11', '', '研发 · 前端 4 人 + 后端 3 人', '核心功能交付'],
    ['后台与数据看板', '7/15 – 8/18', '', '数据 · 3 人', '看板上线'],
    ['联调与性能优化', '8/19 – 9/8', '', '全员', '首屏 1.2 秒内'],
    ['全量测试与缺陷修复', '9/9 – 9/28', 'M2', '测试', '回归 3 轮 · M2'],
    ['灰度上线', '9/29 – 10/12', '', '运维', '灰度 2 批'],
    ['复盘与下一期规划', '10/13 – 10/30', '', '产品', '输出待办单'],
  ]
  await navFromHome(page, 1, 0)
  const pr = await pasteGrid(page, rows)
  console.log('[4] 粘贴:', JSON.stringify(pr), '|', await page.getByTestId('structure-summary').innerText())

  // 里程碑强调：R5C2 M1、R9C2 M2（加粗+红字）
  await navFromHome(page, 5, 2)
  await cellEm(page, 'bold')
  await cellEm(page, 'red')
  await navFromHome(page, 9, 2)
  await cellEm(page, 'bold')
  await cellEm(page, 'red')
  // 里程碑产出格同样强调（R5C4、R9C4）
  await navFromHome(page, 5, 4)
  await cellEm(page, 'bold')
  await navFromHome(page, 9, 4)
  await cellEm(page, 'bold')
  console.log('[5] 里程碑强调完成')

  // 样式 + 列宽
  await applyStyle(page, {
    primary: '#0B211C', headerText: '#FFFFFF', zebra: '#F1E9D8',
    emphasis: '#B4532A', border: '#D8CDB8', background: '#F6F0E3',
  }, [225, 135, 90, 180, 185])

  // KPI 副题
  await addKpi(page, [
    { label: '周期', value: '5/1 – 10/30' },
    { label: '总工期', value: '26', unit: '周' },
    { label: '参与', value: '产品组 12', unit: '人' },
  ])

  await page.waitForTimeout(600)
  const { html, pngPath, htmlPath } = await exportAll(page, NAME)
  const okAll = assertIncludes(html, ['产品改版项目排期', '需求调研 · 用户访谈', '复盘与下一期规划', 'M1', 'M2', '首屏 1.2 秒内', '回归 3 轮', '灰度 2 批', '工期按自然日', '26', '#0b211c'], NAME)
  console.log('[产物] PNG', fs.statSync(pngPath).size, 'B | HTML', fs.statSync(htmlPath).size, 'B')
  console.log('[门禁] 断言', okAll ? 'PASS' : 'FAIL', '| console error:', consoleErrors.length, '| pageerror:', pageErrors.length)
} finally { await browser.close() }
console.log('BUILD3_DONE')
