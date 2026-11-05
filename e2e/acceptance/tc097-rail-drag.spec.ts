import { expect, test } from '@playwright/test'
import {
  expectToast,
  openPreset,
  railDragToBoundary,
  railItemBox,
  structureSummary,
  T12_VIEWPORTS,
} from './helpers'

/**
 * T12 验收 · tc097 行/列轨道拖拽换位（UX-S12，灵活操作升级 T03/A5）：
 * - 合法拖拽：行轨道项即把手，越 4px 阈值进入拖拽 → 松手换位、内容随行、选择跟随、
 *   Toast「已下移」、一步撤销
 * - 非法拖拽：拖拽中指示线警示色（.rail-drop-line.bad，PRD §5.3「松手会发生什么」预告）→
 *   松手回弹（不移动）+ 白话原因 toast（与 moveGate 同源文案）
 *   · 表头行 →「表头行不能挪动，需要调整请用表头层数」
 *   · 合并区交错（拖行 8 跨过行 3–6 的纵向合并区）→「这一行和合并区交错，挪不动——先拆开合并区再试」
 * - 4px 阈值内仍是点选（不误拖）
 * - 列拖拽：D 列拖到 B 列之前（合法），键盘选格槽 id 验证「内容随列」
 * 内容随行/随列验证口径（2026-11 门禁修复）：不用导出 HTML——webkit 写剪贴板被拒时
 * 应用走 manusl 复制框路径、exportedHtml 读回 flaky；改用键盘网格步进（selectCellByKeys，
 * 无像素依赖、双视口同构）走到移动后的位置断言 data-pt-selected-slot 槽 id，整行/列随行
 * 等价证据（槽属于原行/列）。
 * 关键断言 1200×800 与 390×844 双视口；列拖拽仅桌面（390 视口表格横滚、列项被 .rail-clip
 * 裁剪出可视条，指针命中不了被裁剪元素——物理限制非行为差异，偏差记录）。
 * 模板：多列对比表（compare-alpha-v1）。行号 0 基；表头 2 层（idx0/1），内容行 idx2–9；
 * 用户合并区 [2,1]-[5,1]/[2,2]-[5,2]/[2,3]-[5,3]（行 3–6 纵向三列并块）。
 */

const SUMMARY = '10 行 × 4 列 · 2 层表头'
const ROW_MOVE_BLOCKED = '表头行不能挪动，需要调整请用表头层数'
const ROW_MERGE_CROSS = '这一行和合并区交错，挪不动——先拆开合并区再试'

