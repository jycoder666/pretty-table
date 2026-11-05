import { expect, test } from '@playwright/test'
import {
  canvasSlotPoint,
  clickSlot,
  expectToast,
  openPreset,
  pasteBarText,
  pasteClipboard,
  PNG_1PX,
  presetOf,
  selectCellByKeys,
  T12_VIEWPORTS,
} from './helpers'

/**
 * T12 验收 · tc098 图片格双击替换（UX-S13，灵活操作升级 T04/A6）：
 * - 双击图片格 → 系统文件选择器唤起（filechooser）+ 该格进入选中态 →
 *   换图走核内三连闸（写入链零新逻辑）→ 成功一步撤销
 * - 键盘 Enter 落图片格 → 白话提示「图片格请在右栏换图」、不弹文件选择器（A12-6 来源分流）
 * - 双击标记格 → 白话拒绝文案不变、无文件选择器
 * - 粘贴预览期双击忽略（守卫口径）；格式闸：不支持文件 → errorCopy 白话 toast、格不变
 * 视口分工（偏差记录，tc092 文件头同款口径）：双击类断言依赖画布像素定位，390×844 下
 * VTable 拆多 canvas（冻结列 32px 画布在前）+ 横滚使 first-canvas 坐标不可靠（×10 实证
 * `.preview-host canvas` first 命中 32px 冻结画布、点位被 .props 面板拦截）——双击类仅
 * 1200×800；键盘 Enter 路径（UX-S13 来源分流核心）用键盘选格（selectCellByKeys，无像素
 * 依赖）跑双视口。
 * 造图路径：右栏「上传图片」（image-file）先把 row.3.val.a 从文字格变成图片格。
 */

const COMPARE = 'compare-alpha-v1'
const IMAGE_HINT = '图片格请在右栏换图'
const TYPED_HINT = '这一格请在右栏改数值或标记'

/** 右栏上传把 row.3.val.a 变成图片格（三连闸合法样本：1×1 PNG；桌面像素点击选格） */
async function makeImageCell(page: import('@playwright/test').Page, inst: ReturnType<typeof presetOf>): Promise<void> {
  await clickSlot(page, inst, 'row.3.val.a')
  await expect(page.getByTestId('image-area')).toBeVisible()
  await page.getByTestId('image-file').setInputFiles(PNG_1PX)
  await expect(page.getByTestId('image-thumb')).toBeVisible()
}

/** 键盘导航版造图（cellNav 纯网格步进，双视口通用）：出块 → 下到第 4 行 C 列 → 右栏上传 */
async function makeImageCellByKeys(page: import('@playwright/test').Page): Promise<void> {
  await selectCellByKeys(page, ['ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowDown'], 'row.3.val.a')
  await expect(page.getByTestId('image-area')).toBeVisible()
  await page.getByTestId('image-file').setInputFiles(PNG_1PX)
  await expect(page.getByTestId('image-thumb')).toBeVisible()
}

for (const { width, height } of T12_VIEWPORTS) {
  const vp = `${width}×${height}`

  test.describe(`UX-S13 · 键盘 Enter 不弹选择器（${vp}）`, () => {
    test('Enter 落图片格：白话提示「图片格请在右栏换图」、无 filechooser', async ({ page }) => {
      await page.setViewportSize({ width, height })
      await openPreset(page, '多列对比表')
      await makeImageCellByKeys(page)

      // 选中图片格后按 Enter（键盘来源 viaKeyboard=true）
      await page.locator('[data-testid="preview-canvas"]').focus()
      await page.keyboard.press('Enter')
      await expectToast(page, IMAGE_HINT)
      const fired = await page
        .waitForEvent('filechooser', { timeout: 500 })
        .then(
          () => true,
          () => false,
        )
      expect(fired).toBe(false)
    })
  })
}

