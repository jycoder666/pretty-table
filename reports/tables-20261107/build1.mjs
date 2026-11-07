// 表1：三年级2班课程表（blank 10 行×6 列·2 层表头 + 左栏标签块 + 注脚 + KPI 副题）
import { launch, openBlank, navFromHome, fillCell, pasteGrid, startPlace, placeAt, storeEditBlock, applyStyle, addKpi, exportAll, assertIncludes, exportJson, OUT, canvas } from './lib.mjs'
import fs from 'node:fs'

const NAME = '三年级2班课程表'
const { browser, page, consoleErrors, pageErrors } = await launch()
try {
  await openBlank(page, 10, 6, 2)
  console.log('[1] blank 10x6 L2 打开:', await page.getByTestId('structure-summary').innerText())

  // 空表阶段先放注脚块，文字经 store 填入（footer 行常在视口外，点击不可达）
  const fhits = await startPlace(page, '强调注脚')
  console.log('[1.5] 注脚槽数:', fhits.length)
  let footOk = '(未放)'
  if (fhits.length) {
    await placeAt(page, 0)
    footOk = await storeEditBlock(page, { type: 'emphFooter' }, {
      text: '注：上午四节、下午三节；午休 11:50–14:00。如需调课请联系年级组 · 示例样张：校名、班级与教师仅作排版示意',
    })
  }
  console.log('[1.6] 注脚编辑:', footOk)

  // R0 表名
  await navFromHome(page, 0, 0)
  await fillCell(page, '三年级 2 班 · 课程表')
  console.log('[2] R0 表名填入')

  // R1-R9 粘贴（9 行×6 列；R6 午休先只填 C0，稍后合并）
  const T = (s, t, r) => `${s}\n${t}\n${r}`
  const P = (n, time) => `第 ${n} 节\n${time}`
  const grid = [
    ['节次 / 星期', '周一', '周二', '周三', '周四', '周五'],
    [P(1, '08:20–09:00'), T('语文', '心老师 · 302', ''), T('数学', '李老师 · 302', ''), T('英语', '陈老师 · 302', ''), T('语文', '心老师 · 302', ''), T('数学', '李老师 · 302', '')],
    [P(2, '09:10–09:50'), T('数学', '李老师 · 302', ''), T('语文', '心老师 · 302', ''), T('科学', '刘老师 · 实验室', ''), T('体育', '赵老师 · 操场', ''), T('英语', '陈老师 · 302', '')],
    [P(3, '10:20–11:00'), T('英语', '陈老师 · 302', ''), T('科学', '刘老师 · 实验室', ''), T('语文', '心老师 · 302', ''), T('音乐', '孙老师 · 音乐室', ''), T('语文', '心老师 · 302', '')],
    [P(4, '11:10–11:50'), T('美术', '吴老师 · 美术室', ''), T('音乐', '孙老师 · 音乐室', ''), T('体育', '赵老师 · 操场', ''), T('信息技术', '郑老师 · 机房', ''), T('数学', '李老师 · 302', '')],
    ['午休 11:50–14:00 · 午饭午睡', '', '', '', '', ''],
    [P(5, '14:00–14:40'), T('音乐', '孙老师 · 音乐室', ''), T('科学', '刘老师 · 实验室', ''), T('数学', '李老师 · 302', ''), T('体育', '赵老师 · 操场', ''), T('体育', '赵老师 · 操场', '')],
    [P(6, '14:50–15:30'), T('英语', '陈老师 · 302', ''), T('美术', '吴老师 · 美术室', ''), T('音乐', '孙老师 · 音乐室', ''), T('自习', '心老师 · 302', ''), T('班会', '班主任 · 302', '')],
    [P(7, '15:40–16:20'), T('班会', '班主任 · 302', ''), T('自习', '李老师 · 302', ''), T('美术', '吴老师 · 美术室', ''), T('自习', '陈老师 · 302', ''), T('科学', '刘老师 · 实验室', '')],
  ]
  await navFromHome(page, 1, 0)
  await pasteGrid(page, grid)
  console.log('[3] 粘贴完成:', await page.getByTestId('structure-summary').innerText())

  // 合并 R6 午休行（先展开结构面板）
  await page.getByTestId('group-head-structure').click()
  await page.waitForTimeout(400)
  await navFromHome(page, 6, 0)
  for (let i = 0; i < 5; i++) { await page.keyboard.press('Shift+ArrowRight'); await page.waitForTimeout(100) }
  await page.getByTestId('merge-btn').click()
  await page.waitForTimeout(400)
  console.log('[4] R6 午休行合并尝试完成')

  // 左栏标签块：应用无 leftTag 文字编辑入口（放入即盖住首列槽文字），改用首列普通两行文字（已在粘贴数据中）
  console.log('[5] leftTag 弃用（应用限制），首列为普通两行文字格')

  // 表底注脚已在开头放置并填写

  // 样式：暖灰金底 + 奶油风 6 色 + 列宽
  await applyStyle(page, {
    primary: '#0B211C', headerText: '#FFFFFF', zebra: '#F1E9D8',
    emphasis: '#B4532A', border: '#D8CDB8', background: '#F6F0E3',
  }, [118, 140, 140, 140, 140, 140])

  // KPI 副题
  await addKpi(page, [
    { label: '学期', value: '2026 秋季' },
    { label: '学校', value: '阳光小学' },
    { label: '周次', value: '第 12 周' },
  ])

  // [6] 表名落 displayName（blank 无 captionSlot → setCaption 写 meta.displayName；HTML caption 与 JSON 同源）
  const capOk = await page.evaluate((t) => {
    const app = document.querySelector('#app')?.__vue_app__
    const st = app?.config.globalProperties?.$pinia?._s?.get('editor')
    if (!st) return false
    return st.apply({ kind: 'setCaption', text: t })
  }, '三年级 2 班 · 课程表')
  if (!capOk) throw new Error('setCaption 失败，如实中断')
  console.log('[6] displayName 落库: 三年级 2 班 · 课程表')

  await page.waitForTimeout(600)
  const { html, pngPath, htmlPath } = await exportAll(page, NAME)
  const okAll = assertIncludes(html, ['三年级 2 班 · 课程表', '周一', '周五', '美术室', '信息技术', '午休', '第 7 节', '阳光小学', '#0b211c', '#f6f0e3'], NAME)
  const pngBytes = fs.statSync(pngPath).size
  const htmlBytes = fs.statSync(htmlPath).size
  console.log(`[产物] PNG ${pngBytes} B | HTML ${htmlBytes} B`)
  console.log('[门禁] 断言', okAll ? 'PASS' : 'FAIL', '| console error:', consoleErrors.length, '| pageerror:', pageErrors.length)

  // [末] 模板 JSON 导出（跨设备同步）：新导出功能落 tables/
  const jsonPath = await exportJson(page, 'F:/pretty-table/tables/三年级2班课程表.json')
  console.log('[JSON] 落盘:', jsonPath, fs.statSync(jsonPath).size, 'B')
} finally {
  await browser.close()
}
console.log('BUILD1_DONE')
