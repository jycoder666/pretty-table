import { expect, test } from '@playwright/test'
import { buildVisualRows, colWidthAt, type TemplateInstance } from '../../src/core/index'
import {
  cancelPaste,
  clickRailItem,
  clickSlot,
  confirmPaste,
  downloadPng,
  expectStructural,
  exportedHtml,
  grantClipboardIfChromium,
  openExportDrawer,
  openPreset,
  openRailMenu,
  pasteBarText,
  pasteClipboard,
  pngSize,
  presetOf,
  slotVisualPos,
  structureSummary,
} from './helpers'

/**
 * T05 验收 · TC-PT-095（增量 PRD §6 UX-S01～S10）· 编辑台结构操作与轻量布局升级
 *
 * 断言口径（增量 PRD §6 逐条判据）：
 *  S01 点击第 3 行轨道 → `+`：第 4 行插入空行且被选中；原内容相对顺序不变；Toast 说明位置；一步撤销恢复
 *  S02 点击第 2 列轨道 → 菜单「在前插入」：新列位于原第 2 列之前；首个表头格可立即编辑
 *  S03 删除空行：不弹窗；删除后选择相邻行；Toast 带「撤销」，撤销后完全复原
 *  S04 删除含内容/区块/合并区的行：确认框准确列出三计数；取消无变化；确认后 Toast 一致
 *  S05 最低结构：最后内容行/最后一列禁删并说明原因，不存在删成空壳的路径
 *  S06 移动带合并区的行/列：合法时内容与选择一同移动一步撤销；打散合并区直接禁用并说明
 *  S07 横滚/列宽后轨道贴合真实格子（渲染核几何，非固定估算）；叠加层锚点同源
 *  S08 粘贴预览期：轨道与键盘结构动作统一禁用；确认/取消后恢复
 *  S09 Shift+Space / Ctrl+Space / Shift+F10 / ContextMenu：键盘全链路，焦点可归还，Esc 退出
 *  S10 结构调整后导出、刷新、另存模板往返一致；轨道/描边不入导出物
 *
 * 工程约定：结构菜单项 menu-{row|col}-{before|after|remove|prev|next}；
 * 结构选择同步点 host 属性 data-pt-structural（"row:3"/"col:2"/""）；
 * 右栏摘要 structure-summary（「N 行 × M 列 · K 层表头」，模型侧证据）。
 * 引擎范围：S10 依赖剪贴板读回（chromium-only，与 tc093 同口径）；其余双引擎。
 */

const CLIPBOARD_ONLY = '剪贴板读回仅 chromium（WebKit 版无该权限项）'
const TSV_3X4 = 'R1C1\tR1C2\tR1C3\tR1C4\nR2C1\tR2C2\tR2C3\tR2C4\nR3C1\tR3C2\tR3C3\tR3C4'

test.beforeEach(async ({ context, browserName }) => {
  await grantClipboardIfChromium(context, browserName)
})

/** 格中心（内容坐标；未横滚时与容器坐标同源） */
function cellCenter(inst: TemplateInstance, slotId: string): { x: number; y: number } {
  const { row, col } = slotVisualPos(inst, slotId)
  const { rowHeights } = buildVisualRows(inst)
  let x = 0
  for (let c = 0; c < col; c++) x += colWidthAt(inst, c)
  let y = 0
  for (let r = 0; r < row; r++) y += rowHeights[r] ?? 36
  return { x: x + colWidthAt(inst, col) / 2, y: y + (rowHeights[row] ?? 36) / 2 }
}

