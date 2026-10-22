import { expect, test } from '@playwright/test'
import {
  clickSlot,
  downloadPng,
  exportedHtml,
  grantClipboardIfChromium,
  openExportDrawer,
  openPreset,
  presetOf,
} from './helpers'

/**
 * T30 验收 · TC-PT-080（推荐列：最多一列、自动转移、可撤销、导出带角标）
 */

test.beforeEach(async ({ context, browserName }) => {
  await grantClipboardIfChromium(context, browserName)
})

test.describe('TC-PT-080 · 推荐列', () => {
  test('设 B → 设 C 自动转移 → 撤销回 B → 关闭取消；导出带「推荐」角标', async ({ page }) => {
    const inst = presetOf('compare-alpha-v1')
    await openPreset(page, '多列对比表')
    // 展开结构组（推荐列开关在结构组）
    await page.locator('[data-testid="group-head-structure"]').click()
    // 选中方案 B 列头 → 设为推荐
    await clickSlot(page, inst, 'obj.name.b')
    await page.locator('.props').getByRole('button', { name: /方案 B/ }).click()
    await expect(page.locator('.props').getByRole('button', { name: /方案 B（推荐）/ })).toHaveClass(
      /on/,
    )
    // 导出 HTML：列头含文字「推荐」
    const html1 = await exportedHtml(page)
    expect(html1).toContain('推荐')
    // 设 C → B 自动取消（同时只有一列；偏差：无「推荐已改为『方案 C』」toast）
    await clickSlot(page, inst, 'obj.name.c')
    await page.locator('.props').getByRole('button', { name: /方案 C/ }).click()
    await expect(page.locator('.props').getByRole('button', { name: /方案 C（推荐）/ })).toHaveClass(
      /on/,
    )
    await expect(page.locator('.props').getByRole('button', { name: /方案 B（推荐）/ })).toHaveCount(0)
    // 撤销一步回到 B
    await page.getByRole('button', { name: '撤销' }).click()
    await expect(page.locator('.props').getByRole('button', { name: /方案 B（推荐）/ })).toHaveClass(
      /on/,
    )
    await expect(page.locator('.props').getByRole('button', { name: /方案 C（推荐）/ })).toHaveCount(0)
    // 关开关取消（再点 B）且无 toast
    await page.locator('.props').getByRole('button', { name: /方案 B（推荐）/ }).click()
    await expect(page.locator('.props').getByRole('button', { name: /（推荐）/ })).toHaveCount(0)
    await expect(page.locator('.pt-toast')).toHaveCount(0)
    // 重新设 B 为推荐 → 导出 HTML 角标 + PNG 下载（角标像素目视待人工）
    await page.locator('.props').getByRole('button', { name: /方案 B/ }).click()
    const html2 = await exportedHtml(page)
    expect(html2).toContain('>推荐</span>')
    await openExportDrawer(page)
    const png = await downloadPng(page)
    expect(png.length).toBeGreaterThan(1000)
  })
})
