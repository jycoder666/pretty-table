import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { expectToast, openPreset, presetOf } from '../e2e/acceptance/helpers'
import { buildVisualRows, colWidthAt, type TemplateInstance } from '../src/core/index'

/**
 * 交互重构批次（WP0～WP4）真机探针 —— 与 T30/T31 沙箱 e2e 的区别是**headed 真浏览器**
 * （真实渲染、真实指针事件、真实系统滚动），证据落盘到 reports/interaction-probe-2026-10-22/。
 *
 * 覆盖用户走查三项抱怨的修复面：
 *  ① 横滚后点选与描边（WP0 / PX-04 v2：命中与叠加层消费渲染器权威几何）
 *  ② 框选 → 合并 → 拆分（WP1 + WP2：可见、可用、有反馈）
 *  ③ 双击就地编辑 + Tab 跳格（WP3）
 *  ④ 列宽拖拽落模型并跨刷新保留 + 表内区块拖动换位（WP4）
 *
 * 运行：pnpm exec playwright test --config manual-verify/playwright.manual.config.ts interaction-probe
 */

const OUT = join(process.cwd(), 'reports', 'interaction-probe-2026-10-22')
mkdirSync(OUT, { recursive: true })
const evidence: Record<string, unknown> = {}
test.afterAll(() => {
  writeFileSync(join(OUT, 'evidence.json'), JSON.stringify(evidence, null, 2), 'utf8')
})

const TOL = 2 // FR-06：允许 1～2px 抗锯齿差

/** 格中心（内容坐标；未横滚时与容器坐标同源） */
function cellCenter(inst: TemplateInstance, slotId: string): { x: number; y: number } {
  const { metas, rowHeights } = buildVisualRows(inst)
  for (let r = 0; r < metas.length; r++) {
    for (let c = 0; c < (metas[r]?.length ?? 0); c++) {
      if (metas[r]![c]?.slotId !== slotId) continue
      let x = 0
      for (let k = 0; k < c; k++) x += colWidthAt(inst, k)
      let y = 0
      for (let k = 0; k < r; k++) y += rowHeights[k] ?? 36
      return { x: x + colWidthAt(inst, c) / 2, y: y + (rowHeights[r] ?? 36) / 2 }
    }
  }
  throw new Error(`slot not found: ${slotId}`)
}

