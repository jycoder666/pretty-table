import { expect, test } from '@playwright/test'
import { buildVisualRows, colWidthAt, type TemplateInstance } from '../../src/core/index'
import {
  exportedHtml,
  grantClipboardIfChromium,
  openPreset,
  presetOf,
  slotVisualPos,
  toastText,
} from './helpers'

/**
 * T31 验收 · TC-PT-093（WP3）· 就地编辑与键盘效率
 *
 * 历史症状：全仓无 dblclick——改一格内容要「点格 → 鼠标移到右栏 → 找输入框」；
 * 画布不吃方向键 / Tab / Enter；多选后对齐与强调只作用单格。
 *
 * 断言口径（TC-PT-093）：
 *  ① 双击文本格 → 就地输入框出现并聚焦；改字 + Enter → 内容落库、输入框关闭
 *  ② Esc 取消 → 内容不变
 *  ③ 画布聚焦后方向键移动选区、Shift+方向键扩选（高亮格数随之变化）
 *  ④ 直接键入进入编辑（TH-C1）：敲一个字符即开框且以该字符开头
 *  ⑤ 多选 + 右栏「加粗」→ 整块选区一次生效（导出 HTML 加粗格 +4），一次撤销全回退
 *  ⑥ 语义槽（标记/数值）双击 → 白话提示改走右栏，不静默
 *
 * 用 compare-alpha-v1 的**文本**槽 row.3.val.* / row.4.val.*（row.2.val.* 是标记槽，
 * 双击应走 ⑥ 的口径）。
 *
 * 引擎范围：③④ 依赖真实剪贴板读回，Playwright 版 WebKit 无 clipboard-read/write
 * 权限项（grantPermissions 直接抛），故这两条只在 chromium 跑；WebKit 侧的就地编辑 /
 * 键盘行为由 ①②⑤⑥ 与 manual-verify 真机抽查覆盖。
 */

/** 剪贴板读回能力仅 chromium 具备（见 helpers.grantClipboardIfChromium 注释） */
const CLIPBOARD_ONLY = '剪贴板读回仅 chromium（WebKit 版无该权限项）'

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

async function canvasBox(page: import('@playwright/test').Page) {
  return (await page.locator('.preview-host canvas').first().boundingBox())!
}

/** 双击某槽位对应的格 */
async function dblclickSlot(
  page: import('@playwright/test').Page,
  inst: TemplateInstance,
  slotId: string,
): Promise<void> {
  const box = await canvasBox(page)
  const p = cellCenter(inst, slotId)
  await page.mouse.dblclick(box.x + p.x, box.y + p.y)
  await page.waitForTimeout(120)
}

/** 点一格（同时把焦点给画布，键盘才有落点） */
async function clickSlot(
  page: import('@playwright/test').Page,
  inst: TemplateInstance,
  slotId: string,
): Promise<void> {
  const box = await canvasBox(page)
  const p = cellCenter(inst, slotId)
  await page.mouse.click(box.x + p.x, box.y + p.y)
  await page.waitForTimeout(80)
}

/** 框选：从 from 格中心拖到 to 格中心（位移 >4px 才进入拖选） */
async function dragSelect(
  page: import('@playwright/test').Page,
  inst: TemplateInstance,
  fromSlot: string,
  toSlot: string,
): Promise<void> {
  const box = await canvasBox(page)
  const a = cellCenter(inst, fromSlot)
  const b = cellCenter(inst, toSlot)
  await page.mouse.move(box.x + a.x, box.y + a.y)
  await page.mouse.down()
  await page.mouse.move(box.x + (a.x + b.x) / 2, box.y + (a.y + b.y) / 2, { steps: 3 })
  await page.mouse.move(box.x + b.x, box.y + b.y, { steps: 3 })
  await page.mouse.up()
  await page.waitForTimeout(150)
}

/**
 * 导出 HTML 里「强调·加粗」的出现次数（口径证据）。
 * 注意标记：cellInlineStyle 里强调加粗写的是 `font-weight:700`；
 * `font-weight:600` 是标签行/区块行的固有样式（基线恒定），不能当强调证据。
 * exportedHtml 助手内部已复制并关闭抽屉，此处不要再点「关闭」。
 */
async function boldCount(page: import('@playwright/test').Page): Promise<number> {
  const html = await exportedHtml(page)
  return (html.match(/font-weight:700/g) ?? []).length
}

