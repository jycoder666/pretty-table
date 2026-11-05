import { expect, test } from '@playwright/test'
import { buildVisualRows, colWidthAt, type TemplateInstance } from '../../src/core/index'
import {
  clickRailItem,
  countPngNearColor,
  expectToast,
  openPreset,
  presetOf,
  slotVisualPos,
  structureSummary,
} from './helpers'

/**
 * T31 验收 · TC-PT-092（WP1 + WP2）· 合并/拆分的可见可用与框选
 *
 * 历史症状：合并/拆分只在右栏「结构」组（默认收起）里、选区靠 Shift 点终点（不可发现）、
 * 成功后无任何反馈；选区落在合并区之内/之外时按钮可点但点了静默无效。
 *
 * 断言口径（TC-PT-092）：
 *  ① 框选 2×2：高亮 4 格 + 选区工具条出现（合并可用）
 *  ② 合并：toast「已合并（清除了 3 格内容）」、高亮收成 1 块、拆分转为可用、合并转为不可用
 *  ③ 拆分：toast「已拆分」、高亮回到 4 块、合并恢复可用
 *  ④ 撤销语义：一次合并 = 一步撤销（撤销后回到未合并）
 *  ⑤ 闸门收紧：选区「包含但不等于」合并区时拆分按钮置灰（修复前可点且点了没反应）
 *  ⑥ 合并上限放宽（灵活操作 T05）：空白表加行后 7 行跨度被拦、6 行跨度可合并（小样本；
 *    扩选走键盘 Shift+方向键（cellNav 读 store 逻辑行列）——画布渲染滞后结构操作一拍且深行
 *    像素坐标不可靠，dragSelect/描边计数不适用，实查；列轴 7/8/9 边界与存量 20→30 续并在
 *    mergeGuard.spec 参数化矩阵与夹具覆盖，9 列画布横向溢出亦不可框选，故列轴不走 e2e）
 */

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

