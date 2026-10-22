import { expect, test } from '@playwright/test'
import {
  clickSlot,
  confirmPaste,
  expectToast,
  exportedHtml,
  grantClipboardIfChromium,
  openPreset,
  pasteBarText,
  pasteClipboard,
  presetOf,
} from './helpers'

/**
 * T30 验收 · TC-PT-059～069（拒收 / 撤销 / 空值 / 识别）
 * Excel/WPS 来源以「模拟剪贴板」等价执行。
 */

test.beforeEach(async ({ context, browserName }) => {
  await grantClipboardIfChromium(context, browserName)
})

const COMPARE = 'compare-alpha-v1'
const PRICING = 'pricing-v1'
const MATRIX = 'matrix-v1'

test.describe('TC-PT-059 · 超出 1 列整块拒收、不扩表', () => {
  test('起点距右边界只剩 1 列时粘 1×2 → toast 多出 1 列、无写入、不进预览', async ({ page }) => {
    const inst = presetOf(COMPARE)
    await openPreset(page, '多列对比表')
    const before = await exportedHtml(page)
    // 起点 row.3.val.c（最后一列），粘 1 行 × 2 列 → 多出 1 列
    await clickSlot(page, inst, 'row.3.val.c')
    await pasteClipboard(page, { text: 'A1\tA2' })
    await expectToast(
      page,
      '放不下：多出 1 列。表格不会自动加列，请少复制 1 列，或换个更靠左的起点',
    )
    await expect(pasteBarText(page)).toHaveCount(0)
    // 无任何槽被改、未新增列
    const after = await exportedHtml(page)
    expect(after).toBe(before)
  })
})

test.describe('TC-PT-060 · 超出行 / 行列都超的提示', () => {
  test('倒数第 1 行起粘 3×3 → 多出 2 行；粘 3×4 → 多出 2 行 1 列', async ({ page }) => {
    const inst = presetOf(COMPARE)
    await openPreset(page, '多列对比表')
    // 起点 row.9.val.a（倒数第 1 行、剩 3 列可写）
    await clickSlot(page, inst, 'row.9.val.a')
    await pasteClipboard(page, { text: 'A\tB\tC\nD\tE\tF\nG\tH\tI' })
    await expectToast(
      page,
      '放不下：多出 2 行。表格不会自动加行，请少复制 2 行，或换个更靠上的起点',
    )
    await pasteClipboard(page, { text: 'A\tB\tC\tD\nD\tE\tF\tG\nG\tH\tI\tJ' })
    await expectToast(page, /放不下：多出 2 行 1 列。表格不会自动加行列/)
    await expect(pasteBarText(page)).toHaveCount(0)
  })
})

test.describe('TC-PT-061 · 粘贴范围含合并格整块拒收（E-1）', () => {
  test('矩阵档位分组合并格在范围内 → toast 合并格拒收、无写入', async ({ page }) => {
    const inst = presetOf(MATRIX)
    await openPreset(page, '功能矩阵表')
    const before = await exportedHtml(page)
    // 起点 band.1（R0:C1，与 C2 合并），粘 2×2 覆盖合并格
    await clickSlot(page, inst, 'band.1')
    await pasteClipboard(page, { text: 'A\tB\nC\tD' })
    await expectToast(
      page,
      '这块区域里有合并的格子，没法按格填入。请先拆分，或换个起点',
    )
    await expect(pasteBarText(page)).toHaveCount(0)
    const after = await exportedHtml(page)
    expect(after).toBe(before)
  })
})

test.describe('TC-PT-062 · 粘贴范围含 locked/模板固定格整块拒收（E-1）', () => {
  test('矩阵「条目」锁定合并格在范围内 → toast 含模板固定格拒收（合并原因在前）、无写入', async ({ page }) => {
    const inst = presetOf(MATRIX)
    await openPreset(page, '功能矩阵表')
    const before = await exportedHtml(page)
    // 起点 matrix.corner（R0:C0 锁定合并锚），粘 2×2 → 覆盖 R1:C0（null 固定格）
    await clickSlot(page, inst, 'matrix.corner')
    await pasteClipboard(page, { text: 'A\tB\nC\tD' })
    await expectToast(
      page,
      '这块区域里有合并的格子，没法按格填入。请先拆分，或换个起点；另外这块区域里有模板固定的格子（不能改），请换个起点',
    )
    await expect(pasteBarText(page)).toHaveCount(0)
    const after = await exportedHtml(page)
    expect(after).toBe(before)
  })
})