/** 框选：从 from 格中心拖到 to 格中心（位移 >4px 才进入拖选） */
async function dragSelect(
  page: import('@playwright/test').Page,
  inst: TemplateInstance,
  fromSlot: string,
  toSlot: string,
): Promise<void> {
  const box = (await page.locator('.preview-host canvas').first().boundingBox())!
  const a = cellCenter(inst, fromSlot)
  const b = cellCenter(inst, toSlot)
  await page.mouse.move(box.x + a.x, box.y + a.y)
  await page.mouse.down()
  await page.mouse.move(box.x + (a.x + b.x) / 2, box.y + (a.y + b.y) / 2, { steps: 3 })
  await page.mouse.move(box.x + b.x, box.y + b.y, { steps: 3 })
  await page.mouse.up()
  await page.waitForTimeout(150)
}

/** 拖某列右缘改列宽（VTable 热区判给左侧列；与 tc094 同源） */
async function dragBoundary(
  page: import('@playwright/test').Page,
  inst: TemplateInstance,
  leftCol: number,
  dx: number,
): Promise<void> {
  const box = (await page.locator('.preview-host canvas').first().boundingBox())!
  let x = 0
  for (let c = 0; c <= leftCol; c++) x += colWidthAt(inst, c)
  const { row } = slotVisualPos(inst, 'row.3.val.b')
  const { rowHeights } = buildVisualRows(inst)
  let y = 0
  for (let r = 0; r < row; r++) y += rowHeights[r] ?? 36
  const py = box.y + y + (rowHeights[row] ?? 36) / 2
  await page.mouse.move(box.x + x, py)
  await page.waitForTimeout(80)
  await page.mouse.down()
  await page.mouse.move(box.x + x + dx / 2, py, { steps: 4 })
  await page.mouse.move(box.x + x + dx, py, { steps: 4 })
  await page.waitForTimeout(150)
  await page.mouse.up()
  await page.waitForTimeout(300)
}

/** Toast 文案（.pt-toast-msg：带撤销按钮的 Toast 文本内容含按钮文案，须只取 msg 段） */
function toastMsg(page: import('@playwright/test').Page) {
  return page.locator('.pt-toast-msg')
}

test.describe('UX-S01 · 行轨道选择 + `+` 后插（就近插入）', () => {
  test('点第 3 行轨道 → +：第 4 行插入空行且被选中、顺序不变、一步撤销', async ({ page }) => {
    await openPreset(page, '多列对比表')
    await clickRailItem(page, 'row', 2)
    // 整行浅色高亮 + 行轨道高亮（先选中，再行动）
    await expect(page.locator('.structural-cell').first()).toBeVisible()
    await expect(page.getByTestId('rail-row-2')).toHaveClass(/on/)

    await page.getByTestId('rail-row-plus-2').click()
    await expect(toastMsg(page)).toHaveText('已在第 4 行后插入一行')
    // 插入后落入单元格选择（新行第一个可编辑格），结构选择清空
    await expectStructural(page, '')
    await expect(page.locator('.preview-host')).not.toHaveAttribute('data-pt-selected-slot', '')
    await expect(structureSummary(page)).toHaveText('11 行 × 4 列 · 2 层表头')

    // 原内容相对顺序不变：新行 [3,0] 下移一步 = 原 R3 的标签格（槽位 id 稳定，位置随行下移）
    await page.locator('[data-testid="preview-canvas"]').focus()
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('.preview-host')).toHaveAttribute('data-pt-selected-slot', 'row.3.label')

    // 一步撤销完全恢复
    await page.keyboard.press('Control+z')
    await expect(structureSummary(page)).toHaveText('10 行 × 4 列 · 2 层表头')
  })
})

test.describe('UX-S02 · 列轨道选择 + 菜单「在前插入」', () => {
  test('点 B 列轨道 → 菜单前插：新列在原第 2 列之前、首表头格立即选中、一步撤销', async ({
    page,
  }) => {
    await openPreset(page, '多列对比表')
    await clickRailItem(page, 'col', 1)
    await expect(page.locator('.structural-cell').first()).toBeVisible()

    await openRailMenu(page, 'col', 1)
    await page.getByTestId('menu-col-before').click()
    await expect(toastMsg(page)).toHaveText('已在第 2 列前插入一列')
    await expectStructural(page, '')
    // 新列第一个表头格被选中（右栏面板跟着选中槽，可立即编辑）
    await expect(page.getByTestId('slot-headline')).toBeVisible()
    await expect(structureSummary(page)).toHaveText('10 行 × 5 列 · 2 层表头')

    await page.keyboard.press('Control+z')
    await expect(structureSummary(page)).toHaveText('10 行 × 4 列 · 2 层表头')
  })
})

