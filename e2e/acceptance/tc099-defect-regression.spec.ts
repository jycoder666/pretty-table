import { expect, test } from '@playwright/test'
import {
  clickRailItem,
  expectToast,
  openBlankEditor,
  openPreset,
  railItemBox,
  selectCellByKeys,
  structureSummary,
  T12_VIEWPORTS,
} from './helpers'

/**
 * T12 验收 · tc099 缺陷回归与走查（UX-S14 / UX-S15 / UX-S16）：
 * - UX-S15（缺陷①）：删含内容行确认框同屏恰好 1 个（ConfirmDialog 双挂载回归）、
 *   Esc 一次关闭、焦点归还画布
 * - UX-S15（缺陷②）：window 滚动后已打开的结构菜单实时重锚——菜单 rect 与轨道项 rect
 *   相对偏差 ≤2px（rAF 合帧重算；修复前菜单 fixed 定位不跟滚 → 偏差 = 滚动量）
 * - UX-S14（T05）：合并跨度新上限 6/8/30 的 e2e 小样本——7 行跨度置灰 + 白话提示
 *   「一次最多合并 6 行或 8 列」、6 行可合并、一步撤销；列轴 8/9 与 30 处数量闸
 *   不走 e2e（9 列画布横溢不可框选/30 次 UI 合并代价过高，mergeGuard.spec 参数化矩阵
 *   与夹具已覆盖，tc092 文件头有同款偏差记录）
 * - UX-S16（T09/T11）：全局 :focus-visible 焦点环（Tab 后 outline 2px solid + offset 2px）、
 *   390×844 触控命中区 ≥44×44（rail-mini / menu-item / 轨道序号项命中外扩）
 * 关键断言 1200×800 与 390×844 双视口（命中区用例按定义只在 390×844）。
 */

const SUMMARY_BLANK_12x4 = '12 行 × 4 列 · 1 层表头'

