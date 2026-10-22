import { expect, test } from '@playwright/test'
import { buildVisualRows, colWidthAt, type TemplateInstance } from '../../src/core/index'
import { expectToast, openPreset, presetOf, slotVisualPos } from './helpers'

/**
 * T31 验收 · TC-PT-094（WP4）· 行列换位与表内区块拖动
 *
 * 历史症状：改顺序只能靠「删掉重打」；区块落位后挪不动（只能删了再拖一个）；
 * 列宽拖拽是画布临时效果，模型不知道。
 *
 * 断言口径（TC-PT-094）：
 *  ① 行下移 / 行上移：内容随行走（同一视觉位置换成了原来相邻行的内容），一次一步撤销
 *  ② 列左移 / 列右移：内容随列走（点原列位置选到的是挪过来的那列）
 *  ③ 表头行与标签列不给换位：按钮置灰（核内同样拒绝，UI 不装可用）
 *  ④ 区块把手：拖到非槽位 → 白话提示且不动；拖到另一槽位 → 两个区块互换；一步撤销
 *  ⑤ 列宽拖拽：落模型（刷新仍在）、一次拖动一步撤销、不与框选打架（热区让位）
 *
 * 证据取法：`[data-pt-selected-slot]`（宿主属性 = 当前选中槽位）与面板 slot-headline
 * （模型显示值），均为模型侧证据，不依赖 canvas 文本（canvas 没有文本节点）。
 */

/** 槽位所在可视行中心 y（内容坐标，未横滚时与容器坐标同源） */
function rowCenterY(inst: TemplateInstance, slotId: string): number {
  const { row } = slotVisualPos(inst, slotId)
  const { rowHeights } = buildVisualRows(inst)
  let y = 0
  for (let r = 0; r < row; r++) y += rowHeights[r] ?? 36
  return y + (rowHeights[row] ?? 36) / 2
}

/** 槽位中心（内容坐标） */
function cellCenter(inst: TemplateInstance, slotId: string): { x: number; y: number } {
  const { row, col } = slotVisualPos(inst, slotId)
  const { rowHeights } = buildVisualRows(inst)
  let x = 0
  for (let c = 0; c < col; c++) x += colWidthAt(inst, c)
  let y = 0
  for (let r = 0; r < row; r++) y += rowHeights[r] ?? 36
  return { x: x + colWidthAt(inst, col) / 2, y: y + (rowHeights[row] ?? 36) / 2 }
}

function host(page: import('@playwright/test').Page) {
  return page.locator('.preview-host')
}

function headline(page: import('@playwright/test').Page) {
  return page.getByTestId('slot-headline')
}

/**
 * 展开右栏「结构」组（PX-16 默认收起；行列换位按钮在这一组里）。
 * 面板组展开态是模块级记忆，同一用例内点一次即可。
 */
async function openStructureGroup(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: '结构' }).click()
  await expect(page.getByTestId('move-row-up')).toBeVisible()
}

