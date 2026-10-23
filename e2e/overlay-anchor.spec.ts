import { expect, test } from '@playwright/test'
import { openPreset } from './acceptance/helpers'

/**
 * BugFix 回归 · 叠加层锚点与格子几何同源（T03 居中布局）：
 * rect 坐标系原点 = .vtable-root，叠加层（描边/选区工具条/区块把手）定位系 =
 * .preview-host padding box——换算必须加 offsetLeft/Top。旧布局 offset 恒 0 掩盖了
 * 该换算；窄表居中（offsetLeft > 0）后漏加偏移的叠加层整体左移出表格左缘、盖住行轨道。
 * 断言口径：叠加层贴合被点击的格（点击点落在描边内）；工具条/把手不越过表格左缘。
 * （QA 可将本用例并入 tc095 的 UX-S07 断言组。）
 */
test.describe('BugFix · 叠加层锚点同源（居中布局回归）', () => {
  test('点击数据格：描边/工具条贴合被点格，区块把手不漂出表格', async ({ page }) => {
    await openPreset(page, '多列对比表')

    // 布局前提：窄表（多列对比 4 列）触发 mount 元素居中，offsetLeft 必须非 0
    const offsetLeft = await page.evaluate(
      () => document.querySelector('.vtable-root')?.offsetLeft ?? 0,
    )
    expect(offsetLeft).toBeGreaterThan(0)

    // 点击表体 [1,1]（避开 [0,0]-[1,0] 结构合并区与表头合并区）：x 取第 2 列中段，y 取首内容行中段
    const canvas = page.locator('.preview-host canvas').first()
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    const clickX = box!.x + 180
    const clickY = box!.y + 54
    await page.mouse.click(clickX, clickY)
    await expect(page.locator('[data-testid="selection-bar"]')).toBeVisible()

    // 描边覆盖住点击点（±15px：2px 描边 + 命中留量；错位 271px 级必被抓住）
    const sel = await page.locator('.selection-cell').first().boundingBox()
    expect(sel).not.toBeNull()
    expect(Math.abs(sel!.x + sel!.width / 2 - clickX)).toBeLessThan(15)
    expect(Math.abs(sel!.y + sel!.height / 2 - clickY)).toBeLessThan(15)

    // 工具条不越过表格左缘（不再盖住行轨道区）
    const rootLeft = await page.evaluate(
      () => document.querySelector('.vtable-root')!.getBoundingClientRect().left,
    )
    const tb = await page.locator('[data-testid="selection-bar"]').boundingBox()
    expect(tb!.x).toBeGreaterThanOrEqual(rootLeft - 4)

    // 区块把手同样贴合表格横跨范围（漏加/反加偏移即漂出；compare-alpha 预置 groupHeader 区块）
    const handle = page.locator('[data-pt-block-id]').first()
    await expect(handle).toBeVisible()
    const hb = await handle.boundingBox()
    expect(hb!.x).toBeGreaterThanOrEqual(rootLeft - 4)
    expect(hb!.x).toBeLessThan(box!.x + box!.width)
  })
})
