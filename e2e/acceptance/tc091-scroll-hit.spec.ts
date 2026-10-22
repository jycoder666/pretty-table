import { expect, test } from '@playwright/test'
import { buildVisualRows, colWidthAt } from '../../src/core/index'
import { clickSlot, openPreset, presetOf, slotVisualPos } from './helpers'

/**
 * T31 验收 · TC-PT-091（WP0 / PX-04 v2）· 宽表横滚后的命中与描边几何
 *
 * 背景：VTable 内部横滚（窄视口 + 宽内容，宿主自身不横滚，见 TC-072），
 * 而壳层历史几何是「内容坐标」纯算术 → 横滚后点选/描边整体偏移 scrollLeft，
 * 表现为「点不准、高亮错位、落点错格」。
 * 修复：命中直接问渲染器（getCellAtRelativePosition），描边/落点用
 * getCellRelativeRect（均滚动/冻结列/列宽调整感知）。
 *
 * 断言口径（TC-PT-091）：
 *  ① 未滚动：点 P → 选中 C2 的槽（基线）
 *  ② 横滚一列宽：点同一屏幕点 P → 选中右移一列（命中跟随视口，而非内容坐标）
 *  ③ 描边矩形始终覆盖点 P（±2px，FR-06 容差）——描边与命中同源
 *  ④ 滚回原位：点 P 复原选中基线槽（往返一致，排除「滚歪了」的假通过）
 */

const TOL = 2
/** 横滚步长 = 一列宽（矩阵模板 C1–C5 均为 140），保证「同一点命中右移一列」 */
const STEP = 140

test.describe('TC-PT-091 · 宽表横滚后点选与描边不漂移', () => {
  test('横滚前后同一点位命中随视口变化，描边与命中同源（±2px）', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 720 })
    await openPreset(page, '功能矩阵表')
    const inst = presetOf('matrix-v1')
    const canvas = page.locator('.preview-host canvas').first()
    const box = (await canvas.boundingBox())!
    // 前置条件：宿主窄于内容（需要横滚）且宽于探测点（点得进去）
    expect(box.width).toBeLessThan(820)
    expect(box.width).toBeGreaterThan(400)

    const { rowHeights } = buildVisualRows(inst)
    const { row, col } = slotVisualPos(inst, 'feat.1.b') // C2：视觉行 3（R0 + gap + R1 之后）
    let y = 0
    for (let r = 0; r < row; r++) y += rowHeights[r] ?? 36
    // 探测点：C2 右缘内缩 20px（横滚一列后该点落在 C3 右缘附近，
    // 与「错位一列」的错误几何不重叠 → 能区分对错）
    const x = 120 + 140 + 140 - 20
    const py = box.y + y + (rowHeights[row] ?? 36) / 2
    const px = box.x + x

    const selected = () => page.locator('.preview-host').getAttribute('data-pt-selected-slot')
    const overlayContains = async () => {
      const sel = page.locator('.selection-cell').first()
      await expect(sel).toBeVisible()
      const sb = (await sel.boundingBox())!
      return {
        hit: px >= sb.x - TOL && px <= sb.x + sb.width + TOL && py >= sb.y - TOL && py <= sb.y + sb.height + TOL,
        rect: sb,
      }
    }

    // ① 基线：未滚动点 P → feat.1.b，描边覆盖 P
    await page.mouse.click(px, py)
    await expect(page.locator('[data-testid="slot-headline"]')).toBeVisible()
    expect(await selected()).toBe('feat.1.b')
    expect((await overlayContains()).hit).toBe(true)

    // ② 横滚一列宽：同一点 P → 命中右移一列（C3 = feat.1.c）
    await page.mouse.move(px, py)
    await page.mouse.wheel(STEP, 0)
    await page.waitForTimeout(300)
    await page.mouse.click(px, py)
    expect(await selected()).toBe('feat.1.c')

    // ③ 描边仍覆盖 P：命中与描边同源（错位一列的几何在此处会失败）
    const after = await overlayContains()
    expect(after.hit).toBe(true)

    // ④ 滚回原位 → 复原基线选中（排除「滚过头/滚歪」导致的假通过）
    await page.mouse.wheel(-STEP, 0)
    await page.waitForTimeout(300)
    await page.mouse.click(px, py)
    expect(await selected()).toBe('feat.1.b')

    // 冻结首列不参与横滚：仍可点中 C0 的槽
    await clickSlot(page, inst, 'feat.1.label')
    expect(await selected()).toBe('feat.1.label')
    expect(col).toBe(2) // 记录探测列（C2），列宽口径与 STEP 同源
    expect(colWidthAt(inst, col)).toBe(STEP)
  })
})