test.describe('TC-PT-094 · 行列换位（内容随行走 + 一步撤销）', () => {
  test('行下移 / 行上移：内容随行走，撤销一步回到原样', async ({ page }) => {
    await openPreset(page, '多列对比表')
    const inst = presetOf('compare-alpha-v1')
    await openStructureGroup(page)

    // 说明：选区工具条浮在选区上沿（比选区高 38px），会盖住「选区正上方那一行」。
    // 所以本用例统一「在 C3 上选行、在 C1 上验内容」——横向错开，不与工具条打架。
    const cellAt = (slotId: string) =>
      page.locator('.preview-host canvas').first().click({ position: cellCenter(inst, slotId) })

    // 基线：R3 的 C3 = 「3 个工作日」
    await cellAt('row.3.val.c')
    await expect(host(page)).toHaveAttribute('data-pt-selected-slot', 'row.3.val.c')
    await expect(headline(page)).toContainText('3 个工作日')

    // 行下移（R3 → R4）
    await page.getByTestId('move-row-down').click()
    await expectToast(page, '已下移')

    // ① 内容随行走：R3 原来的位置上，现在选到的是 R4 的格子
    await cellAt('row.3.val.a')
    await expect(host(page)).toHaveAttribute('data-pt-selected-slot', 'row.4.val.a')
    await expect(headline(page)).toContainText('全国')

    // ② 被挪的那一行落在 R4：R4 原来的位置上现在选到的是 R3 的格子
    await cellAt('row.4.val.c')
    await expect(host(page)).toHaveAttribute('data-pt-selected-slot', 'row.3.val.c')
    await expect(headline(page)).toContainText('3 个工作日')

    // ③ 行上移：选区就在被挪的那一行上（上一步刚选中），点按钮即挪回原位
    await page.getByTestId('move-row-up').click()
    await expectToast(page, '已上移')
    await cellAt('row.3.val.a')
    await expect(host(page)).toHaveAttribute('data-pt-selected-slot', 'row.3.val.a')
    await expect(headline(page)).toContainText('1 个工作日')

    // ④ 一步撤销：撤销「上移」→ 回到「下移后」的状态（而不是回到最初）
    await page.keyboard.press('Control+z')
    await cellAt('row.3.val.a')
    await expect(host(page)).toHaveAttribute('data-pt-selected-slot', 'row.4.val.a')
  })

  test('列左移 / 列右移：内容随列走', async ({ page }) => {
    await openPreset(page, '多列对比表')
    const inst = presetOf('compare-alpha-v1')
    await openStructureGroup(page)

    // 选 C2 的「2 个工作日」→ 列左移（C2 → C1）
    await page.locator('.preview-host canvas').first().click({
      position: cellCenter(inst, 'row.3.val.b'),
    })
    await expect(host(page)).toHaveAttribute('data-pt-selected-slot', 'row.3.val.b')
    await page.getByTestId('move-col-left').click()
    await expectToast(page, '已左移')

    // 原 C1 的位置现在选到的是挪过来的 C2
    await page.locator('.preview-host canvas').first().click({
      position: cellCenter(inst, 'row.3.val.a'),
    })
    await expect(host(page)).toHaveAttribute('data-pt-selected-slot', 'row.3.val.b')
    await expect(headline(page)).toContainText('2 个工作日')

    // 列右移回去：此时选中的就是 C1 上的那一列
    await page.getByTestId('move-col-right').click()
    await expectToast(page, '已右移')
    await page.locator('.preview-host canvas').first().click({
      position: cellCenter(inst, 'row.3.val.b'),
    })
    await expect(host(page)).toHaveAttribute('data-pt-selected-slot', 'row.3.val.b')
  })

  test('表头行与标签列不给换位：按钮置灰（核内同样拒绝）', async ({ page }) => {
    await openPreset(page, '多列对比表')
    const inst = presetOf('compare-alpha-v1')
    await openStructureGroup(page)

    // 表头带（R0，落在合并区上）→ 上/下都不可
    await page.locator('.preview-host canvas').first().click({
      position: cellCenter(inst, 'band.1'),
    })
    await expect(page.getByTestId('move-row-up')).toBeDisabled()
    await expect(page.getByTestId('move-row-down')).toBeDisabled()

    // 标签列（C0）→ 左/右都不可
    await page.locator('.preview-host canvas').first().click({
      position: cellCenter(inst, 'row.3.label'),
    })
    await expect(page.getByTestId('move-col-left')).toBeDisabled()
    await expect(page.getByTestId('move-col-right')).toBeDisabled()

    // 数据列 C1 → 不能左移进标签列，但可以右移
    await page.locator('.preview-host canvas').first().click({
      position: cellCenter(inst, 'row.3.val.a'),
    })
    await expect(page.getByTestId('move-col-left')).toBeDisabled()
    await expect(page.getByTestId('move-col-right')).toBeEnabled()

    // 数据行 R3 → 上下都可
    await expect(page.getByTestId('move-row-up')).toBeEnabled()
    await expect(page.getByTestId('move-row-down')).toBeEnabled()
  })
})

