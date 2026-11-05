import { expect, test } from '@playwright/test'
import {
  clickRailItem,
  expectStructural,
  expectToast,
  openPreset,
  presetOf,
  rangeImpactSummaryParts,
  shiftClickRailItem,
  structureSummary,
  T12_VIEWPORTS,
} from './helpers'

/**
 * T12 验收 · tc096 结构批量操作（UX-S11 / UX-S11b，灵活操作升级 T02）：
 * - UX-S11：行轨道 Shift+点选建立区间 → 菜单「删除所选 3 行」→ 含内容一次确认框、
 *   摘要为区间聚合口径（三计数与 core previewStructuralRange 同源核对）→
 *   一次删除 + Toast 写明区间 + 一步撤销完全复原
 * - UX-S11b：选 3 行 → 菜单「后插 3 行」→ 一次插入 3 行且一次撤销全部消失
 * - 区间守卫：区间含表头行 → 删除置灰并给白话原因；Esc 退出区间回首格（PRD §5.1）
 * 关键断言一律 1200×800 与 390×844 双视口（T12_VIEWPORTS）。
 * 模板：多列对比表（compare-alpha-v1）表头 2 层——内容行从逻辑行 2（1 基第 3 行）起，
 * UX-S11 的「第 2–4 行」示例换算为模板上的第 3–5 行（区间 row:2-4，Toast「已删除第 3–5 行」）。
 */

const COMPARE = 'compare-alpha-v1'
const SUMMARY_10 = '10 行 × 4 列 · 2 层表头'
const SUMMARY_7 = '7 行 × 4 列 · 2 层表头'
const SUMMARY_13 = '13 行 × 4 列 · 2 层表头'

for (const { width, height } of T12_VIEWPORTS) {
  const vp = `${width}×${height}`

  test.describe(`UX-S11 · 区间删除（${vp}）`, () => {
    test('Shift 选 3 行 → 确认框摘要区间聚合 → 一次删除 → 一步撤销复原', async ({ page }) => {
      const inst = presetOf(COMPARE)
      await page.setViewportSize({ width, height })
      await openPreset(page, '多列对比表')

      // 区间建立：锚点第 3 行（idx2）→ Shift 点第 5 行（idx4）
      await clickRailItem(page, 'row', 2)
      await shiftClickRailItem(page, 'row', 4)
      await expectStructural(page, 'row:2-4')
      // 区间高亮覆盖 3 项
      for (const i of [2, 3, 4]) {
        await expect(page.locator(`[data-testid="rail-row-${i}"].on`)).toHaveCount(1)
      }

      // 菜单作用于整个区间（区间起点 … 打开），「删除所选 3 行」可用
      await page.locator('[data-testid="rail-row-menu-2"]').click()
      const removeBtn = page.getByTestId('menu-row-remove')
      await expect(removeBtn).toBeEnabled()

      // 含内容区间：一次确认框（同屏恰 1 个），摘要 = 区间聚合三计数
      await removeBtn.click()
      const overlay = page.locator('[data-testid="confirm-overlay"]')
      await expect(overlay).toHaveCount(1)
      await expect(page.getByTestId('confirm-title')).toHaveText('删除第 3–5 行')
      // 摘要与核内 previewStructuralRange 同源核对（跨区间合并区只计一次、filled 求和；0 计数不出现）
      const message = page.getByTestId('confirm-message')
      for (const part of rangeImpactSummaryParts(inst, 'row', 2, 4)) {
        await expect(message).toContainText(part)
      }
      await expect(message).toContainText('确定删除？')

      // 取消无变化
      await page.getByTestId('confirm-cancel').click()
      await expect(overlay).toHaveCount(0)
      await expect(structureSummary(page)).toHaveText(SUMMARY_10)

      // 确认 → 一次删除 3 行（降序批，一批一快照）
      await page.locator('[data-testid="rail-row-menu-2"]').click()
      await page.getByTestId('menu-row-remove').click()
      await page.getByTestId('confirm-ok').click()
      await expectToast(page, '已删除第 3–5 行')
      await expect(structureSummary(page)).toHaveText(SUMMARY_7)

      // 一步撤销完全复原
      await page.locator('[data-testid="preview-canvas"]').focus()
      await page.keyboard.press('Control+z')
      await expect(structureSummary(page)).toHaveText(SUMMARY_10)
    })

    test('区间含表头行 → 删除置灰并说明；Esc 退出区间回首格', async ({ page }) => {
      await page.setViewportSize({ width, height })
      await openPreset(page, '多列对比表')

      // 表头行（idx0）锚点 → 区间 [0, 2] 覆盖表头 → 删除禁用
      await clickRailItem(page, 'row', 0)
      await shiftClickRailItem(page, 'row', 2)
      await expectStructural(page, 'row:0-2')
      await page.locator('[data-testid="rail-row-menu-0"]').click()
      const removeBtn = page.getByTestId('menu-row-remove')
      await expect(removeBtn).toBeDisabled()
      // 白话原因（aria-label = 「删除所选 3 行：原因」；码不外露）
      await expect(removeBtn).toHaveAttribute('aria-label', /删除所选 3 行/)

      // Esc 两段：菜单开着 → 第一段先关菜单（菜单内 Esc）；第二段退出区间回首格
      // （锚点行落单元格选择 → data-pt-structural 清空）
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')
      await expectStructural(page, '')
    })
  })

  test.describe(`UX-S11b · 区间插入（${vp}）`, () => {
    test('后插 3 行一次完成、区间选中新行组、一次撤销全部消失', async ({ page }) => {
      await page.setViewportSize({ width, height })
      await openPreset(page, '多列对比表')

      // 选第 3–5 行（idx2–4）→ 菜单「后插 3 行」= 一次插入 3 个新行
      await clickRailItem(page, 'row', 2)
      await shiftClickRailItem(page, 'row', 4)
      await page.locator('[data-testid="rail-row-menu-2"]').click()
      const afterBtn = page.getByTestId('menu-row-after')
      await expect(afterBtn).toBeEnabled()
      await expect(afterBtn).toHaveText(/后插 3 行/)
      await afterBtn.click()

      // 一次动作：Toast 写明数量与位置；新行组整体选中（insertAt=5 → row:5-7）
      await expectToast(page, '已在第 6 行下方插入 3 行')
      await expect(structureSummary(page)).toHaveText(SUMMARY_13)
      await expectStructural(page, 'row:5-7')

      // 一步撤销全部消失
      await page.locator('[data-testid="preview-canvas"]').focus()
      await page.keyboard.press('Control+z')
      await expect(structureSummary(page)).toHaveText(SUMMARY_10)
    })
  })
}
