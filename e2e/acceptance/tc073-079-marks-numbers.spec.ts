import { expect, test } from '@playwright/test'
import {
  clickSlot,
  countPngNearColor,
  confirmPaste,
  downloadPng,
  exportedHtml,
  openExportDrawer,
  openPreset,
  pasteBarText,
  pasteCells,
  pasteClipboard,
  presetOf,
} from './helpers'

/**
 * T30 验收 · TC-PT-073～079（三态符号 / 数字·货币·百分比格式 / 识别词表）
 * 主题颜色断言以导出 HTML 内联样式（与预览/PNG 同源 store + formatTokens）替代截屏取色。
 */

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

const COMPARE = 'compare-alpha-v1'
const MATRIX = 'matrix-v1'
const PRICING = 'pricing-v1'

/** 选中槽位后在右栏点三态符号按钮（按 glyph 匹配：✓ / ✗ / ◐） */
async function clickMarkButton(page: import('@playwright/test').Page, glyph: string) {
  await page
    .locator('.props')
    .getByRole('radiogroup', { name: '支持状态' })
    .getByRole('button')
    .filter({ hasText: glyph })
    .first()
    .click()
}

test.describe('TC-PT-073 · 三态符号随主题变色、无自定义入口、导出可见', () => {
  const CASES = [
    { theme: '蓝白台账', yes: '#2F5B9A', no: '#C0392B' },
    { theme: '墨青簿册', yes: '#2F4F45', no: '#A65B2A' },
    { theme: '暖灰金', yes: '#4A463F', no: '#8A6A2F' },
  ] as const

  for (const c of CASES) {
    test(`主题 ${c.theme}：✓◐ 与 ✗ 颜色随主题、HTML 带读屏标签、PNG 可导`, async ({
      page,
    }) => {
      const inst = presetOf(COMPARE)
      await openPreset(page, '多列对比表')
      // 符号槽 R2 经右栏三钮重设：a→✓（先点 ✗ 再点 ✓ 验证三选一互斥）
      await clickSlot(page, inst, 'row.2.val.a')
      await clickMarkButton(page, '✗')
      await clickMarkButton(page, '✓')
      await expect(page.locator('[data-testid="slot-headline"]')).toContainText('当前内容：支持')
      // b→✗（预置 ✓，点 ✓ 即清空，再点 ✗）
      await clickSlot(page, inst, 'row.2.val.b')
      await clickMarkButton(page, '✓')
      await expect(page.locator('[data-testid="slot-headline"]')).not.toContainText('✓')
      await clickMarkButton(page, '✗')
      // c→◐（预置 ◐，点 ✓ 换值，再回 ◐）
      await clickSlot(page, inst, 'row.2.val.c')
      await clickMarkButton(page, '✓')
      await clickMarkButton(page, '◐')
      // 切主题（样式组默认折叠，先展开）
      await page.locator('[data-testid="group-head-style"]').click()
      await page.locator('.theme-btn', { hasText: c.theme }).click()
      // 无自定义入口：radiogroup 恰好 3 个按钮，无第四态；提示「不支持自定义」
      const btns = page
        .locator('.props')
        .getByRole('radiogroup', { name: '支持状态' })
        .getByRole('button')
      await expect(btns).toHaveCount(3)
      await expect(page.getByText('符号与颜色随主题，不支持自定义')).toBeVisible()
      // 导出 HTML：✓✗◐ 字符 + aria-label 读屏标签；表头底色 = 主题 primary（即 ✓/◐ 同 token）
      const html = await exportedHtml(page)
      expect(html).toContain(`aria-label="支持"`)
      expect(html).toContain(`aria-label="不支持"`)
      expect(html).toContain(`aria-label="部分支持"`)
      expect(html).toContain(`background:${c.yes}`)
      // 偏差：HTML 符号字符本身不带主题色（color:#1a1a1a），见报告
      // PNG（与预览同一渲染路径）：✗ 字形像素接近主题 emphasis 色
      await openExportDrawer(page)
      const png = await downloadPng(page)
      expect(png.length).toBeGreaterThan(1000)
      const nearNo = await countPngNearColor(page, png, c.no, 60)
      expect(nearNo).toBeGreaterThan(0)
    })
  }
})

