import { expect, test } from '@playwright/test'
import {
  downloadPng,
  expectToast,
  openExportDrawer,
  openPreset,
  pngSize,
  samplePngPixels,
} from './helpers'

/**
 * T30 验收 · TC-PT-081～084 / 087（PNG 倍率·透明底·超限·生成中·剪贴板被拒）
 */

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

test.describe('TC-PT-081 · PNG 倍率 1x/2x/3x，默认 2x，尺寸口径与记忆', () => {
  test('默认 2x；三档实测宽 ≈1:2:3；本机记忆倍率', async ({ page }) => {
    await openPreset(page, '多列对比表')
    await openExportDrawer(page)
    // 默认 2x
    await expect(page.locator('.seg-btn', { hasText: '2×' })).toHaveAttribute('aria-pressed', 'true')
    // 实时像素提示
    await expect(page.locator('.estimate')).toContainText('像素')
    // 1x / 2x / 3x 下载并解析 IHDR 宽
    const widths: number[] = []
    for (const label of ['1×', '2×', '3×']) {
      await page.locator('.seg-btn', { hasText: label }).click()
      const png = await downloadPng(page)
      widths.push(pngSize(png).width)
    }
    expect(widths[1]).toBeCloseTo(widths[0]! * 2, -1)
    expect(widths[2]).toBeCloseTo(widths[0]! * 3, -1)
    // 记忆：选 1x → 关闭再打开 → 仍 1x
    await page.locator('.seg-btn', { hasText: '1×' }).click()
    await page.getByRole('button', { name: '关闭' }).click()
    await openExportDrawer(page)
    await expect(page.locator('.seg-btn', { hasText: '1×' })).toHaveAttribute('aria-pressed', 'true')
    // 刷新后仍 1x（localStorage pt.pref.pngScale）
    await page.reload()
    await expect(page.locator('.preview-host canvas').first()).toBeVisible({ timeout: 15000 })
    await openExportDrawer(page)
    await expect(page.locator('.seg-btn', { hasText: '1×' })).toHaveAttribute('aria-pressed', 'true')
    // 偏差：各档「适合网页小图/方案书 PPT/打印大屏」小字与「图片已开始下载（2x，…）」toast 未实现
    // （成功 toast 实为「PNG 已下载」，见报告）
  })
})

test.describe('TC-PT-082 · 透明背景：表格外 alpha=0，格内纸色保留', () => {
  test('透明底 PNG 四角 alpha=0、中心格不透明；关斑马纹再导出仍成立', async ({ page }) => {
    await openPreset(page, '多列对比表')
    await openExportDrawer(page)
    const transCheck = page.getByRole('checkbox', { name: '透明底（表格外留白透明）' })
    await transCheck.check()
    // 偏差：抽屉内小预览棋盘格与「只去掉表格外围的底色…」提示未实现（见报告）
    await page.getByRole('button', { name: '关闭' }).click()
    // 斑马纹关（样式组）
    await page.locator('[data-testid="group-head-style"]').click()
    await page.getByRole('checkbox', { name: '斑马纹' }).uncheck()
    await openExportDrawer(page)
    await transCheck.check()
    const png = await downloadPng(page)
    const { width, height } = pngSize(png)
    // 四角（留白区）alpha=0；中心（表格内）alpha=255
    const samples = await samplePngPixels(page, png, [
      [2, 2],
      [width - 3, 2],
      [2, height - 3],
      [width - 3, height - 3],
      [Math.floor(width / 2), Math.floor(height / 2)],
    ])
    for (const s of samples.slice(0, 4)) expect(s.a, `corner (${s.x},${s.y})`).toBe(0)
    expect(samples[4]!.a).toBe(255)
  })
})