test.describe('TC-PT-063 · 粘贴范围跨区块行整块拒收（E-1）', () => {
  test('价目清单跨「人工」分组行 → toast 分区色条拒收、无写入', async ({ page }) => {
    const inst = presetOf(PRICING)
    await openPreset(page, '价目清单')
    const before = await exportedHtml(page)
    // 起点 row.7.qty（R7:C3），粘 2×2 → 跨 after-7 分组行（gap-g2）
    await clickSlot(page, inst, 'row.7.qty')
    await pasteClipboard(page, { text: 'A\tB\nC\tD' })
    await expectToast(
      page,
      '这块区域跨过了分区色条，没法连着填。请分两次粘贴，或先移除色条',
    )
    await expect(pasteBarText(page)).toHaveCount(0)
    const after = await exportedHtml(page)
    expect(after).toBe(before)
  })
})

test.describe('TC-PT-064 · 成功后撤销一次 12 格全部恢复', () => {
  test('Ctrl+Z 与顶栏撤销各恢复一次；toast「已撤销粘贴」未实现记偏差', async ({ page }) => {
    const inst = presetOf(COMPARE)
    await openPreset(page, '多列对比表')
    await clickSlot(page, inst, 'row.6.label')
    await pasteClipboard(page, {
      text: 'R1C1\tR1C2\tR1C3\tR1C4\nR2C1\tR2C2\tR2C3\tR2C4\nR3C1\tR3C2\tR3C3\tR3C4',
    })
    await confirmPaste(page)
    await expectToast(page, '已填入 12 格')
    // 1. Ctrl+Z → 12 格全部恢复
    await page.keyboard.press('Control+Z')
    await expect(page.getByRole('button', { name: '撤销' })).toBeDisabled()
    const html1 = await exportedHtml(page)
    expect(html1).not.toContain('R1C1')
    // 再粘一次，顶栏撤销
    await clickSlot(page, inst, 'row.6.label')
    await pasteClipboard(page, { text: 'S1\tS2\tS3\tS4\nS5\tS6\tS7\tS8\nS9\tS10\tS11\tS12' })
    await confirmPaste(page)
    await page.getByRole('button', { name: '撤销' }).click()
    const html2 = await exportedHtml(page)
    expect(html2).not.toContain('S1')
    // 偏差：toast 无「已撤销粘贴」文案、toast 内无「撤销」按钮（见报告）
  })
})

test.describe('TC-PT-065 · 确认后写入失败整体回滚（S13，故障注入 ?pt-fault）', () => {
  test('PASTE_COMMIT_FAILED → 覆盖层撤掉、表格保持原样', async ({ page }) => {
    const inst = presetOf(COMPARE)
    await page.goto('/?pt-fault=PASTE_COMMIT_FAILED')
    const card = page.locator('article.card', {
      has: page.locator('h3', { hasText: '多列对比表' }),
    })
    await card.getByRole('button', { name: '使用此模板' }).click()
    await expect(page.locator('.preview-host canvas').first()).toBeVisible()
    const before = await exportedHtml(page)
    await clickSlot(page, inst, 'row.6.label')
    await pasteClipboard(page, { text: 'F1\tF2\tF3\tF4\nF5\tF6\tF7\tF8\nF9\tF10\tF11\tF12' })
    await confirmPaste(page)
    // 覆盖层撤掉、无写入（文案偏差：实际「粘贴失败，表格未改动」vs 规格「这次粘贴没有成功…」）
    await expectToast(page, '粘贴失败，表格未改动')
    await expect(pasteBarText(page)).toHaveCount(0)
    const after = await exportedHtml(page)
    expect(after).toBe(before)
  })
})