test.describe('UX-S13 · 双击与守卫/闸门（仅 1200×800，偏差见文件头）', () => {
  test('双击图片格：文件选择器唤起 + 格选中 → 换图成功一步撤销', async ({ page }) => {
    const inst = presetOf(COMPARE)
    await page.setViewportSize({ width: 1200, height: 800 })
    await openPreset(page, '多列对比表')
    await makeImageCell(page, inst)

    // 双击图片格 → filechooser 唤起 + 格选中
    const pt = canvasSlotPoint(inst, 'row.3.val.a')
    const canvas = page.locator('.preview-host canvas').first()
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      canvas.dblclick({ position: { x: pt.x, y: pt.y } }),
    ])
    await expect(page.locator('.preview-host')).toHaveAttribute(
      'data-pt-selected-slot',
      'row.3.val.a',
    )

    // 换图走三连闸（同一合法 PNG 再放一张）→ 成功无拒绝 toast
    await chooser.setFiles(PNG_1PX)
    await expect(page.getByTestId('image-thumb')).toBeVisible()

    // 成功一步撤销：一次撤销退掉「这次换图」（右栏首次上传是另一张快照，仍在）
    await page.locator('[data-testid="preview-canvas"]').focus()
    await page.keyboard.press('Control+z')
    await expect(page.getByTestId('image-thumb')).toBeVisible()
    // 再退一次回到上传前的文字格「1 个工作日」（每次设图都是独立一步）
    await page.keyboard.press('Control+z')
    await expect(page.getByTestId('image-thumb')).toHaveCount(0)
    await clickSlot(page, inst, 'row.3.val.a')
    await expect(page.locator('[data-testid="slot-headline"]')).toContainText('1 个工作日')
  })

  test('双击标记格：白话拒绝文案不变、无文件选择器', async ({ page }) => {
    const inst = presetOf(COMPARE)
    await page.setViewportSize({ width: 1200, height: 800 })
    await openPreset(page, '多列对比表')

    const pt = canvasSlotPoint(inst, 'row.2.val.a')
    const canvas = page.locator('.preview-host canvas').first()
    await canvas.dblclick({ position: { x: pt.x, y: pt.y } })
    await expectToast(page, TYPED_HINT)
    const fired = await page
      .waitForEvent('filechooser', { timeout: 500 })
      .then(
        () => true,
        () => false,
      )
    expect(fired).toBe(false)
  })

  test('粘贴预览期双击忽略：无文件选择器、无就地编辑、预览条不破', async ({ page }) => {
    const inst = presetOf(COMPARE)
    await page.setViewportSize({ width: 1200, height: 800 })
    await openPreset(page, '多列对比表')
    await makeImageCell(page, inst)

    // 进粘贴预览
    await clickSlot(page, inst, 'row.4.label')
    await pasteClipboard(page, { text: 'P1\tP2\nP3\tP4' })
    await expect(pasteBarText(page)).toBeVisible()

    // 双击落点被守卫层覆盖（元素命中 = paste-guard）——「粘贴预览期双击忽略」的守卫机制：
    // 画布收不到双击；原生 mouse 双击后无 filechooser、无就地编辑
    const pt = canvasSlotPoint(inst, 'row.3.val.a')
    const canvas = page.locator('.preview-host canvas').first()
    const box = (await canvas.boundingBox())!
    const hitClass = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y)
      return el instanceof Element ? el.className : ''
    }, { x: box.x + pt.x, y: box.y + pt.y })
    expect(hitClass).toContain('paste-guard')
    await page.mouse.dblclick(box.x + pt.x, box.y + pt.y)
    await expect(page.getByTestId('inline-editor')).toHaveCount(0)
    const fired = await page
      .waitForEvent('filechooser', { timeout: 500 })
      .then(
        () => true,
        () => false,
      )
    expect(fired).toBe(false)
  })

  test('格式闸：双击换图选不支持的文件 → 白话拒绝、格不变', async ({ page }) => {
    const inst = presetOf(COMPARE)
    await page.setViewportSize({ width: 1200, height: 800 })
    await openPreset(page, '多列对比表')
    await makeImageCell(page, inst)

    const pt = canvasSlotPoint(inst, 'row.3.val.a')
    const canvas = page.locator('.preview-host canvas').first()
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      canvas.dblclick({ position: { x: pt.x, y: pt.y } }),
    ])
    await chooser.setFiles({ name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('x') })
    await expectToast(page, '只支持 PNG / JPG / WebP / GIF 图片')
    // 格不变：图片仍在（thumb 未被清掉）
    await expect(page.getByTestId('image-thumb')).toBeVisible()
  })
})