test.describe('UX-S03 · 空行删除：即删 + 撤销 Toast', () => {
  test('空行删不弹窗、选择相邻行、Toast 撤销一键复原', async ({ page }) => {
    await openPreset(page, '新建空白表')
    await clickRailItem(page, 'row', 2)
    await openRailMenu(page, 'row', 2)
    await page.getByTestId('menu-row-remove').click()

    // 不弹窗
    await expect(page.getByTestId('confirm-dialog')).toHaveCount(0)
    await expect(toastMsg(page)).toHaveText('已删除第 3 行')
    // Toast 带「撤销」动作
    await expect(page.getByTestId('toast-action')).toHaveText('撤销')
    // 删除后选择同轴相邻行
    await expectStructural(page, 'row:2')
    await expect(structureSummary(page)).toHaveText('4 行 × 4 列 · 1 层表头')

    // 一键撤销 → 完全复原
    await page.getByTestId('toast-action').click()
    await expect(structureSummary(page)).toHaveText('5 行 × 4 列 · 1 层表头')
  })
})

test.describe('UX-S04 · 含内容/区块/合并区的行删除：确认摘要准确', () => {
  test('矩阵第 7 行（5 格内容 + 1 合并区 + 1 区块）：取消无变化、确认后 Toast 一致', async ({
    page,
  }) => {
    await openPreset(page, '功能矩阵表')
    const inst = presetOf('matrix-v1')

    // 造一个单行合并区（R6 C1–C2 符号格），凑齐「内容+合并区+区块」三计数
    await dragSelect(page, inst, 'feat.5.a', 'feat.5.b')
    await page.getByTestId('selection-merge').click()
    await expect(toastMsg(page)).toHaveText('已合并（清除了 1 格内容）')

    await clickRailItem(page, 'row', 6)
    await openRailMenu(page, 'row', 6)
    await page.getByTestId('menu-row-remove').click()

    // 确认框标题明确到「删除第 7 行」，摘要三计数准确（label + 5 符号格并 2 → 5 格）
    // 注意：PropertyPanel 与 EditorPage 各挂了一个 ConfirmDialog（存量重复渲染），取 DOM 靠后者（视觉置顶）
    await expect(page.getByTestId('confirm-title').last()).toHaveText('删除第 7 行')
    const msg = page.getByTestId('confirm-message').last()
    await expect(msg).toContainText('5 格内容')
    await expect(msg).toContainText('1 处合并区')
    await expect(msg).toContainText('1 个区块')

    // 取消：无任何变化
    await page.getByTestId('confirm-cancel').last().click()
    await expect(structureSummary(page)).toHaveText('11 行 × 6 列 · 2 层表头')
    await expectStructural(page, 'row:6')
    await expect(page.locator('[data-pt-block-id]')).toHaveCount(2)

    // 确认：Toast 复述与实际结果一致（确认路径不挂撤销按钮，A9）
    await openRailMenu(page, 'row', 6)
    await page.getByTestId('menu-row-remove').click()
    await page.getByTestId('confirm-ok').last().click()
    await expect(toastMsg(page)).toHaveText('已删除第 7 行')
    await expect(page.getByTestId('toast-action')).toHaveCount(0)
    await expect(structureSummary(page)).toHaveText('10 行 × 6 列 · 2 层表头')
    await expect(page.locator('[data-pt-block-id]')).toHaveCount(1)
    await expectStructural(page, 'row:6')
  })
})

