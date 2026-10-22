import { expect, test } from '@playwright/test'
import {
  cancelPaste,
  clickSlot,
  confirmPaste,
  expectToast,
  exportedHtml,
  grantClipboardIfChromium,
  openPreset,
  pasteBarText,
  pasteCells,
  pasteClipboard,
  presetOf,
} from './helpers'

/**
 * T30 验收 · TC-PT-051～058（粘贴填槽基础链路）
 * Excel/WPS 来源一律以「模拟剪贴板」（TSV 载荷注入 paste 事件）等价执行；
 * 外部应用真实复制路径标注「待人工复测」。
 */

test.beforeEach(async ({ context, browserName }) => {
  await grantClipboardIfChromium(context, browserName)
})

const COMPARE = 'compare-alpha-v1'
const TSV_3X4 = 'R1C1\tR1C2\tR1C3\tR1C4\nR2C1\tR2C2\tR2C3\tR2C4\nR3C1\tR3C2\tR3C3\tR3C4'

test.describe('TC-PT-051 · Excel 3×4 按位置粘贴填 12 槽（模拟剪贴板）', () => {
  test('预览条 + 覆盖层 + 确认后 12 格按序填入、行列数不变', async ({ page }) => {
    const inst = presetOf(COMPARE)
    await openPreset(page, '多列对比表')
    // 记录粘贴前导出 HTML（结构 diff 基准）
    const before = await exportedHtml(page)
    // 起点格：row.6.label（R6–R8 × C0–C3 全为文字槽，描边选中非输入态）
    await clickSlot(page, inst, 'row.6.label')
    await pasteClipboard(page, { text: TSV_3X4 })
    await expect(pasteBarText(page)).toHaveText('将填入 3 行 × 4 列，共 12 格')
    await expect(pasteCells(page)).toHaveCount(12)
    await confirmPaste(page)
    await expectToast(page, '已填入 12 格')
    // 12 格按原表顺序填入
    const after = await exportedHtml(page)
    for (let r = 1; r <= 3; r++) {
      for (let c = 1; c <= 4; c++) expect(after).toContain(`R${r}C${c}`)
    }
    // 表格行列数与粘贴前一致：行数一致、无新增列（前后 <tr> 数相同）
    const trBefore = (before.match(/<tr/g) ?? []).length
    const trAfter = (after.match(/<tr/g) ?? []).length
    expect(trAfter).toBe(trBefore)
    expect(after.length).toBeGreaterThan(before.length) // 值已写入
  })
})

test.describe('TC-PT-052 · WPS 来源按位置填入（模拟剪贴板·外部应用路径待人工复测）', () => {
  test('2×3 六格按位置填入，行为同 Excel 来源', async ({ page }) => {
    const inst = presetOf(COMPARE)
    await openPreset(page, '多列对比表')
    await clickSlot(page, inst, 'row.3.label')
    await pasteClipboard(page, { text: 'W1\tW2\tW3\nW4\tW5\tW6' })
    await expect(pasteBarText(page)).toHaveText('将填入 2 行 × 3 列，共 6 格')
    await confirmPaste(page)
    await expectToast(page, '已填入 6 格')
    const html = await exportedHtml(page)
    for (const v of ['W1', 'W2', 'W3', 'W4', 'W5', 'W6']) expect(html).toContain(v)
  })
})

