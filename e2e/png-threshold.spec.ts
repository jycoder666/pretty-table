import { readFileSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

import { createBlankInstance, measureContentSize, type TemplateInstance } from '../src/core/index'

/**
 * T33 · PNG 门槛校准（PoC-1c / PoC-1d / 兜底演练）：
 * - 真实浏览器（dev server）经 UI 走「导出 PNG」全链路，下载产物解析 IHDR 实测像素尺寸
 * - 留白口径：（内容 + 32）× 倍率（PAD=16 四周）
 * - 门槛用 ?pt-png-max 覆盖到可达规模（PoC-1d 测法），兜底用 ?pt-fault 注入
 * - 大表构造：LIMITS 内取满（20 行 × 12 列 × 列宽 360 × 行高宽松档），
 *   内容 4322×962 → 2× ≈ 17.3M px（跨默认门槛 16,777,216）、3× ≈ 39.0M px
 */

test.setTimeout(60_000)

/** 空白实例（可覆写排版档位） */
function makeInstance(opts?: { colWidths?: number[]; rows?: number; cols?: number }) {
  const inst = createBlankInstance({
    rows: opts?.rows ?? 8,
    cols: opts?.cols ?? 4,
    headerLevels: 1,
  })
  inst.layout.style = { rowHeightTier: 3, colWidths: opts?.colWidths ?? [180, 180, 180, 180] }
  return inst
}

/** 把实例写进 idb-keyval 草稿位（db=pretty-table / store=kv / key=draft:current），
 *  addInitScript 里等写完再放行页面脚本，App onMounted 的 tryRestoreDraft 一定能读到 */
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

/** 下载产物 PNG 头（IHDR）：宽高各 4 字节大端 */
function pngDims(path: string): { w: number; h: number } {
  const b = readFileSync(path)
  expect(b.subarray(1, 4).toString('ascii')).toBe('PNG')
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
}

async function openExport(page: Page) {
  await page.getByRole('button', { name: '导出', exact: true }).click()
  await expect(page.locator('.drawer')).toBeVisible()
}

async function chooseScale(page: Page, s: 1 | 2 | 3) {
  await page.locator('.seg-btn', { hasText: `${s}×` }).click()
  await expect(page.locator('.seg-btn', { hasText: `${s}×` })).toHaveAttribute('aria-pressed', 'true')
}

/** 走完「导出 PNG」并等下载，返回产物像素尺寸 */
async function exportAndDownload(page: Page): Promise<{ w: number; h: number }> {
  const dl = page.waitForEvent('download', { timeout: 45_000 })
  await page.locator('.drawer button', { hasText: '导出 PNG' }).click()
  const download = await dl
  const path = await download.path()
  expect(path).not.toBeNull()
  return pngDims(path as string)
}

const toast = (page: Page) => page.locator('.pt-toast[role="status"]')

test.describe('T33 · PNG 出图像素尺寸口径（实测画布）', () => {
  test('1×/2×/3× 产物尺寸 =（内容 + 32）× 倍率', async ({ page }) => {
    const inst = makeInstance()
    const content = measureContentSize(inst)
    await seedDraft(page, inst)
    await page.goto('/')
    await openExport(page)
    for (const s of [1, 2, 3] as const) {
      await chooseScale(page, s)
      const dims = await exportAndDownload(page)
      expect(dims.w).toBe((content.width + 32) * s)
      expect(dims.h).toBe((content.height + 32) * s)
    }
  })
})

test.describe('T33 · PoC-1d：?pt-png-max 覆盖测法（大表 20×12·列宽 360·行高宽松）', () => {
  const big = makeInstance({ rows: 20, cols: 12, colWidths: Array.from({ length: 12 }, () => 360) })
  const content = measureContentSize(big)
  const px = (s: number) => (content.width + 32) * s * ((content.height + 32) * s)

  test('pt-png-max 取 2×/3× 预估之间：3× 必触发 EXPORT_PNG_TOO_LARGE，2× 必通过', async ({ page }) => {
    await seedDraft(page, big)
    // 2× ≈ 17.31M、3× ≈ 38.95M → 中间值
    await page.goto(`/?pt-png-max=${Math.round((px(2) + px(3)) / 2)}`)
    await openExport(page)
    // 3×：超门槛 → 白话降倍建议（不露错误码）
    await chooseScale(page, 3)
    const dl3 = page.waitForEvent('download', { timeout: 8_000 }).then(
      () => 'downloaded',
      () => 'no-download',
    )
    await page.locator('.drawer button', { hasText: '导出 PNG' }).click()
    await expect(toast(page)).toContainText('当前 3× 超限，请改用 2× 或 1× 后重试')
    expect(await dl3).toBe('no-download')
    // 2×：低于覆盖门槛 → 必须真的出图
    await chooseScale(page, 2)
    const dims = await exportAndDownload(page)
    expect(dims.w).toBe((content.width + 32) * 2)
    expect(dims.h).toBe((content.height + 32) * 2)
  })

  test('pt-png-max = 2× 预估 − 1（边界减一）：2× 必触发，1× 仍通过', async ({ page }) => {
    await seedDraft(page, big)
    await page.goto(`/?pt-png-max=${px(2) - 1}`)
    await openExport(page)
    // 2×：恰好压线之上 → 触发（> maxPixels 严格判定）
    await chooseScale(page, 2)
    await page.locator('.drawer button', { hasText: '导出 PNG' }).click()
    await expect(toast(page)).toContainText('当前 2× 超限，请改用 1× 后重试')
    // 1×（≈4.33M px）：低于门槛 → 出图且尺寸符合口径
    await chooseScale(page, 1)
    const dims = await exportAndDownload(page)
    expect(dims.w).toBe((content.width + 32) * 1)
    expect(dims.h).toBe((content.height + 32) * 1)
  })
})

test.describe('T33 · 兜底演练：?pt-fault=EXPORT_PNG_TOO_LARGE', () => {
  test('直接出人话提示、不建产物、不自动降倍', async ({ page }) => {
    const inst = makeInstance()
    await seedDraft(page, inst)
    await page.goto('/?pt-fault=EXPORT_PNG_TOO_LARGE')
    await openExport(page)
    await chooseScale(page, 2)
    let downloads = 0
    page.on('download', () => {
      downloads += 1
    })
    await page.locator('.drawer button', { hasText: '导出 PNG' }).click()
    // 人话提示（GC-25：不露错误码）
    await expect(toast(page)).toContainText('当前 2× 超限，请改用 1× 后重试')
    await expect(toast(page)).not.toContainText('EXPORT_PNG_TOO_LARGE')
    // 不自动降倍：倍率选择维持原样
    await expect(page.locator('.seg-btn', { hasText: '2×' })).toHaveAttribute('aria-pressed', 'true')
    // 不建产物：无下载事件
    await page.waitForTimeout(1_500)
    expect(downloads).toBe(0)
  })
})