test.describe('UX-S05 · 最低结构守卫：不能删成空壳', () => {
  test('空表删到 2 行 1 列：最后内容行/最后一列禁删并给白话原因', async ({ page }) => {
    await openPreset(page, '新建空白表')

    // 空行 5 → 2（删第 5/4/3 行，全部空行即删）
    for (const idx of [4, 3, 2]) {
      await clickRailItem(page, 'row', idx)
      await openRailMenu(page, 'row', idx)
      await page.getByTestId('menu-row-remove').click()
      await expect(page.getByTestId('confirm-dialog')).toHaveCount(0)
    }
    await expect(structureSummary(page)).toHaveText('2 行 × 4 列 · 1 层表头')

    // 最后一条内容行禁删 + 白话原因（menu aria-label = 「删除该行：原因」）
    await clickRailItem(page, 'row', 1)
    await openRailMenu(page, 'row', 1)
    const removeRow = page.getByTestId('menu-row-remove')
    await expect(removeRow).toBeDisabled()
    await expect(removeRow).toHaveAttribute('aria-label', /至少保留 1 行表头和 1 行内容/)
    await page.keyboard.press('Escape')

    // 空列 4 → 1
    for (let i = 0; i < 3; i++) {
      await clickRailItem(page, 'col', 1)
      await openRailMenu(page, 'col', 1)
      await page.getByTestId('menu-col-remove').click()
    }
    await expect(structureSummary(page)).toHaveText('2 行 × 1 列 · 1 层表头')

    await clickRailItem(page, 'col', 0)
    await openRailMenu(page, 'col', 0)
    const removeCol = page.getByTestId('menu-col-remove')
    await expect(removeCol).toBeDisabled()
    await expect(removeCol).toHaveAttribute('aria-label', /至少保留 1 列/)
  })
})

test.describe('UX-S06 · 移动带合并区的行/列', () => {
  test('合法：合并区随行走、选择跟随、一步撤销；打散合并区的移动禁用并说明', async ({
    page,
  }) => {
    await openPreset(page, '多列对比表')
    const inst = presetOf('compare-alpha-v1')
    const clickCell = (slotId: string) =>
      page.locator('.preview-host canvas').first().click({ position: cellCenter(inst, slotId) })

    // ① 合法移动：R3（响应时效，逻辑行 3）造单行合并区后下移 → 内容与选择一同移动
    await dragSelect(page, inst, 'row.3.val.a', 'row.3.val.b')
    await page.getByTestId('selection-merge').click()
    await expect(toastMsg(page)).toHaveText('已合并（清除了 1 格内容）')
    await clickRailItem(page, 'row', 3)
    await openRailMenu(page, 'row', 3)
    await page.getByTestId('menu-row-next').click()
    await expect(toastMsg(page)).toHaveText('已下移')
    // 选区跟随被移动的那一行（3 → 4）
    await expectStructural(page, 'row:4')
    // 合并区跟行走：R4 原来的位置上现在选到的是 R3 的合并格
    await clickCell('row.4.val.a')
    await expect(page.locator('.preview-host')).toHaveAttribute('data-pt-selected-slot', 'row.3.val.a')
    // 一步撤销：撤移动、撤合并（恢复原几何供 ② 使用）
    await page.keyboard.press('Control+z')
    await page.keyboard.press('Control+z')
    // 撤销会恢复此前选区（合并前的 2 格），其浮动工具条恰好压在 row.3.val.a 上，
    // 会吞掉 ② 框选的 mouse.down —— 先点一个远端格子把选区挪开
    await clickCell('row.8.val.c')

    // ② 打散合并区的移动禁用：跨 R3–R4 的纵向合并区，R4 下移会拆散 → 置灰并说明
    await dragSelect(page, inst, 'row.3.val.a', 'row.4.val.a')
    await page.getByTestId('selection-merge').click()
    await expect(toastMsg(page)).toHaveText('已合并（清除了 1 格内容）')
    await clickRailItem(page, 'row', 4)
    await openRailMenu(page, 'row', 4)
    const rowNext = page.getByTestId('menu-row-next')
    await expect(rowNext).toBeDisabled()
    await expect(rowNext).toHaveAttribute('aria-label', /合并区交错/)
    await page.keyboard.press('Escape')

    // ③ 列轴：表头档位合并区（R0:C1–C2），C2 右移拆散 → 禁用；C1 左移进标签列 → 禁用
    await clickRailItem(page, 'col', 1)
    await openRailMenu(page, 'col', 1)
    await expect(page.getByTestId('menu-col-prev')).toBeDisabled()
    await expect(page.getByTestId('menu-col-prev')).toHaveAttribute(
      'aria-label',
      /第一列是标签列/,
    )
    await page.keyboard.press('Escape')
    await clickRailItem(page, 'col', 2)
    await openRailMenu(page, 'col', 2)
    const colNext = page.getByTestId('menu-col-next')
    await expect(colNext).toBeDisabled()
    await expect(colNext).toHaveAttribute('aria-label', /合并区交错/)
  })
})

