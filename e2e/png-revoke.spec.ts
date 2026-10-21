import { expect, test, type Page } from '@playwright/test'

import { createBlankInstance, type TemplateInstance } from '../src/core/index'

/**
 * 导出 blob URL 生命周期回归（QA 压测定因：旧实现在 a.click() 后同步
 * revokeObjectURL，极端 CPU 饥饿下下载启动晚于 revoke 到达 blob 注册表
 * → 下载静默丢失——无下载、无报错、按钮已恢复、成功 toast 照常出现）。
 *
 * 构造手法（温和版，镜像 png-firstframe.spec 的 CDP 节流基建）：
 * - 2 个独立 context 页面同一瞬间齐发「导出 PNG」，互相抢 CPU；
 * - 每页叠加 CDP `Emulation.setCPUThrottlingRate` 8× 节流，拉长下载启动窗口；
 * - 先挂 download 事件监听再点导出：断言「PNG 已下载」成功 toast ⟹
 *   download 事件最终到达（旧实现若 revoke 赢了下载启动，这里等不到 download）。
 *
 * 极端饥饿下旧代码丢下载概率约 10~30%/页，属概率性复现，本用例在旧代码上
 * 可能偶然绿——确定性先红证据由单测 export-download-revoke.spec.ts 提供
 * （click 后不得同步 revoke，旧代码必红）。修复后本用例为常绿回归守卫。
 */

test.setTimeout(120_000)

/** 空白实例（小表，确保导出本身必成功，聚焦下载链路） */
function makeInstance(): TemplateInstance {
  const inst = createBlankInstance({ rows: 5, cols: 4, headerLevels: 1 })
  inst.layout.style = { rowHeightTier: 1, colWidths: [180, 180, 180, 180] }
  return inst
}

/** 把实例写进 idb-keyval 草稿位（与 png-firstframe.spec 同一基建） */
async function seedDraft(page: Page, inst: TemplateInstance) {
  await page.addInitScript(
    (plain) => {
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
    },
    JSON.parse(JSON.stringify(inst)) as unknown,
  )
}

const toast = (page: Page) => page.locator('.pt-toast[role="status"]')

/** 单页：先挂 download 监听 → 点导出 → 成功 toast ⟹ download 事件到达 */
async function exportAndAssertDownloadArrives(page: Page): Promise<boolean> {
  const downloadArrived = page
    .waitForEvent('download', { timeout: 60_000 })
    .then(() => true)
    .catch(() => false)
  await page.locator('.drawer button', { hasText: '导出 PNG' }).click()
  await expect(toast(page)).toContainText('PNG 已下载', { timeout: 60_000 })
  return downloadArrived
}

test.describe('导出下载 · 极端负载不静默丢下载（延迟 revoke 回归）', () => {
  // CDP 节流仅 chromium 支持
  test.skip(({ browserName }) => browserName !== 'chromium', 'CDP CPU 节流仅 chromium')

  test('CPU 8× 节流双页并发：成功提示 ⟹ download 事件最终到达', async ({ browser }) => {
    const sessions: { ctx: Awaited<ReturnType<typeof browser.newContext>>; page: Page }[] = []
    for (let i = 0; i < 2; i++) {
      const ctx = await browser.newContext()
      const page = await ctx.newPage()
      const cdp = await ctx.newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 8 })
      await seedDraft(page, makeInstance())
      await page.goto('/')
      await page.getByRole('button', { name: '导出', exact: true }).click()
      await expect(page.locator('.drawer')).toBeVisible()
      sessions.push({ ctx, page })
    }

    // 同一瞬间齐发（互相抢 CPU，拉长 revoke ↔ 下载启动的竞争窗口）
    const arrived = await Promise.all(
      sessions.map((s) => exportAndAssertDownloadArrives(s.page)),
    )
    await Promise.all(sessions.map((s) => s.ctx.close()))

    // 核心不变量：每一页成功提示之后 download 事件都必须最终到达
    expect(arrived, '成功 toast 必须伴随 download 事件到达（静默丢下载回归点）').toEqual([
      true,
      true,
    ])
  })
})