test.describe('TC-PT-092 · 框选 → 合并 → 拆分（含成功反馈与闸门收紧）', () => {
  test('框选白名单纵向 4×1 → 合并（toast+高亮收拢+可拆分）→ 拆分复原 → 一步撤销', async ({
    page,
  }) => {
    await openPreset(page, '多列对比表')
    const inst = presetOf('compare-alpha-v1')

    // ① 框选 R2–R5 × C1（4 格全有内容）。约束：A-5 白名单红线下 compare 只允许
    // 纵向单列矩形 [2,1]-[5,1] 与顶栏横排 [0,1]-[0,3]——2×2 不在白名单，用例素材对齐红线
    await dragSelect(page, inst, 'row.2.val.a', 'row.5.val.a')
    await expect(page.locator('.selection-cell')).toHaveCount(4)
    const bar = page.getByTestId('selection-bar')
    await expect(bar).toBeVisible()
    await expect(page.getByTestId('selection-merge')).toBeEnabled()
    await expect(page.getByTestId('selection-split')).toBeDisabled()

    // ② 合并：toast + 高亮收成 1 块 + 闸门互换
    await page.getByTestId('selection-merge').click()
    await expectToast(page, '已合并（清除了 3 格内容）')
    await expect(page.locator('.selection-cell')).toHaveCount(1)
    await expect(page.getByTestId('selection-split')).toBeEnabled()
    await expect(page.getByTestId('selection-merge')).toBeDisabled()

    // ③ 拆分：toast + 高亮回到 4 块 + 闸门复原
    await page.getByTestId('selection-split').click()
    await expectToast(page, '已拆分')
    await expect(page.locator('.selection-cell')).toHaveCount(4)
    await expect(page.getByTestId('selection-merge')).toBeEnabled()
    await expect(page.getByTestId('selection-split')).toBeDisabled()

    // ④ 撤销：拆分 → 合并态（一步），再撤销 → 未合并（一步）
    await page.keyboard.press('Control+z')
    await expect(page.getByTestId('selection-split')).toBeEnabled()
    await page.keyboard.press('Control+z')
    await expect(page.getByTestId('selection-merge')).toBeEnabled()
    await expect(page.getByTestId('selection-split')).toBeDisabled()
  })

  test('闸门收紧：选区「包含但不等于」合并区 → 拆分置灰（修复前可点且静默无效）', async ({
    page,
  }) => {
    await openPreset(page, '多列对比表')
    const inst = presetOf('compare-alpha-v1')
    // R0:C1–C2 是既有合并区；从 C1 拖到 C3 → 选区 R0:C1–C3 包含该合并区但不等于它
    await dragSelect(page, inst, 'band.1', 'band.2')
    // 既有合并区 R0:C1–C2 合成一块 + C3 一块 = 2 块
    await expect(page.locator('.selection-cell')).toHaveCount(2)
    await expect(page.getByTestId('selection-split')).toBeDisabled()
    // 合并同样不可（与既有合并区部分重叠）
    await expect(page.getByTestId('selection-merge')).toBeDisabled()
  })

  test('合并区双击就地编辑：编辑框覆盖整个合并区宽度（修复前只有左上单格大小）', async ({
    page,
  }) => {
    await openPreset(page, '多列对比表')
    const inst = presetOf('compare-alpha-v1')

    // 素材：顶栏既有用户合并区 [0,1]-[0,2]（band.1，白名单横向矩形）——内容行白名单
    // 只有纵向单列矩形、无横向可造（A-5 红线不动，用例素材对齐白名单）
    const a = cellCenter(inst, 'band.1')
    await page.locator('.preview-host canvas').first().dblclick({ position: { x: a.x, y: a.y } })
    const editor = page.getByTestId('inline-editor')
    await expect(editor).toBeVisible()

    // 编辑框宽度 = 合并区两列宽之和（±3px 容差：渲染核权威几何与算术同源、取整路径不同）
    const want = colWidthAt(inst, 1) + colWidthAt(inst, 2)
    const got = (await editor.boundingBox())!.width
    expect(Math.abs(got - want)).toBeLessThanOrEqual(3)

    // Esc 取消，不落内容
    await page.keyboard.press('Escape')
    await expect(editor).toHaveCount(0)
  })

  test('合并区长文本不被锚点列宽裁剪：文本延伸到合并区右半（修复前右半无任何文字像素）', async ({
    page,
  }) => {
    await openPreset(page, '多列对比表')
    const inst = presetOf('compare-alpha-v1')

    // 素材：顶栏既有合并区 [0,1]-[0,2]（band.1）。双击 → 输入 18 字长文本
    // （宽度约等合并区可用宽，必然跨过锚点列右边界）；顶栏深蓝底白字，采样白色笔画
    const canvas = page.locator('.preview-host canvas').first()
    const a = cellCenter(inst, 'band.1')
    await canvas.dblclick({ position: { x: a.x, y: a.y } })
    const editor = page.getByTestId('inline-editor')
    await expect(editor).toBeVisible()
    await page.keyboard.press('Control+a')
    await page.keyboard.type('测'.repeat(18))
    await page.keyboard.press('Enter')
    await expect(editor).toHaveCount(0)

    // 点远端标签格，把选区工具条挪出采样区（浮层会压住顶栏）
    const far = cellCenter(inst, 'row.8.label')
    await canvas.click({ position: { x: far.x, y: far.y } })
    await page.waitForTimeout(250)

    // 采样矩形：合并区左半（锚点列 B）与右半（C 列），各内缩 2px 避开格线；顶栏为第 0 可视行
    const box = (await canvas.boundingBox())!
    const { rowHeights } = buildVisualRows(inst)
    const h = rowHeights[0] ?? 36
    const wB = colWidthAt(inst, 1)
    const wC = colWidthAt(inst, 2)
    const xB = colWidthAt(inst, 0)

    // 左半：文字起点所在列，必有白色笔画（顶栏 #2F5B9A 底白字）
    const leftPng = await page.screenshot({
      clip: { x: box.x + xB + 2, y: box.y + 2, width: wB - 4, height: h - 4 },
    })
    const leftInk = await countPngNearColor(page, new Uint8Array(leftPng), '#FFFFFF', 70)
    expect(leftInk).toBeGreaterThan(20)

    // 右半：修复前此处纯背景（文本被裁在锚点列边界），修复后应有文字笔画
    const rightPng = await page.screenshot({
      clip: { x: box.x + xB + wB + 2, y: box.y + 2, width: wC - 4, height: h - 4 },
    })
    const rightInk = await countPngNearColor(page, new Uint8Array(rightPng), '#FFFFFF', 70)
    expect(rightInk).toBeGreaterThan(20)
  })

  // 灵活操作升级 T05⑥：合并上限 4 行 → 6 行（PRD §5.5 / 拍板 6/8/30）。
  // 旧上限下「5 行表合并全表」即触顶，无法在 UI 里构造 6 行成功样本 → 先用轨道加行。
  // 选区扩延走键盘 Shift+方向键（cellNav 纯函数，读 store 逻辑行列，无像素依赖）。
  // 已实查（本任务诊断记录）：画布渲染滞后结构操作一拍（store/摘要已 +1 行，画布仍画旧行数，
  // 点画布不触发补渲），选区描边计数不可靠——故本用例只断言闸门本身（跨度闸读 store 选区）：
  //  「R0–R5 可合并」+「再扩一行后置关」两步互相印证：若扩选没到位，第 6 次扩后仍 ≤6 行、merge 不会置关。
  test('合并上限放宽：7 行跨度合并被拦（置灰），6 行跨度可合并、一步撤销', async ({ page }) => {
    await openPreset(page, '新建空白表')

    const canvas = page.locator('.preview-host canvas').first()
    const base = presetOf('blank-v1')
    const headCell = cellCenter(base, 'u2')
    const selectTop6 = async (): Promise<void> => {
      await canvas.click({ position: { x: headCell.x, y: headCell.y } })
      await expect(page.locator('.preview-host')).toHaveAttribute('data-pt-selected-slot', 'u2')
      await page.locator('[data-testid="preview-canvas"]').focus()
      for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowDown')
      await page.keyboard.press('Shift+ArrowRight')
    }

    // ① 插 1 行 → 6 行表：R0–R5 × C1–C2（跨度恰 6）→ 可合并，一步撤销
    await clickRailItem(page, 'row', 4)
    await page.getByTestId('rail-row-plus-4').click()
    await expect(structureSummary(page)).toHaveText('6 行 × 4 列 · 1 层表头')
    await selectTop6()
    await expect(page.getByTestId('selection-merge')).toBeEnabled()
    await page.getByTestId('selection-merge').click()
    await expectToast(page, /已合并/)
    await expect(page.locator('.selection-cell')).toHaveCount(1)
    await page.keyboard.press('Control+z')
    await expect(page.getByTestId('selection-merge')).toBeEnabled()
    await expect(page.getByTestId('selection-split')).toBeDisabled()

    // ② 再插 1 行 → 7 行表：R0–R5 仍可合并（跨度 6）；再扩一行到 R0–R6（跨度 7）→ 合并置灰
    await clickRailItem(page, 'row', 4)
    await page.getByTestId('rail-row-plus-4').click()
    await expect(structureSummary(page)).toHaveText('7 行 × 4 列 · 1 层表头')
    await selectTop6()
    await expect(page.getByTestId('selection-merge')).toBeEnabled()
    await page.keyboard.press('Shift+ArrowDown')
    await expect(page.getByTestId('selection-merge')).toBeDisabled()
    await expect(page.getByTestId('selection-split')).toBeDisabled()
  })
})