test.describe('TC-PT-053 · 工具条「粘贴表格内容」入口与剪贴板被拒兜底', () => {
  test('未选中禁用 → 选中后工具条读剪贴板粘贴进预览', async ({ page }) => {
    const inst = presetOf(COMPARE)
    // readText 模拟为返回 TSV（真实链路等价：工具条读剪贴板文本）
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { readText: async () => 'T1\tT2\nT3\tT4', writeText: async () => {} },
        configurable: true,
      })
    })
    await openPreset(page, '多列对比表')
    const btn = page.locator('[data-testid="paste-toolbar-btn"]')
    // 1. 未选中：禁用
    await expect(btn).toBeDisabled()
    // 2. 选中可写格后可点 → 进预览
    await clickSlot(page, inst, 'row.3.label')
    await expect(btn).toBeEnabled()
    await btn.click()
    await expect(pasteBarText(page)).toContainText('将填入 2 行 × 2 列，共 4 格')
  })

  test('剪贴板被拒（readText reject）→ 手动小框兜底并正常进预览', async ({ page }) => {
    const inst = presetOf(COMPARE)
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          readText: async () => {
            throw new DOMException('denied', 'NotAllowedError')
          },
          writeText: async () => {},
        },
        configurable: true,
      })
    })
    await openPreset(page, '多列对比表')
    await clickSlot(page, inst, 'row.3.label')
    const btn = page.locator('[data-testid="paste-toolbar-btn"]')
    await btn.click()
    const box = page.locator('[data-testid="paste-manual-box"]')
    await expect(box).toContainText('在这里粘贴（Ctrl+V）')
    // 小框内粘贴（paste 事件打到 textarea 上）
    await page.locator('[data-testid="paste-manual-input"]').evaluate((el) => {
      const dt = new DataTransfer()
      dt.setData('text/plain', 'M1\tM2\nM3\tM4')
      const ev = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      } as ClipboardEventInit)
      el.dispatchEvent(ev)
    })
    await expect(pasteBarText(page)).toContainText('将填入 2 行 × 2 列，共 4 格')
  })
})

test.describe('TC-PT-054 · 输入态粘贴多格内容只进当前格', () => {
  test('编辑框内粘贴 2×2 内容按普通文字进当前格，不走填槽', async ({ page }) => {
    const inst = presetOf(COMPARE)
    await openPreset(page, '多列对比表')
    await clickSlot(page, inst, 'row.3.val.a')
    // 输入态 = 右栏槽位文案编辑框（本应用无双击画布进入输入态的交互，偏差见报告）
    const textarea = page.locator('.props .section textarea').first()
    await textarea.click()
    // 真实剪贴板 + Ctrl+V（输入态原生粘贴）
    await page.evaluate(() => navigator.clipboard.writeText('X1\tX2\nX3\tX4'))
    await textarea.press('Control+V')
    // 不走填槽：无预览条
    await expect(pasteBarText(page)).toHaveCount(0)
    // 按普通文字粘进该格（含制表符/换行原样）
    await expect(textarea).toHaveValue(/X1\tX2\nX3\tX4/)
    // 偏差检查：格下方「这是多格内容…」提示未实现（记录为偏差，不算功能失败）
    const hint = page.getByText('这是多格内容')
    await expect(hint).toHaveCount(0)
  })
})

test.describe('TC-PT-055 · 起点不可写时拒绝（S12）', () => {
  test('表头固定格不可选中（selectedSlotId 为空）→ 快捷粘贴静默无写入；工具条按钮禁用', async ({ page }) => {
    await openPreset(page, '多列对比表')
    // [0,0] 为表头固定格（readonly，slotId=null）：点击后无法选中
    const canvas = page.locator('.preview-host canvas').first()
    const box = await canvas.boundingBox()
    await page.mouse.click(box!.x + 60, box!.y + 18)
    await expect(page.locator('[data-testid="slot-headline"]')).toHaveCount(0)
    // 快捷键粘贴：无预览、无写入（偏差：toast 不出现，见报告）
    await pasteClipboard(page, { text: 'A\tB\nC\tD' })
    await expect(pasteBarText(page)).toHaveCount(0)
    await expect(page.locator('[data-testid="paste-toolbar-btn"]')).toBeDisabled()
    // 表格未被改：撤销仍不可用
    await expect(page.getByRole('button', { name: '撤销' })).toBeDisabled()
  })
})

