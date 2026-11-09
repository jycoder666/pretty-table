import { expect, test } from '@playwright/test'
import { PALETTES } from '../../src/core/index'
import {
  clickSlot,
  exportedHtml,
  grantClipboardIfChromium,
  openPreset,
  presetOf,
  T12_VIEWPORTS,
} from './helpers'

/**
 * tc100 · 保险模板套件 8 张新模板集成冒烟（增量设计-保险模板套件-2026-11-06 TP10）：
 * - 库页 8 张新卡可见（displayName 逐卡断言，A1 显示名；tc070-072 同款 article.card 定位）
 * - need_00 编辑台关键格：标题（captionSlot）/ 首组组标签「未成年人」/ R3 配置方案含「学平险或小额医疗险」
 * - need_02 编辑台关键格：组表头「②特殊门诊」跨 3 子列（colspan）/「肾透析」/「住院前45天，后45天」/
 *   「A+」「/」/ 得分列红色强调（主题 emphasis，经 PALETTES 取色零字面量）
 * - need_05 区块带文字：带1 header 行 + 带2/带3 sectionBar 区块行文案（含「标准3」原文用字）
 * 引擎：chromium + webkit 双引擎（本文件无剪贴板「读回」依赖，导出走 openPreset 已装的 write 捕获基座）；
 * 视口：1200×800 与 390×844 双视口（T12_VIEWPORTS，tc096-099 同规约）。
 * 画布文本 DOM 不可断 → 文本断言统一走 exportedHtml（导出与预览同源模型，引擎/视口无关）；
 * 预览端另补一条桌面视口 clickSlot → slot-headline 关键格断言（画布点选几何与 tc093 同源）。
 */

/** 8 张新模板：templateId / 库卡显示名（A1 表逐字）/ 类型 chip（detail×7 + matrix×1，零新增 chip） */
const NEW_TEMPLATES: Array<{ id: string; name: string; chip: string }> = [
  { id: 'age-care-guide', name: '各年龄段保障配置', chip: '明细' },
  { id: 'med-ins-list', name: '百万医疗险热门清单', chip: '明细' },
  { id: 'duty-compare', name: '保障责任对比', chip: '矩阵' },
  { id: 'product-catalog', name: '六大险种产品精选', chip: '明细' },
  { id: 'care-tier-compare', name: '医疗层级对比', chip: '明细' },
  { id: 'claim-standards', name: '重疾理赔标准', chip: '明细' },
  { id: 'critical-list-50', name: '重疾险产品汇总', chip: '明细' },
  { id: 'plan-vs', name: '方案对比', chip: '明细' },
]

test.beforeEach(async ({ context, browserName }) => {
  await grantClipboardIfChromium(context, browserName)
})

for (const { width, height } of T12_VIEWPORTS) {
  const vp = `${width}×${height}`

  test.describe(`库页 8 张新模板卡（${vp}）`, () => {
    test('8 张新卡可见、类型 chip 正确（A1：detail×7 + matrix×1，不新增 chip）', async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/')
      for (const t of NEW_TEMPLATES) {
        const card = page.locator('article.card', { has: page.locator('h3', { hasText: t.name }) })
        await expect(card, `${t.id} 库卡可见`).toBeVisible()
        await expect(card.locator('.chip')).toHaveText(t.chip)
      }
    })
  })

  test.describe(`need_00 · 各年龄段保障配置（${vp}）`, () => {
    test('关键格：标题（captionSlot）/ 首组标签「未成年人」/ R3 方案含「学平险或小额医疗险」', async ({
      page,
    }) => {
      await page.setViewportSize({ width, height })
      await openPreset(page, '各年龄段保障配置')
      const html = await exportedHtml(page, '学平险或小额医疗险')
      expect(html).toContain('0岁小孩-80岁各年龄段保障配置方案')
      expect(html).toContain('未成年人')
      expect(html).toContain('学平险或小额医疗险')
    })
  })

  test.describe(`need_02 · 保障责任对比（${vp}）`, () => {
    test('组表头跨列 + 关键格 + 得分列红色强调', async ({ page }) => {
      await page.setViewportSize({ width, height })
      await openPreset(page, '保障责任对比')
      const html = await exportedHtml(page, '住院前45天，后45天')
      // 两级（3 层）表头组跨列：「②特殊门诊」跨 3 子列；标题行跨全宽 8 列
      expect(html).toContain('colspan="3"')
      expect(html).toContain('colspan="8"')
      // 关键格（设计 TP10③ 五项）
      expect(html).toContain('②特殊门诊')
      expect(html).toContain('肾透析')
      expect(html).toContain('住院前45天，后45天')
      expect(html).toContain('A+')
      // 「/」为 C5 最后一行的整格文本（td 内唯一以 / 为内容的格）
      expect(html).toMatch(/<td[^>]*>\/<\/td>/)
      // 得分列红色强调：emphasize ['red','bold'] → 主题 emphasis 色（T-A #C0392B，零字面量取色）
      expect(html).toContain(PALETTES['T-A'].emphasis)
    })
  })

  test.describe(`need_05 · 重疾理赔标准（${vp}）`, () => {
    test('区块带文字：带1 header 行 + 带2/带3 区块行（「标准3」原文用字）', async ({ page }) => {
      await page.setViewportSize({ width, height })
      await openPreset(page, '重疾理赔标准')
      const html = await exportedHtml(page, '标准3：达到疾病约定的状态即赔（19种）')
      expect(html).toContain('标准一：确诊即赔（3种）')
      expect(html).toContain('标准二：做了某种手术即赔（6种）')
      expect(html).toContain('标准3：达到疾病约定的状态即赔（19种）')
      // 末行「严重脑炎后遗症或严重脑膜炎后遗症」横跨 3 列
      expect(html).toContain('严重脑炎后遗症或严重脑膜炎后遗症')
      expect(html).toContain('colspan="3"')
    })
  })
}

test.describe('need_00 · 预览端关键格（1200×800 画布点选）', () => {
  // 首组组标签「未成年人」（设计 TP10② 关键格之一）。slot-headline 摘要截断 8 字
  // （PropertyPanel SUMMARY_LIMIT=8），长文案格（R3 配置方案 45 字）只会显示前 8 字+省略号，
  // 断言全文必挂——故画布点选断言选短文案的组标签格（合并锚点 [2,0]，点合并区即选锚点槽）；
  // R3 方案全文已由上方 exportedHtml 断言覆盖（导出与预览同源模型）。
  test('点选首组组标签「未成年人」→ slot-headline 显示内容（预览/导出双端可达）', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1200, height: 800 })
    await openPreset(page, '各年龄段保障配置')
    await clickSlot(page, presetOf('age-care-guide'), 'age.r2.audience')
    await expect(page.locator('[data-testid="slot-headline"]')).toContainText('未成年人')
  })
})