test.describe('UX-S07 · 横滚/列宽后轨道与叠加层贴合真实格子', () => {
  test('列宽拖拽后列轨道项宽度跟随（渲染核几何，非固定估算）', async ({ page }) => {
    await openPreset(page, '多列对比表')
    const inst = presetOf('compare-alpha-v1')
    const before = (await page.getByTestId('rail-col-1').boundingBox())!
    await dragBoundary(page, inst, 1, 40)
    const after = (await page.getByTestId('rail-col-1').boundingBox())!
    expect(Math.abs(after.width - (before.width + 40))).toBeLessThanOrEqual(4)
    // 拖完轨道仍可就近操作
    await clickRailItem(page, 'col', 1)
    await expectStructural(page, 'col:1')
  })

  test('横向滚动后列轨道跟随视口、冻结列不动、就近选列可用', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 720 })
    await openPreset(page, '功能矩阵表')
    const canvas = page.locator('.preview-host canvas').first()
    const box = (await canvas.boundingBox())!
    expect(box.width).toBeLessThan(820) // 前置：内容宽于宿主（需要横滚）

    const b0 = (await page.getByTestId('rail-col-2').boundingBox())!
    const f0 = (await page.getByTestId('rail-col-0').boundingBox())!
    await page.mouse.move(box.x + 400, box.y + 100)
    await page.mouse.wheel(140, 0)
    await page.waitForTimeout(400)
    const b1 = (await page.getByTestId('rail-col-2').boundingBox())!
    const f1 = (await page.getByTestId('rail-col-0').boundingBox())!
    // 轨道 x 随内部横滚平移一列宽（140，与 tc091 同源）；冻结首列不动
    expect(Math.abs((b0.x - b1.x) - 140)).toBeLessThanOrEqual(4)
    expect(Math.abs(f0.x - f1.x)).toBeLessThanOrEqual(4)
    // 滚后仍可就近选列，结构高亮落在可视区内
    await clickRailItem(page, 'col', 3)
    await expectStructural(page, 'col:3')
    await expect(page.locator('.structural-cell').first()).toBeVisible()
  })

  // 注：不设「host 内部纵滚后轨道贴合」用例——探针实测 .preview-host clientH == scrollH
  // （纵向溢出实际发生在 window/body，宿主自身从不滚动，scrollTop 恒为 0），
  // 且 railGeometry 未对 window 滚动做补偿（窗口过矮整页滚动时行轨道会错位）。
  // 该场景不在增量 PRD §6 S07 判据内，已作为源码缺陷候选单独上报（见 QA 报告）。

  test('叠加层锚点同源：整列高亮与真实列几何一致（居中布局 offsetLeft > 0）', async ({ page }) => {
    await openPreset(page, '多列对比表')
    const inst = presetOf('compare-alpha-v1')
    const offsetLeft = await page.evaluate(
      () => document.querySelector('.vtable-root')?.offsetLeft ?? 0,
    )
    expect(offsetLeft).toBeGreaterThan(0)
    // C4（col 3）无合并区干扰：整列高亮的 x/宽应与真实列矩形一致（漏加 offset 即整体左移）
    await clickRailItem(page, 'col', 3)
    await expect(page.locator('.structural-cell').first()).toBeVisible()
    const hl = (await page.locator('.structural-cell').first().boundingBox())!
    const box = (await page.locator('.preview-host canvas').first().boundingBox())!
    let colLeft = 0
    for (let c = 0; c < 3; c++) colLeft += colWidthAt(inst, c)
    expect(Math.abs(hl.width - colWidthAt(inst, 3))).toBeLessThanOrEqual(4)
    expect(Math.abs(hl.x - (box.x + colLeft))).toBeLessThanOrEqual(4)
  })
})

