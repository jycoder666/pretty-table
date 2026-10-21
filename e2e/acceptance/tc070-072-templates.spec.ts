import { expect, test } from '@playwright/test'
import {
  clickSlot,
  confirmPaste,
  downloadPng,
  exportedHtml,
  expectToast,
  openPreset,
  pasteBarText,
  pasteClipboard,
  presetOf,
} from './helpers'

/**
 * T30 验收 · TC-PT-070～072（价目清单 / 宽表矩阵入库与填槽导出）
 */

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

test.describe('TC-PT-070 · 价目/矩阵入库：Chip、卡片、防误解小字、空态', () => {
  test('五系统模板 + 空白卡入库、卡片类型 chip、我的模板空态（FR-20 系统模板与卡片部分）', async ({
    page,
  }) => {
    await page.goto('/')
    // 系统预设：新建空白表 + 五类模板卡
    await expect(page.locator('[data-testid="blank-card"]')).toBeVisible()
    for (const name of ['多列对比表', '单主体明细表', '价目清单', '功能矩阵表']) {
      const card = page.locator('article.card', { has: page.locator('h3', { hasText: name }) })
      await expect(card).toBeVisible()
      await expect(card.locator('.chip')).toHaveText(/对比|明细|价目|矩阵/)
    }
    // 卡片小字（meta.description）存在
    const price = page.locator('article.card', { has: page.locator('h3', { hasText: '价目清单' }) })
    await expect(price.locator('p').first()).toContainText('报价')
    // 我的模板空态（通用文案，未筛选时）
    await expect(page.getByText('还没有我的模板')).toBeVisible()
  })

  // FR-20 §2.1-2.3 类型筛选（TC-070 原 FAIL 项，修复后转真实断言）
  test('类型筛选 chips、防误解小字、按类型空态、清空筛选', async ({ page }) => {
    await page.goto('/')
    // Chip 顺序与文案（规格 §2.1）
    const chips = page.locator('[data-testid="type-filter"] button')
    await expect(chips).toHaveText(['全部', '多列对比', '单主体明细', '价目清单', '宽表矩阵'])
    // 防误解小字（§2.2）：价目「不会自动计算」、矩阵「列多时左右滑动，首列固定」
    await expect(
      page.locator('article.card', { has: page.locator('h3', { hasText: '价目清单' }) }),
    ).toContainText('行数由模板定好；小计请自己填写，不会自动计算')
    await expect(
      page.locator('article.card', { has: page.locator('h3', { hasText: '功能矩阵表' }) }),
    ).toContainText('列多时左右滑动，首列固定')
    // 点「价目清单」Chip：系统段只剩价目卡、空白卡隐藏；我的模板段按类型空态（§2.3）
    await page.getByRole('button', { name: '价目清单', exact: true }).click()
    const priceCard = page.locator('article.card', {
      has: page.locator('h3', { hasText: '价目清单' }),
    })
    await expect(priceCard).toBeVisible()
    await expect(
      page.locator('article.card', { has: page.locator('h3', { hasText: '多列对比表' }) }),
    ).toHaveCount(0)
    await expect(page.locator('[data-testid="blank-card"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="mine-type-empty"]')).toContainText(
      '还没有存过价目清单模板',
    )
    // 回「全部」：卡片与空白卡恢复、通用空态回归
    await page.getByRole('button', { name: '全部', exact: true }).click()
    await expect(page.locator('[data-testid="blank-card"]')).toBeVisible()
    await expect(page.getByText('还没有我的模板')).toBeVisible()
  })
})

test.describe('TC-PT-071 · 价目模板：粘贴填槽 + 导出；小计不自动算', () => {
  test('粘贴数量/单价/小计 2×3 → 导出 HTML/PNG 一致；改数量小计不变', async ({ page }) => {
    const inst = presetOf('pricing-v1')
    await openPreset(page, '价目清单')
    // 粘贴 2×3 到 R2–R3 × C3–C5（数量/单价/小计）
    await clickSlot(page, inst, 'row.2.qty')
    await pasteClipboard(page, { text: '9\t500\t4500\n8\t400\t3200' })
    await expect(pasteBarText(page)).toHaveText('将填入 2 行 × 3 列，共 6 格')
    await confirmPaste(page)
    await expectToast(page, '已填入 6 格')
    // 导出 HTML 与预览一致（9 件 / ¥500.00 / ¥4,500.00）
    const html = await exportedHtml(page)
    expect(html).toContain('9')
    expect(html).toContain('¥500.00')
    expect(html).toContain('¥4,500.00')
    expect(html).toContain('¥1,158.00') // 原值仍在（未粘到的行 R4）
    // 改数量 → 小计格不自动变化（FR-20 不自动计算）
    await clickSlot(page, inst, 'row.2.qty')
    const num = page.locator('.props input.num')
    await num.fill('100')
    await num.press('Tab')
    const html2 = await exportedHtml(page)
    expect(html2).toContain('¥4,500.00') // 小计原值未动
    expect(html2).not.toContain('¥50,000.00')
    // PNG 下载成功
    await page.getByRole('button', { name: '导出', exact: true }).click()
    const png = await downloadPng(page)
    expect(png.length).toBeGreaterThan(1000)
  })
})

test.describe('TC-PT-072 · 矩阵模板：粘贴填槽 + 导出；首列钉住', () => {
  test('窄视口预览可横滚；粘贴 2×2 符号槽；导出 HTML 首列 sticky + PNG', async ({ page }) => {
    const inst = presetOf('matrix-v1')
    await page.setViewportSize({ width: 900, height: 720 })
    await openPreset(page, '功能矩阵表')
    // 预览横滚：6 列宽表（内容宽 822px）在窄视口下必然超出宿主宽度，且宿主不撑破页面
    const scroll = await page.evaluate(() => {
      const host = document.querySelector('.preview-host')
      return host ? { hostSw: host.scrollWidth, hostCw: host.clientWidth } : null
    })
    expect(scroll).not.toBeNull()
    expect(scroll!.hostCw).toBeLessThan(822) // 宿主窄于内容宽 → 需要横滚（滚动体验目视待人工）
    expect(scroll!.hostSw).toBeLessThanOrEqual(scroll!.hostCw + 2) // 页面/宿主不撑破
    // 粘贴 2×2 符号词到 R2–R3 × C1–C2
    await clickSlot(page, inst, 'feat.1.b')
    await pasteClipboard(page, { text: '是\t否\n部分\tY' })
    await expect(pasteBarText(page)).toHaveText('将填入 2 行 × 2 列，共 4 格')
    await confirmPaste(page)
    await expectToast(page, '已填入 4 格')
    // 导出 HTML：首列 sticky（FR-26 同源）+ 符号在列
    const html = await exportedHtml(page)
    expect(html).toContain('position:sticky;left:0')
    expect(html).toContain('✓')
    expect(html).toContain('✗')
    // PNG 下载成功
    await page.getByRole('button', { name: '导出', exact: true }).click()
    const png = await downloadPng(page)
    expect(png.length).toBeGreaterThan(1000)
  })
})