test.describe('TC-PT-094 · 列宽拖拽落模型（跨刷新保留 / 一步撤销 / 不与框选打架）', () => {
  /**
   * 拖某一列的**右缘**。VTable 把边界热区判给左侧那一列（getResizeColAt 口径：
   * 命中列减一），所以拖 C1 右缘改的是 C1 的宽度，断言就量 C1。
   * 返回「抬手前那一刻的高亮格数」——框选若同时起手，此刻已经拉出选区（点击选格尚未发生）。
   */
  async function dragBoundary(
    page: import('@playwright/test').Page,
    inst: TemplateInstance,
    leftCol: number,
    dx: number,
  ): Promise<number> {
    const box = (await page.locator('.preview-host canvas').first().boundingBox())!
    let x = 0
    for (let c = 0; c <= leftCol; c++) x += colWidthAt(inst, c)
    const y = box.y + rowCenterY(inst, 'row.3.val.b')
    await page.mouse.move(box.x + x, y)
    // 让渲染器把热区光标（col-resize）挂到画布上：壳层的框选守卫读的就是它
    await page.waitForTimeout(80)
    await page.mouse.down()
    await page.mouse.move(box.x + x + dx / 2, y, { steps: 4 })
    await page.mouse.move(box.x + x + dx, y, { steps: 4 })
    await page.waitForTimeout(150)
    const midDragSelection = await page.locator('.selection-cell').count()
    await page.mouse.up()
    await page.waitForTimeout(300)
    return midDragSelection
  }

  /** 点一格 → 返回该格描边宽度（= 模型列宽；canvas 无文本节点，宽度是列宽的模型侧证据） */
  async function selectedWidth(
    page: import('@playwright/test').Page,
    inst: TemplateInstance,
    slotId: string,
  ): Promise<number> {
    await page.locator('.preview-host canvas').first().click({ position: cellCenter(inst, slotId) })
    const sel = page.locator('.selection-cell').first()
    await expect(sel).toBeVisible()
    return (await sel.boundingBox())!.width
  }

  test('拖 C1 右缘 → 列宽落模型：刷新仍在、不误起框选', async ({ page }) => {
    await openPreset(page, '多列对比表')
    const inst = presetOf('compare-alpha-v1')
    const before = colWidthAt(inst, 1)

    const midDragSelection = await dragBoundary(page, inst, 1, 40)
    // 热区让位（WP2 守卫）：拖动过程中不得同时起框选。
    // 守卫曾读宿主的 inline cursor（恒为空，光标其实挂在 VTable 自建容器上）→ 两个手势同时起手
    expect(midDragSelection).toBe(0)

    const after = await selectedWidth(page, inst, 'row.3.val.a')
    expect(Math.abs(after - (before + 40))).toBeLessThanOrEqual(3)

    // 刷新（草稿自动恢复）后仍是新宽度：模型是单点，不是画布临时效果
    await page.reload()
    await expect(page.locator('.banner')).toContainText('已恢复上次的编辑')
    await expect(page.locator('.preview-host canvas').first()).toBeVisible({ timeout: 15_000 })
    const afterReload = await selectedWidth(page, inst, 'row.3.val.a')
    expect(Math.abs(afterReload - after)).toBeLessThanOrEqual(2)
  })

  test('一次拖动 = 一步撤销：撤销后列宽回原值', async ({ page }) => {
    await openPreset(page, '多列对比表')
    const inst = presetOf('compare-alpha-v1')
    const before = colWidthAt(inst, 1)

    await dragBoundary(page, inst, 1, 40)
    const after = await selectedWidth(page, inst, 'row.3.val.a')
    expect(Math.abs(after - (before + 40))).toBeLessThanOrEqual(3)

    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    const back = await selectedWidth(page, inst, 'row.3.val.a')
    expect(Math.abs(back - before)).toBeLessThanOrEqual(2)
  })
})