test.describe('TC-PT-093 · 就地编辑 / 键盘 / 多选批量', () => {
  test('双击改字 + Enter 提交；Esc 取消不改内容', async ({ page }) => {
    await openPreset(page, '多列对比表')
    const inst = presetOf('compare-alpha-v1')

    // ① 双击文本格 C1R3 → 就地输入框出现、聚焦、带原值
    await dblclickSlot(page, inst, 'row.3.val.a')
    const editor = page.getByTestId('inline-editor')
    await expect(editor).toBeVisible()
    await expect(editor).toBeFocused()
    await expect(editor).toHaveValue('1 个工作日')

    // ② 改字 + Enter → 提交（内容落库、输入框关闭、选区下移一格）
    await editor.fill('当天响应')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('inline-editor')).toHaveCount(0)
    await expect(page.locator('.selection-cell')).toHaveCount(1)
    // 落库证据：再开同一格，输入框回读的是模型里的新值（canvas 无文本节点，不能断言文字）。
    // 先点下一行的格把选区挪走：选区工具条贴在选区上方，会把上一行的格盖住。
    await clickSlot(page, inst, 'row.5.val.a')
    await dblclickSlot(page, inst, 'row.3.val.a')
    await expect(page.getByTestId('inline-editor')).toHaveValue('当天响应')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('inline-editor')).toHaveCount(0)

    // ③ Esc 取消：开框 → 改字 → Esc → 内容不变（回读仍是原值「全国」）
    await dblclickSlot(page, inst, 'row.4.val.a')
    await expect(page.getByTestId('inline-editor')).toHaveValue('全国')
    await page.getByTestId('inline-editor').fill('不该生效')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('inline-editor')).toHaveCount(0)
    await dblclickSlot(page, inst, 'row.4.val.a')
    await expect(page.getByTestId('inline-editor')).toHaveValue('全国')
    await page.keyboard.press('Escape')
  })

  test('键盘：方向键移动 / Shift+方向键扩选 / 直接键入进编辑', async ({ page }) => {
    await openPreset(page, '多列对比表')
    const inst = presetOf('compare-alpha-v1')

    // ① 点一格 → 画布拿到焦点（键盘可用）
    await clickSlot(page, inst, 'row.3.val.a')
    await expect(page.getByTestId('preview-canvas')).toBeFocused()
    await expect(page.locator('.selection-cell')).toHaveCount(1)

    // ② 方向键移动选区（单格保持 1 块高亮）；右栏选中槽跟着走——面板停在旧格上
    //    会让「按键盘选好格 → 用面板改文案」改错格（编辑不灵活的一种）
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('.preview-host')).toHaveAttribute('data-pt-selected-slot', 'row.3.val.b')
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('.preview-host')).toHaveAttribute('data-pt-selected-slot', 'row.4.val.b')
    await expect(page.locator('.selection-cell')).toHaveCount(1)

    // ③ Shift+方向键扩选 → 2 格高亮
    await page.keyboard.press('Shift+ArrowLeft')
    await expect(page.locator('.selection-cell')).toHaveCount(2)

    // ③b Tab 跳格：从选区起点右移一格（面板同样跟随）
    await page.keyboard.press('Tab')
    await expect(page.locator('.preview-host')).toHaveAttribute('data-pt-selected-slot', 'row.4.val.b')
    await expect(page.locator('.selection-cell')).toHaveCount(1)

    // ④ 直接键入进编辑（TH-C1）：敲一个可打印字符即开框，且以该字符开头。
    // 用 ASCII 字符取证：Playwright 的 keyboard.type 对中日韩字符走 insertText（无 keydown），
    // 而本功能的入口就是 keydown（真实输入法场景先双击开框再输入）。
    await page.keyboard.press('k')
    const editor = page.getByTestId('inline-editor')
    await expect(editor).toBeVisible()
    await expect(editor).toHaveValue('k')
    await page.keyboard.press('Escape')
  })

  test('多选批量加粗：整块生效（导出 +4 处加粗），一次撤销全回退', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', CLIPBOARD_ONLY)
    await openPreset(page, '多列对比表')
    const inst = presetOf('compare-alpha-v1')

    const baseline = await boldCount(page)

    // ① 框选 2×2 文本格 → 面板显示「已选 4 格」
    await dragSelect(page, inst, 'row.3.val.a', 'row.4.val.b')
    await expect(page.getByTestId('selection-count')).toContainText('已选 4 格')

    // ② 加粗 → 4 格一起变（一次批量 = 一步撤销）
    await page.getByRole('button', { name: '加粗' }).click()
    await page.waitForTimeout(200)
    expect(await boldCount(page)).toBe(baseline + 4)

    // ③ 一次撤销 → 全部回退（证明是一批而不是四步）。
    // 撤销键由 EditorPage 在 window 上监听（只在输入框聚焦时让位给原生撤销）：
    // 上一步的导出抽屉已关闭、焦点回落 body，直接按即可。
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    expect(await boldCount(page)).toBe(baseline)
  })

  test('Ctrl+C：选区 → 剪贴板 TSV（行 \\n 列 \\t）', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', CLIPBOARD_ONLY)
    await openPreset(page, '多列对比表')
    const inst = presetOf('compare-alpha-v1')

    await dragSelect(page, inst, 'row.3.val.a', 'row.3.val.b')
    await expect(page.getByTestId('preview-canvas')).toBeFocused()
    await page.keyboard.press('Control+c')
    const text = await page.evaluate(() => navigator.clipboard.readText())
    expect(text.split('\n')).toHaveLength(1)
    expect(text.split('\t')).toHaveLength(2)
    expect(text).toContain('1 个工作日')
    expect(text).toContain('2 个工作日')
  })

  test('语义槽（标记格）双击：白话提示改走右栏，不静默也不开文本框', async ({ page }) => {
    await openPreset(page, '多列对比表')
    const inst = presetOf('compare-alpha-v1')

    // row.2.val.a 是 mark 槽（预设里是「✓ 支持」）
    await dblclickSlot(page, inst, 'row.2.val.a')
    await expect(page.getByTestId('inline-editor')).toHaveCount(0)
    expect((await toastText(page)) ?? '').toContain('右栏')
  })
})
