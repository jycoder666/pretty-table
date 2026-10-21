import { readFileSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

import { createBlankInstance, measureContentSize, type TemplateInstance } from '../src/core/index'

/**
 * P1 修复回归（真浏览器防漏网）：
 * - 含图实例导出 PNG：修复前 customRender 依赖 args.ctx（vtable 1.26.8 无此字段），
 *   导出期在 VTable dealWithCustom 内抛 TypeError，无下载。修复后必须出图，
 *   且图片区域像素非空（1×1 红图 cover 铺满格子 → 产物内必存在红色像素）。
 * - 预加载失败路径（草稿恢复口径）：图片值过白名单正则但解码失败 →
 *   导出必须显式报错（toast 人话提示），不得静默丢图。
 */

test.setTimeout(60_000)

/** 1×1 红色 PNG（自造：IHDR 8bit RGB + IDAT(zlib 红) + IEND，CRC 齐全） */
const RED_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'

/** 同一 PNG 的 IDAT 载荷被破坏（仍满足白名单正则，但浏览器解码失败） */
const BROKEN_1X1 = RED_1X1.replace('EQVR4nGP4z8AAAAMBAQDJ/pLv', 'EQVR4nAAAAAAAAAAAAAAAAAAAAAAAA')

/** 空白实例 + 图片槽（不经上传校验，模拟草稿恢复直接落库） */
function makeImageInstance(image: string): TemplateInstance {
  const inst = createBlankInstance({ rows: 5, cols: 4, headerLevels: 1 })
  const sid = inst.layout.slotGrid![1]![1]!
  inst.slots[sid] = { image }
  return inst
}

/** 把实例写进 idb-keyval 草稿位（与 png-threshold.spec 同一基建） */
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

async function openExport(page: Page) {
  await page.getByRole('button', { name: '导出', exact: true }).click()
  await expect(page.locator('.drawer')).toBeVisible()
}

/** 走完「导出 PNG」，返回下载产物字节 */
async function exportAndDownloadBytes(page: Page): Promise<Buffer> {
  const dl = page.waitForEvent('download', { timeout: 45_000 })
  await page.locator('.drawer button', { hasText: '导出 PNG' }).click()
  const download = await dl
  const path = await download.path()
  expect(path).not.toBeNull()
  return readFileSync(path as string)
}

/** 在浏览器里解码 PNG 并统计近红像素数（r>200 / g<80 / b<80） */
async function countRedPixels(page: Page, bytes: Buffer): Promise<number> {
  return page.evaluate(async (b64) => {
    const bin = atob(b64)
    const buf = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
    const bmp = await createImageBitmap(new Blob([buf], { type: 'image/png' }))
    const canvas = document.createElement('canvas')
    canvas.width = bmp.width
    canvas.height = bmp.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d ctx')
    ctx.drawImage(bmp, 0, 0)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let red = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i]! > 200 && data[i + 1]! < 80 && data[i + 2]! < 80) red++
    }
    return red
  }, bytes.toString('base64'))
}

test.describe('P1 回归 · 含图实例导出 PNG', () => {
  test('导出成功（无 pageerror、有下载）且图片区域像素非空', async ({ page }) => {
    const inst = makeImageInstance(RED_1X1)
    const content = measureContentSize(inst)
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))
    await seedDraft(page, inst)
    await page.goto('/')
    await openExport(page)
    const bytes = await exportAndDownloadBytes(page)
    // PNG 头与口径：IHDR 尺寸 =（内容 + 32）× 2×
    expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(bytes.readUInt32BE(16)).toBe((content.width + 32) * 2)
    expect(bytes.readUInt32BE(20)).toBe((content.height + 32) * 2)
    // 像素级：图片格区域被红图 cover 铺满 → 产物内必有红色像素
    const red = await countRedPixels(page, bytes)
    expect(red).toBeGreaterThan(0)
    // 全程无未捕获异常（修复前：drawImageCell 读 args.ctx.drawImage 抛 TypeError）
    expect(pageErrors).toEqual([])
    await expect(toast(page)).toContainText('PNG 已下载')
  })

  test('预加载失败（图值损坏）→ 显式人话报错，不静默丢图、不建产物', async ({ page }) => {
    const inst = makeImageInstance(BROKEN_1X1)
    await seedDraft(page, inst)
    await page.goto('/')
    await openExport(page)
    let downloads = 0
    page.on('download', () => {
      downloads += 1
    })
    await page.locator('.drawer button', { hasText: '导出 PNG' }).click()
    // GC-25：人话提示，不露错误码
    await expect(toast(page)).toContainText('图片资源未能加载，请重新上传后再导出')
    await expect(toast(page)).not.toContainText('EXPORT_PNG')
    await page.waitForTimeout(1_500)
    expect(downloads).toBe(0)
  })
})