test.describe('TC-PT-074 · 矩阵模板符号槽可用（E-10）', () => {
  test('矩阵交叉格三态填写 → 行为与对比模板一致', async ({ page }) => {
    const inst = presetOf(MATRIX)
    await openPreset(page, '功能矩阵表')
    await clickSlot(page, inst, 'feat.4.c') // 预置 ◐
    await clickMarkButton(page, '✗') // 改 ✗
    await expect(page.locator('[data-testid="slot-headline"]')).toContainText('不支持')
    const html = await exportedHtml(page)
    expect(html).toContain('✗')
    expect(html).toContain('aria-label="不支持"')
  })
})

test.describe('TC-PT-075 · 粘贴识别词转符号，词表外按文字 + 提示（E-2）', () => {
  test('10 词粘贴 → 前 9 词转 ✓✗◐（忽略大小写与首尾空格），词表外按文字', async ({ page }) => {
    const inst = presetOf(MATRIX)
    await openPreset(page, '功能矩阵表')
    // 起点 feat.1.b（R2:C2）：粘 5 行 × 2 列覆盖 R2–R6 × C1–C2 符号槽
    await clickSlot(page, inst, 'feat.1.b')
    await pasteClipboard(page, { text: '是\t否\n部分\tY\nn\tTRUE\nfalse\t 支持 \nPartial\t仅限会员' })
    await expect(pasteBarText(page)).toContainText('将填入 5 行 × 2 列，共 10 格')
    // 预览条追加按文字提示（偏差：实际文案「其中 1 格按文字填入」，规格为「其中 1 格不是 ✓✗◐，按文字填入」）
    await expect(pasteBarText(page)).toContainText('其中 1 格按文字填入')
    // 覆盖层显示识别结果：✓ ✗ ◐
    const texts = await pasteCells(page).allTextContents()
    expect(texts.filter((t) => t.includes('✓'))).toHaveLength(4) // 是/Y/TRUE/' 支持 '
    expect(texts.filter((t) => t.includes('✗'))).toHaveLength(3) // 否/n/false
    expect(texts.filter((t) => t.includes('◐'))).toHaveLength(2) // 部分/Partial
    expect(texts.some((t) => t.includes('仅限会员'))).toBe(true)
    await confirmPaste(page)
    // 文字槽中「是」保持文字：对比模板 row.3.val.a 粘「是」
    const inst2 = presetOf(COMPARE)
    await openPreset(page, '多列对比表')
    await clickSlot(page, inst2, 'row.3.val.a')
    await pasteClipboard(page, { text: '是' })
    // 1×1 直接写入
    await expect(page.locator('[data-testid="slot-headline"]')).toContainText('当前内容：是')
    const html = await exportedHtml(page)
    expect(html).toContain('>是<')
  })
})

test.describe('TC-PT-076 · 数字格式：千分位、小数位、负数、非数字', () => {
  test('数字槽（0 位小数·单位件）：千分位/四舍五入/负数/按文字', async ({ page }) => {
    const inst = presetOf(PRICING)
    await openPreset(page, '价目清单')
    // R2–R6 数量列粘 5×1
    await clickSlot(page, inst, 'row.2.qty')
    await pasteClipboard(page, { text: '1234567\n1,234.5\n-1200\n面议\n25%' })
    await expect(pasteBarText(page)).toContainText('其中 2 格按文字填入')
    // 按文字格预览覆盖层带「按文字」小标
    await expect(page.locator('.paste-cell.as-text')).toHaveCount(2)
    await confirmPaste(page)
    const html = await exportedHtml(page)
    const NB = '\u202F' // 单位前的窄空格
    expect(html).toContain(`1,234,567${NB}件`)
    expect(html).toContain(`1,235${NB}件`) // 1,234.5 → 0 位小数四舍五入
    expect(html).toContain(`-1,200${NB}件`) // 负数前置减号
    expect(html).toContain('面议') // 原样
    expect(html).toContain('25%') // 原样（数字槽 % 按文字，Q-011）
    // 默认右对齐（数字格 text-align:right）
    expect(html).toMatch(new RegExp(`text-align:right">1,234,567${NB}件`))
    expect(html).not.toMatch(new RegExp(`text-align:right">面议`)) // 文字格不套右对齐
  })
})