/** 框选：从 from 格中心拖到 to 格中心（位移 >4px 进入拖选） */
async function dragSelect(
  page: Page,
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

const selectedSlot = (page: Page) =>
  page.locator('.preview-host').getAttribute('data-pt-selected-slot')

/** 选中格描边矩形（叠加层；与渲染器几何同源） */
async function overlayRect(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const sel = page.locator('.selection-cell').first()
  await expect(sel).toBeVisible()
  return (await sel.boundingBox())!
}

test.describe('交互重构批次真机探针', () => {
  test('① 横滚后点选：同一点位命中随视口右移一列，描边始终覆盖该点（±2px）', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 720 })
    await openPreset(page, '功能矩阵表')
    const inst = presetOf('matrix-v1')
    const box = (await page.locator('.preview-host canvas').first().boundingBox())!
    expect(box.width).toBeLessThan(820) // 宿主窄于内容：确有横滚

    const { rowHeights } = buildVisualRows(inst)
    const { row } = (() => {
      const { metas } = buildVisualRows(inst)
      for (let r = 0; r < metas.length; r++) {
        for (let c = 0; c < (metas[r]?.length ?? 0); c++) {
          if (metas[r]![c]?.slotId === 'feat.1.b') return { row: r }
        }
      }
      throw new Error('slot not found')
    })()
    let y = 0
    for (let r = 0; r < row; r++) y += rowHeights[r] ?? 36
    const x = 120 + 140 + 140 - 20
    const px = box.x + x
    const py = box.y + y + (rowHeights[row] ?? 36) / 2

    await page.mouse.click(px, py)
    const base = await selectedSlot(page)
    const baseRect = await overlayRect(page)

    await page.mouse.move(px, py)
    await page.mouse.wheel(140, 0) // 横滚一列宽
    await page.waitForTimeout(300)
    await page.mouse.click(px, py)
    const afterScroll = await selectedSlot(page)
    const rect = await overlayRect(page)
    const covers =
      px >= rect.x - TOL &&
      px <= rect.x + rect.width + TOL &&
      py >= rect.y - TOL &&
      py <= rect.y + rect.height + TOL

    evidence.scrollHit = { viewport: '900x720', base, afterScroll, baseRect, rect, covers }
    await page.screenshot({ path: join(OUT, 'probe1-scroll-hit.png') })

    expect(base).toBe('feat.1.b')
    expect(afterScroll).toBe('feat.1.c') // 命中跟随视口，而非内容坐标
    expect(covers).toBe(true) // 描边与命中同源
  })

  test('② 框选 2×2 → 合并（toast）→ 拆分（toast）复原', async ({ page }) => {
    await openPreset(page, '多列对比表')
    const inst = presetOf('compare-alpha-v1')

    await dragSelect(page, inst, 'row.2.val.a', 'row.3.val.b')
    await expect(page.locator('.selection-cell')).toHaveCount(4)
    await expect(page.getByTestId('selection-bar')).toBeVisible()
    const mergeEnabled = await page.getByTestId('selection-merge').isEnabled()
    const splitEnabled = await page.getByTestId('selection-split').isEnabled()
    await page.screenshot({ path: join(OUT, 'probe2-rubber-band.png') })

    await page.getByTestId('selection-merge').click()
    await expectToast(page, '已合并（清除了 3 格内容）')
    const mergedCells = await page.locator('.selection-cell').count()
    await page.screenshot({ path: join(OUT, 'probe2-merged.png') })

    await page.getByTestId('selection-split').click()
    await expectToast(page, '已拆分')
    const splitCells = await page.locator('.selection-cell').count()

    evidence.mergeSplit = { mergeEnabled, splitEnabled, mergedCells, splitCells }
    expect(mergeEnabled).toBe(true)
    expect(splitEnabled).toBe(false)
    expect(mergedCells).toBe(1)
    expect(splitCells).toBe(4)
  })

  test('③ 双击就地编辑改字 + Tab 跳格（键盘导航）', async ({ page }) => {
    await openPreset(page, '多列对比表')
    const inst = presetOf('compare-alpha-v1')
    const box = (await page.locator('.preview-host canvas').first().boundingBox())!
    const p = cellCenter(inst, 'row.3.val.a')
    const canvas = page.locator('.preview-host canvas').first()
    const clickSlot = async (slotId: string) => {
      await canvas.click({ position: cellCenter(inst, slotId) })
      await page.waitForTimeout(80)
    }

    // ① 双击 → 就地输入框出现并聚焦 → 改字 + Enter 提交
    await page.mouse.dblclick(box.x + p.x, box.y + p.y)
    const input = page.getByTestId('inline-editor')
    await expect(input).toBeVisible()
    await expect(input).toBeFocused()
    await page.screenshot({ path: join(OUT, 'probe3-inline-editor.png') })
    await input.fill('真机就地编辑')
    await page.keyboard.press('Enter')
    await expect(input).toHaveCount(0)

    // ② 落库证据：canvas 没有文本节点，故回读靠再开一次输入框。
    // 先点下一行的格把选区挪走——选区工具条浮在选区上沿 38px，会盖住「选区正上方那一行」
    await clickSlot('row.5.val.a')
    await page.mouse.dblclick(box.x + p.x, box.y + p.y)
    const landed = await page.getByTestId('inline-editor').inputValue()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('inline-editor')).toHaveCount(0)
    await page.screenshot({ path: join(OUT, 'probe3-after-edit.png') })

    // ③ Tab 跳格：点 C1R3（此时工具条浮在上一行，不挡本格）→ Tab 右移一格
    await clickSlot('row.3.val.a')
    const beforeTab = await selectedSlot(page)
    await page.keyboard.press('Tab')
    const afterTab = await selectedSlot(page)

    evidence.inlineEdit = { typed: '真机就地编辑', landed, beforeTab, afterTab }
    expect(landed).toBe('真机就地编辑')
    expect(beforeTab).toBe('row.3.val.a')
    expect(afterTab).toBe('row.3.val.b')
  })

  test('④ 列宽拖拽落模型并跨刷新保留 + 表内区块拖动换位', async ({ page }) => {
    test.setTimeout(180_000)
    await openPreset(page, '多列对比表')
    const inst = presetOf('compare-alpha-v1')
    const box = (await page.locator('.preview-host canvas').first().boundingBox())!
    // VTable 的列宽热区归属「边界左侧那一列」（getResizeColAt 口径）：
    // 拖 C1 右缘 = 改 C1 宽度，故量 C1（row.3.val.a）
    const boundaryX = box.x + colWidthAt(inst, 0) + colWidthAt(inst, 1)
    const rowY = box.y + cellCenter(inst, 'row.3.val.b').y

    await page.mouse.move(boundaryX, rowY)
    await page.waitForTimeout(80) // 让渲染器挂上热区光标（col-resize）
    await page.mouse.down()
    await page.mouse.move(boundaryX + 20, rowY, { steps: 4 })
    await page.mouse.move(boundaryX + 40, rowY, { steps: 4 })
    await page.waitForTimeout(150)
    // 热区让位：拖动中（尚未抬手，点击选格还没发生）不得同时起框选。
    // 守卫曾读宿主的 inline cursor（恒为空，光标其实挂在 VTable 自建容器上）→ 两个手势同时起手
    const midDragSelection = await page.locator('.selection-cell').count()
    await page.mouse.up()
    await page.waitForTimeout(300)

    const clickCell = async (slotId: string) => {
      await page
        .locator('.preview-host canvas')
        .first()
        .click({ position: cellCenter(presetOf('compare-alpha-v1'), slotId) })
      return (await overlayRect(page)).width
    }
    const widthAfterDrag = await clickCell('row.3.val.a')
    await page.screenshot({ path: join(OUT, 'probe4-colwidth.png') })

    // 刷新后仍在（模型已落库，不是画布临时效果）
    await page.waitForTimeout(1200)
    await page.reload()
    await expect(page.locator('.preview-host canvas').first()).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(600)
    const widthAfterReload = await clickCell('row.3.val.a')

    // 区块拖动换位（功能矩阵表：preset-g1 ↔ preset-g2）
    await openPreset(page, '功能矩阵表')
    const order = async () => {
      const els = page.locator('[data-pt-block-id]')
      const n = await els.count()
      const rows: Array<[string, number]> = []
      for (let i = 0; i < n; i++) {
        const el = els.nth(i)
        const id = (await el.getAttribute('data-pt-block-id'))!
        rows.push([id, (await el.boundingBox())!.y])
      }
      return rows.sort((a, b) => a[1] - b[1]).map(([id]) => id)
    }
    const before = await order()
    const mInst = presetOf('matrix-v1')
    const g1 = (await page.locator('[data-pt-block-id="preset-g1"]').boundingBox())!
    const target = cellCenter(mInst, 'gap-g2')
    const mBox = (await page.locator('.preview-host canvas').first().boundingBox())!
    await page.mouse.move(g1.x + g1.width / 2, g1.y + g1.height / 2)
    await page.mouse.down()
    await page.mouse.move(g1.x + 40, g1.y + 20, { steps: 3 })
    await page.mouse.move(mBox.x + target.x, mBox.y + target.y, { steps: 8 })
    await page.mouse.up()
    await expectToast(page, '已换位')
    const after = await order()
    await page.screenshot({ path: join(OUT, 'probe4-block-swap.png') })

    evidence.colWidth = { boundaryX, midDragSelection, widthAfterDrag, widthAfterReload }
    evidence.blockSwap = { before, after }
    expect(midDragSelection).toBe(0) // 列宽拖拽不与框选同时起手
    expect(widthAfterDrag).toBeGreaterThan(150) // 拖动生效（模型列宽变了）
    expect(Math.abs(widthAfterReload - widthAfterDrag)).toBeLessThanOrEqual(TOL) // 刷新后仍在
    expect(before).toEqual(['preset-g1', 'preset-g2'])
    expect(after).toEqual(['preset-g2', 'preset-g1'])
  })
})