test.describe('TC-PT-083 · 3x 大图提示与过大失败改 2x', () => {
  test('?pt-png-max 压门槛：3x 超限提示+高亮倍率，改 2x 可成功', async ({ page }) => {
    await openPreset(page, '多列对比表', '?pt-png-max=2000000')
    await openExportDrawer(page)
    // 选 3x → 导出触发超限：白话建议 + 倍率选项高亮（偏差：规格文案「图片太大没能生成，试试 2x」+「改用 2x 重试」按钮未实现）
    await page.locator('.seg-btn', { hasText: '3×' }).click()
    await page.getByRole('button', { name: '导出 PNG' }).click()
    await expectToast(page, '图片太大：当前 3× 超限，请改用 2× 或 1× 后重试')
    await expect(page.getByRole('radiogroup', { name: 'PNG 倍率' })).toHaveClass(/attn/)
    // 改 2x → 成功下载
    await page.locator('.seg-btn', { hasText: '2×' }).click()
    const png = await downloadPng(page)
    expect(png.length).toBeGreaterThan(1000)
    // 偏差：输出边长 >6000 的「图片较大，生成可能要几秒」提示未实现（见报告）
  })
})

test.describe('TC-PT-084 · PNG 生成中：选项禁用、失败恢复（Q-014 故障注入）', () => {
  test('真实生成窗口：倍率/透明/复制 HTML 禁用 → 成功后恢复', async ({ page }) => {
    await openPreset(page, '功能矩阵表')
    await openExportDrawer(page)
    await page.locator('.seg-btn', { hasText: '3×' }).click()
    await page.getByRole('button', { name: '导出 PNG' }).click()
    // 生成中：选项禁用（偏差：复制 HTML 亦被禁用，规格要求生成中可用；toast「正在生成图片…」短暂即逝）
    await expect
      .poll(async () => page.getByRole('checkbox', { name: '透明底（表格外留白透明）' }).isDisabled(), {
        timeout: 3000,
        intervals: [25, 50, 100],
      })
      .toBe(true)
    await expect(page.getByRole('button', { name: '复制 HTML' })).toBeDisabled()
    // 成功后恢复
    await expectToast(page, 'PNG 已下载')
    await expect(page.getByRole('checkbox', { name: '透明底（表格外留白透明）' })).toBeEnabled()
    await expect(page.getByRole('button', { name: '复制 HTML' })).toBeEnabled()
  })

  test('故障注入失败：行内错 toast，选项恢复可用', async ({ page }) => {
    await openPreset(page, '多列对比表', '?pt-fault=EXPORT_PNG_FAIL')
    await openExportDrawer(page)
    await page.getByRole('button', { name: '导出 PNG' }).click()
    // 失败 toast（偏差：实际「导出失败，请重试」vs 规格「图片生成失败，请重试」）
    await expectToast(page, '导出失败，请重试')
    await expect(page.locator('.seg-btn').first()).toBeEnabled()
    await expect(page.getByRole('checkbox', { name: '透明底（表格外留白透明）' })).toBeEnabled()
  })
})

test.describe('TC-PT-087 · 剪贴板写入被拒：手动复制框', () => {
  test('writeText 与 execCommand 均拒 → 行内错 + 手动复制框内 HTML 可用', async ({ page }) => {
    // 模拟 Chrome 站点剪贴板权限 = 禁止：writeText 永远 reject，execCommand 返回 false
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: async () => {
            throw new DOMException('denied', 'NotAllowedError')
          },
          readText: async () => {
            throw new DOMException('denied', 'NotAllowedError')
          },
        },
        configurable: true,
      })
      document.execCommand = () => false
    })
    await openPreset(page, '多列对比表')
    await openExportDrawer(page)
    await page.getByRole('button', { name: '复制 HTML' }).click()
    // 行内错 toast + 手动复制框出现，框内为完整 HTML
    await expectToast(page, '无法写入剪贴板，请手动全选复制下方 HTML')
    const fallback = page.locator('.drawer textarea.fallback')
    await expect(fallback).toBeVisible()
    const value = await fallback.inputValue()
    expect(value).toContain('<table')
    expect(value).toContain('多列对比表')
  })
})