test.describe('TC-PT-066 · 少粘：块外槽保持原值（E-3）', () => {
  test('粘 2×2 到 3×4 可写区左上 → 只覆盖 4 格', async ({ page }) => {
    const inst = presetOf(COMPARE)
    await openPreset(page, '多列对比表')
    await clickSlot(page, inst, 'row.6.label')
    await pasteClipboard(page, { text: 'N1\tN2\nN3\tN4' })
    await confirmPaste(page)
    const html = await exportedHtml(page)
    // 块内 4 格已改
    for (const v of ['N1', 'N2', 'N3', 'N4']) expect(html).toContain(v)
    // 块外槽保持原值（row.6.val.b/c、row.7、row.8 原文）
    for (const v of ['指定区域', '共享池', '只读链接', '12 个月', '全格式']) {
      expect(html).toContain(v)
    }
    expect(html).not.toContain('N5')
  })
})

test.describe('TC-PT-067 · 源空单元格：预览标「将清空」，确认后清空（E-8）', () => {
  test('2×2 中 2 格留空 → 预览提示 + 确认后为空', async ({ page }) => {
    const inst = presetOf(COMPARE)
    await openPreset(page, '多列对比表')
    await clickSlot(page, inst, 'row.6.label')
    await pasteClipboard(page, { text: 'V1\t\n\tV4' })
    // 预览条追加提示
    await expect(pasteBarText(page)).toContainText('其中 2 格为空，确认后会清空')
    // 覆盖层 2 格显示（将清空）
    await expect(page.locator('.paste-cell.clearing')).toHaveCount(2)
    await expect(page.locator('.paste-cell.clearing').first()).toContainText('（将清空）')
    await confirmPaste(page)
    // 导出 HTML 中这 2 格为空串：row.6.label 被 V1 覆盖、row.6.val.a 与 row.7.label 被清空
    const html = await exportedHtml(page)
    expect(html).toContain('V1')
    expect(html).toContain('V4')
    expect(html).not.toContain('定制报告') // 被 V1 覆盖
    expect(html).not.toContain('专属顾问') // 被清空
    expect(html).toContain('不含') // 块外槽保持原值
  })
})

test.describe('TC-PT-068 · 行长短不齐：短行缺格不改（S8）', () => {
  test('第 1 行 3 列、第 2 行 1 列 → 块宽按 3，短行缺格保持原值', async ({ page }) => {
    const inst = presetOf(COMPARE)
    await openPreset(page, '多列对比表')
    await clickSlot(page, inst, 'row.6.label')
    await pasteClipboard(page, { text: 'A1\tB1\tC1\nD1' })
    await expect(pasteBarText(page)).toHaveText('将填入 2 行 × 3 列，共 4 格')
    await confirmPaste(page)
    const html = await exportedHtml(page)
    expect(html).toContain('A1')
    expect(html).toContain('D1')
    // 第 2 行缺的 2 格保持原值：row.7.val.a = 共享池、row.7.val.c = —（原有值未动）
    expect(html).toContain('共享池')
  })
})

test.describe('TC-PT-069 · 非表格内容拒收（S10）', () => {
  test('纯空白 → toast 无可用表格文字；图片/文件路径记偏差', async ({ page }) => {
    const inst = presetOf(COMPARE)
    await openPreset(page, '多列对比表')
    await clickSlot(page, inst, 'row.3.val.a')
    // 3. 纯空白 → 拒收 toast
    await pasteClipboard(page, { text: '   \n  ' })
    await expectToast(
      page,
      '剪贴板里没有可用的表格文字。请在 Excel / WPS 里选中单元格复制后再粘贴',
    )
    await expect(pasteBarText(page)).toHaveCount(0)
    // 1. 图片：现行为（R-3 升级）为「粘贴填图」不再拒收 —— 用 1×1 PNG 验证写入图片槽
    const RED_1X1 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'
    await pasteClipboard(page, {
      file: { name: 'shot.png', type: 'image/png', base64: RED_1X1 },
    })
    // 图片走上传闸（格内出现图片缩略 / 移除按钮）
    await expect(page.locator('[data-testid="image-area"]')).toBeVisible()
    // 2. 文件（非图片 MIME）→ 无可用表格文字 toast（偏差：无「暂不支持直接导入文件」补句）
    await pasteClipboard(page, {
      file: { name: 'a.bin', type: 'application/octet-stream', base64: 'AAAA' },
    })
    await expectToast(
      page,
      '剪贴板里没有可用的表格文字。请在 Excel / WPS 里选中单元格复制后再粘贴',
    )
  })
})