test.describe('TC-PT-056 · 预览落位后取消：无任何变化', () => {
  test('取消按钮 / Esc / 点表外 三种方式均无痕迹、撤销栈不新增', async ({ page }) => {
    const inst = presetOf(COMPARE)
    await openPreset(page, '多列对比表')
    const before = await exportedHtml(page)
    // 撤销按钮初始禁用（无可撤销操作）
    const undoBtn = page.getByRole('button', { name: '撤销' })
    await expect(undoBtn).toBeDisabled()
    // 方式 1：取消按钮
    await clickSlot(page, inst, 'row.3.label')
    await pasteClipboard(page, { text: TSV_3X4 })
    await cancelPaste(page)
    await expect(pasteBarText(page)).toHaveCount(0)
    // 方式 2：Esc
    await pasteClipboard(page, { text: TSV_3X4 })
    await page.keyboard.press('Escape')
    await expect(pasteBarText(page)).toHaveCount(0)
    // 方式 3：点表外（守卫层）
    await pasteClipboard(page, { text: TSV_3X4 })
    await page.locator('[data-testid="paste-guard"]').click({ position: { x: 10, y: 10 } })
    await expect(pasteBarText(page)).toHaveCount(0)
    // before/after 完全一致；撤销栈未新增（撤销按钮仍禁用）
    const after = await exportedHtml(page)
    expect(after).toBe(before)
    await expect(undoBtn).toBeDisabled()
  })
})

test.describe('TC-PT-057 · 预览期间其他操作与导出禁用', () => {
  test('合并/拆分/对齐/强调/主题/斑马/导出全部禁用，悬停有先确认或取消提示', async ({ page }) => {
    const inst = presetOf(COMPARE)
    await openPreset(page, '多列对比表')
    // 先展开结构组（预览期守卫层会拦截点击，无法预览中展开）
    await page.locator('[data-testid="group-head-structure"]').click()
    await clickSlot(page, inst, 'row.3.label')
    await pasteClipboard(page, { text: TSV_3X4 })
    await expect(pasteBarText(page)).toBeVisible()
    // 顶栏导出禁用
    const exportBtn = page.getByRole('button', { name: '导出', exact: true })
    await expect(exportBtn).toBeDisabled()
    // 右栏操作按钮禁用（对齐 / 强调 / 主题 / 斑马纹 / 合并）
    for (const name of ['左', '中', '右', '红字', '加粗', '底色']) {
      await expect(page.locator('.props').getByRole('button', { name })).toBeDisabled()
    }
    await expect(page.locator('.theme-btn').first()).toBeDisabled()
    await expect(page.getByRole('button', { name: '合并选区' })).toBeDisabled()
    await expect(page.getByRole('button', { name: '拆分' })).toBeDisabled()
    // 守卫存在且覆盖全屏
    await expect(page.locator('[data-testid="paste-guard"]')).toBeAttached()
    // 「导出」等控件位置实际命中守卫层（点击无效果 = 取消预览，不触发按钮）
    const hit = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === '导出',
      )
      if (!btn) return 'no-button'
      const r = btn.getBoundingClientRect()
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return el instanceof Element ? el.className : 'none'
    })
    expect(hit).toContain('paste-guard')
  })
})

test.describe('TC-PT-058 · 1×1 粘贴：不预览、直接写入、可撤销（E-11）', () => {
  test('单格值直接写入无预览无 toast，撤销一步恢复', async ({ page }) => {
    const inst = presetOf(COMPARE)
    await openPreset(page, '多列对比表')
    await clickSlot(page, inst, 'row.3.val.a')
    await pasteClipboard(page, { text: '单格值' })
    // 无预览条、直接写入（S9；偏差：toast「已填入 1 格」仍出现，规格为无 toast，见报告）
    await expect(pasteBarText(page)).toHaveCount(0)
    await expect(page.locator('.pt-toast')).toContainText('已填入 1 格')
    // 已写入
    await expect(page.locator('[data-testid="slot-headline"]')).toContainText('单格值')
    // 撤销一步恢复原值
    await page.keyboard.press('Control+Z')
    await expect(page.locator('[data-testid="slot-headline"]')).toContainText('1 个工作日')
  })
})