test.describe('UX-S08 · 粘贴预览期结构操作统一锁定', () => {
  test('轨道禁用、键盘结构动作拦截；取消/确认后恢复', async ({ page }) => {
    await openPreset(page, '多列对比表')
    const inst = presetOf('compare-alpha-v1')
    await clickSlot(page, inst, 'row.3.label')
    await pasteClipboard(page, { text: TSV_3X4 })
    await expect(pasteBarText(page)).toBeVisible()

    // 轨道整体禁用（pointer-events:none + 降透明度）
    const railState = await page
      .locator('[data-testid="row-rail-strip"] .struct-rail')
      .evaluate((el) => ({
        pe: getComputedStyle(el).pointerEvents,
        op: Number(getComputedStyle(el).opacity),
      }))
    expect(railState.pe).toBe('none')
    expect(railState.op).toBeLessThan(0.5)

    // 键盘结构动作同样拦截（onKeydown pastePending 早退）
    await page.locator('[data-testid="preview-canvas"]').focus()
    await page.keyboard.press('Shift+Space')
    await expectStructural(page, '')

    // 取消粘贴 → 恢复
    await cancelPaste(page)
    await clickRailItem(page, 'row', 2)
    await expectStructural(page, 'row:2')

    // 确认粘贴 → 恢复
    await clickSlot(page, inst, 'row.3.label')
    await pasteClipboard(page, { text: TSV_3X4 })
    await confirmPaste(page)
    await expect(toastMsg(page)).toHaveText('已填入 12 格')
    await clickRailItem(page, 'col', 2)
    await expectStructural(page, 'col:2')
  })
})

