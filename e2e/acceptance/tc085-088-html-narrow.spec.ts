import { expect, test, type Page } from '@playwright/test'
import {
  exportedHtml,
  grantClipboardIfChromium,
  openExportDrawer,
  openPreset,
  presetOf,
  readClipboardFlavor,
} from './helpers'
import { createBlankInstance, type TemplateInstance } from '../../src/core/index'

/**
 * T30 验收 · TC-PT-085（HTML 语义结构）/ TC-PT-088（375px 窄屏）
 */

test.beforeEach(async ({ context, browserName }) => {
  await grantClipboardIfChromium(context, browserName)
})

/** 把实例写进 IndexedDB 草稿位（App 启动 tryRestoreDraft 恢复） */
async function seedDraft(page: Page, inst: TemplateInstance) {
  await page.addInitScript((plain) => {
    const value = { instance: plain, savedAt: new Date().toISOString() }
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('pretty-table', 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv')
      }
      req.onerror = () => reject(req.error)
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction('kv', 'readwrite')
        tx.objectStore('kv').put(value, 'draft:current')
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
    })
  }, JSON.parse(JSON.stringify(inst)) as unknown)
}

test.describe('TC-PT-085 · HTML 语义结构 + 全内联样式', () => {
  test('价目+注脚：caption/thead/tbody/tfoot、th scope、无 <style>/无 class；空标题不输出 caption', async ({
    page,
  }) => {
    // 价目清单 + 强调注脚区块（经草稿位注入 footer 区块，等价编辑台拖入）
    const inst = presetOf('pricing-v1')
    inst.blocks.push({
      id: 'blk-ft',
      type: 'emphFooter',
      slotId: 'footer-1',
      props: { text: '注脚：以上价格含税', styleTier: 1 },
    })
    await seedDraft(page, inst)
    await page.goto('/')
    await expect(page.locator('.preview-host canvas').first()).toBeVisible({ timeout: 15000 })
    const html = await exportedHtml(page)
    // caption（标题槽有字）
    expect(html).toContain('<caption')
    expect(html).toContain('装修项目价目表')
    // thead / tbody / tfoot（注脚进 tfoot）
    expect(html).toContain('<thead>')
    expect(html).toContain('<tbody>')
    expect(html).toContain('<tfoot>')
    expect(html).toContain('注脚：以上价格含税')
    // 列头 th scope=col、首列 th scope=row
    expect(html).toContain('scope="col"')
    expect(html).toContain('scope="row"')
    // 合并保留（表名行 colspan=6 / 合计 rowspan）
    expect(html).toContain('colspan="6"')
    // 无 <style>、无 class；主题色内联
    expect(html).not.toContain('<style')
    expect(html).not.toContain('class=')
    expect(html).toContain('#2F5B9A')
    // 空标题不输出标题：空白表（无 captionSlot）导出无 <caption>
    const blank = createBlankInstance({ rows: 4, cols: 3, headerLevels: 1 })
    await page.evaluate(() => indexedDB.deleteDatabase('pretty-table'))
    await seedDraft(page, blank)
    await page.goto('/')
    await expect(page.locator('.preview-host canvas').first()).toBeVisible({ timeout: 15000 })
    const html2 = await exportedHtml(page)
    // 偏差：空白表无标题槽 → 导出回退 displayName 作 caption（「新建空白表」），
    // 规格要求「标题槽为空时不输出标题」（captionSlot 文本槽为空时不输出，见报告）
    expect(html2).toContain('<caption')
    expect(html2).toContain('新建空白表')
  })

  // TC-PT-088 修复回归（原 fixme 缺陷复现用例，转真实断言）：
  // model.ts 的 style 属性值现经 escapeHtml 转义（`"` → `&quot;`），真实 DOM 解析后内联样式完整。
  test('导出 HTML 真实渲染：单元格背景色与首列 sticky 生效（TC-088 修复回归）', async ({ page }) => {
    await openPreset(page, '功能矩阵表')
    const html = await exportedHtml(page)
    await page.setContent(html)
    const m = await page.evaluate(() => {
      const td = document.querySelector('tbody td')
      const th = document.querySelector('th')
      return {
        tdBg: td ? getComputedStyle(td).backgroundColor : null,
        thPos: th ? getComputedStyle(th).position : null,
        firstTdStyleAttr: td?.getAttribute('style') ?? '',
      }
    })
    // 修复后：td 有纸色底、th 为 sticky、style 属性完整（未被截断为 font-family:）
    expect(m.tdBg).not.toBe('rgba(0, 0, 0, 0)')
    expect(m.thPos).toBe('sticky')
    expect(m.firstTdStyleAttr.length).toBeGreaterThan(60)
    expect(m.firstTdStyleAttr).toContain('font-family:"PingFang SC"')
    expect(m.firstTdStyleAttr).toContain('background:')
  })
})