test.describe('TC-PT-094 · 表内区块拖动（把手 → 别的槽位）', () => {
  /**
   * 从 (fromX,fromY) 拖到 (toX,toY)。落手前留一帧：
   * dnd-kit 的碰撞判定用的是拖拽浮层（ghost）的矩形，浮层位置每帧才刷新；
   * 连续 mouse.move 之间没有帧边界时，抬起瞬间的矩形还停在起点，落点会判成源槽位。
   */
  async function drag(
    page: import('@playwright/test').Page,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): Promise<void> {
    // 上一轮拖拽的浮层退场动画（dnd-kit drop animation）没走完之前，新的按下不会起拖
    // ——真机上两次拖拽相隔几秒，这里补一拍把测试时序补齐
    await page.waitForTimeout(400)
    await page.mouse.move(from.x, from.y)
    await page.waitForTimeout(50)
    await page.mouse.down()
    // 按下后留一拍再移动：dnd-kit 的激活状态要过一帧才挂上移动监听，
    // 按下与首个移动挤在同一帧里时，这次拖拽根本不启动
    await page.waitForTimeout(60)
    await page.mouse.move(from.x + 40, from.y + 20, { steps: 3 })
    await page.mouse.move(to.x, to.y, { steps: 8 })
    await page.waitForTimeout(120)
    await page.mouse.up()
  }

  /** 把手上到下的顺序（按 y 排序的区块 id），= 区块在表内的上下顺序 */
  async function handleOrder(page: import('@playwright/test').Page): Promise<(string | null)[]> {
    return page.locator('[data-pt-block-id]').evaluateAll((els) =>
      els
        .slice()
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
        .map((e) => e.getAttribute('data-pt-block-id')),
    )
  }

  test('拖到非槽位 → 白话提示不动；拖到另一槽位 → 互换；一步撤销', async ({ page }) => {
    await openPreset(page, '功能矩阵表')
    const inst = presetOf('matrix-v1')
    const handles = page.locator('[data-pt-block-id]')
    await expect(handles).toHaveCount(2)
    // 基线：preset-g1（after-1）在 preset-g2（after-6）上面
    expect(await handleOrder(page)).toEqual(['preset-g1', 'preset-g2'])

    const box = (await page.locator('.preview-host canvas').first().boundingBox())!
    const g1 = (await page.locator('[data-pt-block-id="preset-g1"]').boundingBox())!
    // 把手落在区块行左端、行内垂直居中。期望值来自 buildVisualRows 的算术估计、
    // 实际值来自渲染核权威几何（两者同源但取整路径不同），±6px 容差
    const g1RowCenter = box.y + rowCenterY(inst, 'gap-g1')
    expect(Math.abs(g1.y + g1.height / 2 - g1RowCenter)).toBeLessThanOrEqual(6)

    // ① 拖到普通数据格（不是槽位）→ 提示 + 不动
    const dataCell = cellCenter(inst, 'feat.2.a')
    await drag(
      page,
      { x: g1.x + g1.width / 2, y: g1.y + g1.height / 2 },
      { x: box.x + dataCell.x, y: box.y + dataCell.y },
    )
    await expectToast(page, '请拖到表内虚线槽位')
    expect(await handleOrder(page)).toEqual(['preset-g1', 'preset-g2'])

    // ② 拖到 gap-g2（已占用）→ 两个区块互换
    const target = cellCenter(inst, 'gap-g2')
    const g1b = (await page.locator('[data-pt-block-id="preset-g1"]').boundingBox())!
    await drag(
      page,
      { x: g1b.x + g1b.width / 2, y: g1b.y + g1b.height / 2 },
      { x: box.x + target.x, y: box.y + target.y },
    )
    await expectToast(page, '已换位')
    expect(await handleOrder(page)).toEqual(['preset-g2', 'preset-g1'])
    // 把手跟着区块走：g1 的把手落到 gap-g2 那一行
    const g1After = (await page.locator('[data-pt-block-id="preset-g1"]').boundingBox())!
    expect(
      Math.abs(g1After.y + g1After.height / 2 - (box.y + rowCenterY(inst, 'gap-g2'))),
    ).toBeLessThanOrEqual(6)

    // ③ 一步撤销 → 顺序复原
    await page.keyboard.press('Control+z')
    await expect
      .poll(async () => await handleOrder(page))
      .toEqual(['preset-g1', 'preset-g2'])
  })
})