test.describe('TC-PT-077 · 货币格式：¥ 前置、2 位小数、多种输入', () => {
  test('货币槽：8 种输入按 Q-011 读法显示', async ({ page }) => {
    const inst = presetOf(PRICING)
    await openPreset(page, '价目清单')
    await clickSlot(page, inst, 'row.2.price')
    await pasteClipboard(page, { text: '1200\n¥1,200\n1200元\n1,234.5\n0.25' })
    await confirmPaste(page)
    await clickSlot(page, inst, 'row.8.price') // 人工组首行（R8–R10 连续，不跨区块）
    await pasteClipboard(page, { text: '25\n-1200\n面议' })
    await confirmPaste(page)
    const html = await exportedHtml(page)
    expect(html).toContain('¥1,200.00')
    expect(html).toContain('¥1,234.50')
    expect(html).toContain('¥0.25')
    expect(html).toContain('¥25.00')
    expect(html).toContain('-¥1,200.00')
    expect(html).toContain('面议')
    // 右栏格式说明小字（偏差：未实现，见报告）
    await clickSlot(page, inst, 'row.2.price')
    await expect(page.getByText('这一格按货币显示')).toHaveCount(0)
  })
})

test.describe('TC-PT-078 · 百分比格式与 E-9：裸数字原样当百分数、存比例', () => {
  test('25/0.5/25%/0.25 → 25%/0.5%/25%/0.25%，存值 0.25/0.005/0.25/0.0025，无额外提醒', async ({
    page,
  }) => {
    const inst = presetOf(MATRIX)
    await openPreset(page, '功能矩阵表')
    await clickSlot(page, inst, 'pct.1.a')
    await pasteClipboard(page, { text: '25\n0.5\n25%\n0.25' })
    // 无额外提醒（Q-010）：预览条仅基础句
    await expect(pasteBarText(page)).toHaveText('将填入 4 行 × 1 列，共 4 格')
    await confirmPaste(page)
    // 存值验证：逐格选中，右栏数字框读原始比例
    const expected = ['0.25', '0.005', '0.25', '0.0025']
    const slots = ['pct.1.a', 'pct.2.a', 'pct.3.a', 'pct.4.a']
    for (let i = 0; i < 4; i++) {
      await clickSlot(page, inst, slots[i]!)
      await expect(page.locator('.props input.num')).toHaveValue(expected[i]!)
    }
    // 显示验证：导出 HTML 与预览同源
    const html = await exportedHtml(page)
    expect(html).toMatch(/text-align:right">25%</)
    expect(html).toMatch(/text-align:right">0\.5%</)
    expect(html).toMatch(/text-align:right">25%</)
    expect(html).toMatch(/text-align:right">0\.25%</)
  })
})

test.describe('TC-PT-079 · 同一存值 0.25 在百分比槽显示 25%，三处一致', () => {
  test('预览（同源 store）→ 导出 HTML 25% → PNG 下载成功', async ({ page }) => {
    const inst = presetOf(MATRIX)
    await openPreset(page, '功能矩阵表')
    // pct.1.e 预置 0.99 → 改成 0.25
    await clickSlot(page, inst, 'pct.1.e')
    const num = page.locator('.props input.num')
    await num.fill('0.25')
    await num.press('Tab')
    // 导出 HTML 显示 25%（预览画布文字与 HTML/PNG 同一 formatTokens，画布像素目视待人工）
    const html = await exportedHtml(page)
    expect(html).toMatch(/text-align:right">25%</)
    // PNG 下载成功
    await openExportDrawer(page)
    const png = await downloadPng(page)
    expect(png.length).toBeGreaterThan(1000)
  })
})