for (const { width, height } of T12_VIEWPORTS) {
  const vp = `${width}×${height}`

  test.describe(`UX-S12 · 行拖拽（${vp}）`, () => {
    test('合法：拖第 3 行到第 5 行下方 → 内容随行、选择跟随、一步撤销', async ({ page }) => {
      await page.setViewportSize({ width, height })
      await openPreset(page, '多列对比表')

      // 行 3（idx2）→ 插入边界 5（idx4 之后）→ to = 4
      await railDragToBoundary(page, 'row', 2, 5, 9)

      // 选择跟随（to=4）
      await expectToast(page, '已下移')
      await expect(page.locator('.preview-host')).toHaveAttribute('data-pt-structural', 'row:4')
      // 内容随行：原行 3（idx2）整体走到行 5（idx4）位置。Esc 退出结构选择回首格 [4,0]，
      // 右移一格到 [4,1] 应选中原「核心指标」行的槽（整行随行走的槽 id 证据）
      await page.locator('[data-testid="preview-canvas"]').focus()
      await page.keyboard.press('Escape')
      await page.keyboard.press('ArrowRight')
      await expect(page.locator('.preview-host')).toHaveAttribute(
        'data-pt-selected-slot',
        'row.2.val.a',
      )

      // 一步撤销复原：selectedSlotId 是壳状态不随 undo 自动同步——移开再移回触发
      // syncPanelToRange，重新读 [4,1] 现属槽
      await page.locator('[data-testid="preview-canvas"]').focus()
      await page.keyboard.press('Control+z')
      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('ArrowRight')
      await expect(page.locator('.preview-host')).toHaveAttribute(
        'data-pt-selected-slot',
        'row.4.val.a',
      )
    })

    test('非法（表头行）：拖拽中警示指示线 → 松手回弹 + 白话原因', async ({ page }) => {
      await page.setViewportSize({ width, height })
      await openPreset(page, '多列对比表')

      // 拖表头行 1（idx0）到边界 3：moveGate from<headerLevels → 拦
      await railDragToBoundary(page, 'row', 0, 3, 9, {
        hold: async () => {
          await expect(page.locator('.rail-drop-line')).toBeVisible()
          await expect(page.locator('.rail-drop-line.bad')).toHaveCount(1)
        },
      })
      await expectToast(page, ROW_MOVE_BLOCKED)
      // 回弹：不移动（行数不变 + 指示线消失）
      await expect(page.locator('.rail-drop-line')).toHaveCount(0)
      await expect(structureSummary(page)).toHaveText(SUMMARY)
    })

    test('非法（合并区交错）：警示指示线 → 松手回弹 + 交错原因', async ({ page }) => {
      await page.setViewportSize({ width, height })
      await openPreset(page, '多列对比表')

      // 行 8（idx7）上拖到边界 3：把行 3–6 纵向合并区打散 → 拦
      await railDragToBoundary(page, 'row', 7, 3, 9, {
        hold: async () => {
          await expect(page.locator('.rail-drop-line.bad')).toHaveCount(1)
        },
      })
      await expectToast(page, ROW_MERGE_CROSS)
      await expect(page.locator('.rail-drop-line')).toHaveCount(0)
      await expect(structureSummary(page)).toHaveText(SUMMARY)
    })

    test('4px 阈值内仍是点选（不误拖、无指示线）', async ({ page }) => {
      await page.setViewportSize({ width, height })
      await openPreset(page, '多列对比表')

      const box = await railItemBox(page, 'row', 3)
      const cx = box.x + box.width / 2
      const cy = box.y + box.height / 2
      await page.mouse.move(cx, cy)
      await page.mouse.down()
      await page.mouse.move(cx + 3, cy + 3) // 位移 3px < 4px 阈值
      await expect(page.locator('.rail-drop-line')).toHaveCount(0)
      await page.mouse.up()
      // 点选生效：整行选中
      await expect(page.locator('.preview-host')).toHaveAttribute('data-pt-structural', 'row:3')
      await expect(structureSummary(page)).toHaveText(SUMMARY)
    })
  })
}

test.describe('UX-S12 · 列拖拽（仅 1200×800，偏差见文件头）', () => {
  test('合法：D 列拖到 B 列之前 → 内容随列、选择跟随、一步撤销', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 })
    await openPreset(page, '多列对比表')

    // D 列（idx3）→ 插入边界 1（B 列之前）→ to = 1
    await railDragToBoundary(page, 'col', 3, 1, 3)

    // 选择跟随（to=1）
    await expectToast(page, '已左移')
    await expect(page.locator('.preview-host')).toHaveAttribute('data-pt-structural', 'col:1')
    // 内容随列：D 列（含「3 个工作日」等槽）整体走到 B 列位置。Esc 退出结构选择回首格 [0,1]，
    // 下移两行到 [2,1] 应选中原 D 列的标记槽（整列随行走的槽 id 证据）
    await page.locator('[data-testid="preview-canvas"]').focus()
    await page.keyboard.press('Escape')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('.preview-host')).toHaveAttribute(
      'data-pt-selected-slot',
      'row.2.val.c',
    )

    // 一步撤销复原：selectedSlotId 是壳状态不随 undo 自动同步——移开再移回触发
    // syncPanelToRange，重新读 [2,1] 现属槽
    await page.locator('[data-testid="preview-canvas"]').focus()
    await page.keyboard.press('Control+z')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('.preview-host')).toHaveAttribute(
      'data-pt-selected-slot',
      'row.2.val.a',
    )
  })
})