for (const { width, height } of T12_VIEWPORTS) {
  const vp = `${width}×${height}`

  test.describe(`UX-S15 · 确认框单挂载（${vp}）`, () => {
    test('删含内容行：同屏 confirm-overlay 恰 1 个、Esc 一次关闭、焦点归还画布', async ({
      page,
    }) => {
      await page.setViewportSize({ width, height })
      await openPreset(page, '多列对比表')

      // 行 4（idx3）含内容 → 确认框路径
      await clickRailItem(page, 'row', 3)
      await page.locator('[data-testid="rail-row-menu-3"]').click()
      await page.getByTestId('menu-row-remove').click()
      const overlay = page.locator('[data-testid="confirm-overlay"]')
      await expect(overlay).toHaveCount(1)

      // Esc 一次关闭（修复前双挂载 = 双 overlay、Esc 需两次）
      await page.keyboard.press('Escape')
      await expect(overlay).toHaveCount(0)
      // 焦点归还画布（confirm.ts returnFocusEl = 打开瞬间的 activeElement = returnFocusToCanvas 后的画布）
      await expect
        .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-testid')))
        .toBe('preview-canvas')

      // 同一条确认路径走通：再开再确认 → 删除成功（一次交互不卡死）
      await clickRailItem(page, 'row', 3)
      await page.locator('[data-testid="rail-row-menu-3"]').click()
      await page.getByTestId('menu-row-remove').click()
      await expect(overlay).toHaveCount(1)
      await page.getByTestId('confirm-ok').click()
      await expectToast(page, '已删除第 4 行')
      await expect(structureSummary(page)).toHaveText('9 行 × 4 列 · 2 层表头')
      await page.locator('[data-testid="preview-canvas"]').focus()
      await page.keyboard.press('Control+z')
      await expect(structureSummary(page)).toHaveText('10 行 × 4 列 · 2 层表头')
    })
  })

  test.describe(`UX-S15 · window 滚动菜单重锚（${vp}）`, () => {
    test('window 滚动后菜单 rect 与轨道项 rect 相对偏差 ≤2px', async ({ page }) => {
      await page.setViewportSize({ width, height })
      await openPreset(page, '多列对比表')

      // 打开行 3（idx2）结构菜单
      await clickRailItem(page, 'row', 2)
      await page.locator('[data-testid="rail-row-menu-2"]').click()
      const menu = page.getByRole('menu', { name: '行操作菜单' })
      await expect(menu).toBeVisible()

      // 编辑台是 100vh 固定布局，window 平时不滚——注入页高制造真实 window 滚动
      await page.evaluate(() => {
        document.body.style.height = '3000px'
      })
      await page.evaluate(() => window.scrollTo(0, 120))

      // 相对偏差：菜单（fixed，靠重锚才跟滚）vs 轨道项（随页滚走）——轮询等 rAF 合帧重算落定，
      // 口径按 T07 验收：偏差 ≤2px（渲染核权威几何与菜单定位取整路径差异）
      await expect
        .poll(
          async () => {
            const m = (await menu.boundingBox())!
            const label = await railItemBox(page, 'row', 2)
            return Math.max(Math.abs(m.x - (label.x + label.width)), Math.abs(m.y - label.y))
          },
          { timeout: 5000 },
        )
        .toBeLessThanOrEqual(2)
    })
  })

  test.describe(`UX-S14 · 合并跨度上限（${vp}）`, () => {
    test('空白 12 行：7 行跨度置灰并提示、6 行可合并、一步撤销', async ({ page }) => {
      await page.setViewportSize({ width, height })
      await openBlankEditor(page, 12, 4, 1)
      await expect(structureSummary(page)).toHaveText(SUMMARY_BLANK_12x4)

      // 选 R0–R6（7 行跨度）：键盘起步 [0,0]（空白表无结构合并区，不会被吸回）→ 右移到 u2
      // → Shift+↓×6；键盘网格步进无像素依赖，双视口同构（390 下像素点击不可靠，见 tc098 文件头）
      await selectCellByKeys(page, ['ArrowRight'], 'u2')
      await page.locator('[data-testid="preview-canvas"]').focus()
      for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowDown')

      // 7 行跨度：置灰 + 白话提示（数字随常量走：6/8）
      const mergeBtn = page.getByTestId('selection-merge')
      await expect(mergeBtn).toBeDisabled()
      await mergeBtn.hover()
      await expect(page.locator('.pt-tooltip-content')).toContainText('一次最多合并 6 行或 8 列')

      // 收回一行 → 跨度恰 6 → 可合并
      await page.locator('[data-testid="preview-canvas"]').focus()
      await page.keyboard.press('Shift+ArrowUp')
      await expect(mergeBtn).toBeEnabled()
      await mergeBtn.click()
      await expectToast(page, /已合并/)

      // 一步撤销
      await page.locator('[data-testid="preview-canvas"]').focus()
      await page.keyboard.press('Control+z')
      await expect(mergeBtn).toBeEnabled()
    })
  })

  test.describe(`UX-S16 · 焦点环（${vp}）`, () => {
    test('Tab 后焦点环可见：outline 2px solid + offset 2px（--pt-primary）', async ({ page }) => {
      await page.setViewportSize({ width, height })
      await openPreset(page, '多列对比表')
      await page.keyboard.press('Tab')
      const focus = await page.evaluate(() => {
        const el = document.activeElement
        const cs = el ? getComputedStyle(el) : null
        return {
          tag: el?.tagName ?? '',
          width: cs?.outlineWidth ?? '',
          style: cs?.outlineStyle ?? '',
          offset: cs?.outlineOffset ?? '',
        }
      })
      expect(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA']).toContain(focus.tag)
      expect(focus.style).toBe('solid')
      expect(parseFloat(focus.width)).toBeGreaterThanOrEqual(2)
      expect(parseFloat(focus.offset)).toBeGreaterThanOrEqual(2)
    })
  })
}

test.describe('UX-S16 · 390×844 触控命中区 ≥44×44（按定义仅触屏视口）', () => {
  test('rail-mini 44×44、菜单项高 ≥44、轨道序号项命中外扩 8px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openPreset(page, '多列对比表')

    // 选中序号项 → 浮现工具条（+ / …）→ 命中区 ≥44×44（视觉不变、命中撑足）
    await clickRailItem(page, 'row', 2)
    const plus = (await page.getByTestId('rail-row-plus-2').boundingBox())!
    const dots = (await page.getByTestId('rail-row-menu-2').boundingBox())!
    expect(plus.width).toBeGreaterThanOrEqual(44)
    expect(plus.height).toBeGreaterThanOrEqual(44)
    expect(dots.width).toBeGreaterThanOrEqual(44)
    expect(dots.height).toBeGreaterThanOrEqual(44)

    // 结构菜单项命中高 ≥44
    await page.locator('[data-testid="rail-row-menu-2"]').click()
    const item = (await page.getByTestId('menu-row-after').boundingBox())!
    expect(item.height).toBeGreaterThanOrEqual(44)
    await page.keyboard.press('Escape') // 关菜单（焦点在菜单内 → Esc 关闭）

    // 轨道序号项命中区外扩（::after inset -8px）：上缘外 6px 处 elementFromPoint 仍是该序号项
    const label = await railItemBox(page, 'row', 2)
    const hit = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y)
      return el?.getAttribute('data-testid') ?? ''
    }, { x: label.x + label.width / 2, y: label.y - 6 })
    expect(hit).toBe('rail-row-2')
  })
})