test.describe('UX-S09 · 键盘全链路：整行/列选择与结构菜单', () => {
  test('Shift+Space / Ctrl+Space / Shift+F10 / ContextMenu / Esc / 焦点归还', async ({ page }) => {
    await openPreset(page, '多列对比表')
    const inst = presetOf('compare-alpha-v1')
    const clickCell = (slotId: string) =>
      page.locator('.preview-host canvas').first().click({ position: cellCenter(inst, slotId) })

    // ① Shift+Space：整行（以当前格所在行为准）
    await clickCell('row.3.val.a')
    await page.keyboard.press('Shift+Space')
    await expectStructural(page, 'row:3')
    await expect(page.locator('.structural-cell').first()).toBeVisible()

    // ② Ctrl+Space：整列
    await clickCell('row.3.val.b')
    await page.keyboard.press('Control+Space')
    await expectStructural(page, 'col:2')

    // ③ Shift+F10：打开与鼠标同一套结构菜单（当前是整列 → 列菜单），焦点移入菜单
    await page.keyboard.press('Shift+F10')
    await expect(page.getByRole('menu', { name: '列操作菜单' })).toBeVisible()
    await expect(page.getByTestId('menu-col-before')).toBeAttached()
    await expect(page.getByTestId('menu-col-remove')).toBeAttached()
    const focusInMenu = await page.evaluate(
      () => !!document.activeElement?.closest('.struct-menu'),
    )
    expect(focusInMenu).toBe(true)

    // ④ Esc：关菜单 + 焦点归还画布（结构选择保留）
    await page.keyboard.press('Escape')
    await expect(page.locator('.struct-menu')).toHaveCount(0)
    await expect(page.getByTestId('preview-canvas')).toBeFocused()
    await expectStructural(page, 'col:2')

    // ⑤ Esc：退出整列选择 → 回到当前首格（[0,2] 表头格）的单元格选择
    await page.keyboard.press('Escape')
    await expectStructural(page, '')
    await expect(page.locator('.preview-host')).toHaveAttribute('data-pt-selected-slot', 'band.1')

    // ⑥ ContextMenu 键：无结构选择时先以当前格所在行建整行选择，再开同一套菜单
    await clickCell('row.5.val.a')
    await page.keyboard.press('ContextMenu')
    await expect(page.getByRole('menu', { name: '行操作菜单' })).toBeVisible()
    await expectStructural(page, 'row:5')
    await expect(page.getByTestId('menu-row-prev')).toBeAttached()
    await page.keyboard.press('Escape')
    await expect(page.locator('.struct-menu')).toHaveCount(0)
  })
})

test.describe('UX-S10 · 结构调整后导出/刷新/另存往返一致（壳层不入导出物）', () => {
  test('插行后：导出 HTML 无轨道 DOM、刷新草稿一致、另存模板再打开结构一致', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', CLIPBOARD_ONLY)
    await openPreset(page, '多列对比表')

    // 结构调整：第 3 行后插一行
    await clickRailItem(page, 'row', 2)
    await page.getByTestId('rail-row-plus-2').click()
    await expect(toastMsg(page)).toHaveText('已在第 4 行后插入一行')
    await expect(structureSummary(page)).toHaveText('11 行 × 4 列 · 2 层表头')

    // 导出 HTML：结构一致且轨道/描边/工具条不入导出物
    const html = await exportedHtml(page)
    expect(html).not.toContain('struct-rail')
    expect(html).not.toContain('structural-cell')
    expect(html).not.toContain('行轨道')

    // 刷新 → 草稿恢复，导出物逐字节一致
    await page.reload()
    await expect(page.locator('.banner')).toContainText('已恢复上次的编辑')
    await expect(page.locator('.preview-host canvas').first()).toBeVisible({ timeout: 15_000 })
    await expect(structureSummary(page)).toHaveText('11 行 × 4 列 · 2 层表头')
    const htmlAfterReload = await exportedHtml(page)
    expect(htmlAfterReload).toBe(html)

    // PNG 可导出（结构同步进渲染核）；导出完关闭抽屉（遮罩会挡住头部按钮）
    await openExportDrawer(page)
    const png = await downloadPng(page)
    expect(pngSize(png).width).toBeGreaterThan(0)
    await page.getByRole('button', { name: '关闭' }).click()
    await expect(page.locator('.drawer')).toHaveCount(0)

    // 另存为模板 → 库页 → 再打开，结构一致
    await page.getByRole('button', { name: '另存为模板' }).click()
    await page.locator('.dialog input').fill('结构升级回归表')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(toastMsg(page)).toHaveText('已另存为我的模板')
    await page.getByRole('button', { name: '← 模板库' }).click()
    const card = page.locator('article.card', {
      has: page.locator('h3', { hasText: '结构升级回归表' }),
    })
    await card.getByRole('button', { name: '使用此模板' }).click()
    await expect(page.locator('.preview-host canvas').first()).toBeVisible()
    await expect(structureSummary(page)).toHaveText('11 行 × 4 列 · 2 层表头')
  })
})