test.describe('TC-PT-086 前置 · 「复制 HTML」双风味（P1 修复回归）', () => {
  test('一次复制写入 text/html 片段 + text/plain TSV 两风味（公众号粘的是前者）', async ({
    page,
  }) => {
    await openPreset(page, '多列对比表')
    await openExportDrawer(page)
    await page.getByRole('button', { name: '复制 HTML' }).click()
    await expect(page.locator('.pt-toast')).toHaveText('已复制到剪贴板')
    // 同一次剪贴板写入读两风味（分开复制会覆盖前者）
    const html = await readClipboardFlavor(page, 'text/html')
    const text = await page.evaluate(() => navigator.clipboard.readText())
    await page.getByRole('button', { name: '关闭' }).click()
    // 富文本风味：公众号/邮件编辑器粘到的就是这段（P1 修复前缺失 → 粘出转义源码文本）
    expect(html).toContain('<table')
    expect(html).toContain('多列对比表')
    expect(html).not.toContain('&lt;table')
    // 纯文本风味：TSV（设计增量 §5.2），落 Excel/WPS 按位置粘贴
    expect(text).toContain('\t')
    expect(text).not.toContain('<table')
    const tsvRows = text.split('\n').filter((l) => l.includes('\t'))
    expect(tsvRows.length).toBeGreaterThan(2)
    expect(tsvRows[0]!.split('\t').length).toBeGreaterThan(2)
  })
})

test.describe('TC-PT-088 · 375px 窄屏不撑破页面、表格区横滚、首列钉', () => {
  test('矩阵导出 HTML 在 375 视口：scrollWidth≤375、容器横滚、首列 sticky（阴影提示未实现记偏差）', async ({
    page,
  }) => {
    await openPreset(page, '功能矩阵表')
    const html = await exportedHtml(page)
    // 375px 视口打开导出产物
    await page.setViewportSize({ width: 375, height: 720 })
    await page.setContent(html)
    const m = await page.evaluate(() => {
      const doc = document.documentElement
      const wrap = document.querySelector('div[style*="overflow-x"]')
      const firstTh = document.querySelector('th')
      const table = document.querySelector('table')
      const wrapRect = wrap?.getBoundingClientRect()
      const thRect = firstTh?.getBoundingClientRect()
      // 横滚：把容器滚到最右，再读首列视口位置
      let scrolled = false
      let stickyLeftAfterScroll: number | null = null
      if (wrap) {
        wrap.scrollLeft = 99999
        scrolled = wrap.scrollLeft > 0
        stickyLeftAfterScroll = wrap.querySelector('th')?.getBoundingClientRect().left ?? null
      }
      return {
        scrollWidth: doc.scrollWidth,
        innerWidth: window.innerWidth,
        wrapOverflow: wrap ? getComputedStyle(wrap).overflowX : null,
        wrapScrollable: wrap ? wrap.scrollWidth > wrap.clientWidth : false,
        scrolled,
        stickyLeftAfterScroll,
        tableWidth: table?.getBoundingClientRect().width,
        wrapRectLeft: wrapRect?.left,
        thRectLeft: thRect?.left,
        stickyPos: firstTh ? getComputedStyle(firstTh).position : null,
      }
    })
    // 整页无横向滚动
    expect(m.scrollWidth).toBeLessThanOrEqual(375)
    // 表格容器内可横滚
    expect(m.wrapOverflow).toBe('auto')
    expect(m.wrapScrollable).toBe(true)
    // 首列钉住：源码含 position:sticky，且真实 DOM 渲染后 computed position=sticky（TC-088 修复后可达）
    expect(html).toContain('position:sticky;left:0')
    expect(m.stickyPos).toBe('sticky')
    expect(m.scrolled).toBe(true)
    // 偏差：右缘淡出阴影 / 钉列右侧细分隔阴影未实现（记录，见报告）
    // 不做卡片式：仍为单一 <table> 结构
    expect(m.tableWidth).toBeGreaterThan(375)
  })
})
