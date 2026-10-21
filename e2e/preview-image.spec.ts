import { expect, test, type Page } from '@playwright/test'

import { createBlankInstance, type TemplateInstance } from '../src/core/index'

/**
 * 预览画布图片格成像回归（与导出同源）：
 * - 修复前：coreHost.paint 的 toOption({ mode: 'preview' }) 不带 ctx.images，
 *   customLayout 闭包里 ctx.images?.get(image) 恒 undefined → drawImageCell 返回
 *   undefined → VTable 默认绘制（图片格 text 为空 → 空白格子），与导出（png.ts
 *   preloadImages 注入）不同源。
 * - 修复后：coreHost 预加载图片资源注入 RenderContext.images，预览图片格与导出
 *   走同一 drawImageCell（coverCrop 单点裁剪 + vrender 同步绘制）。
 * 断言口径：1×1 红图 cover 铺满图片格 → 预览 canvas 内必存在近红像素
 * （r>200 / g<80 / b<80；默认主题 primary 为蓝/绿/棕系，无干扰源）。
 */

test.setTimeout(60_000)

/** 1×1 红色 PNG（与 png-image.spec 同源字节） */
const RED_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'

/** 空白实例 + 图片槽（不经上传校验，模拟草稿恢复直接落库） */
function makeImageInstance(image: string): TemplateInstance {
  const inst = createBlankInstance({ rows: 5, cols: 4, headerLevels: 1 })
  const sid = inst.layout.slotGrid![1]![1]!
  inst.slots[sid] = { image }
  return inst
}

/** 把实例写进 idb-keyval 草稿位（与 png-image.spec 同一基建） */
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

/** 预览区全部 canvas 的近红像素总数（r>200 / g<80 / b<80；无 canvas 时 0 供轮询重试） */
async function countPreviewRedPixels(page: Page): Promise<number> {
  return page.evaluate(() => {
    let red = 0
    for (const canvas of document.querySelectorAll<HTMLCanvasElement>('.preview-host canvas')) {
      const { width, height } = canvas
      if (width === 0 || height === 0) continue
      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      const data = ctx.getImageData(0, 0, width, height).data
      for (let i = 0; i < data.length; i += 4) {
        if (data[i]! > 200 && data[i + 1]! < 80 && data[i + 2]! < 80) red++
      }
    }
    return red
  })
}

test.describe('预览画布图片格成像（与导出同源）', () => {
  test('含图实例预览态：图片格区域像素非空（红图 cover 铺满）', async ({ page }) => {
    const inst = makeImageInstance(RED_1X1)
    await seedDraft(page, inst)
    await page.goto('/')
    // 预览表渲染完成（草稿恢复 → 渲染核动态加载 → ListTable 建装）
    await expect(page.locator('.preview-host canvas').first()).toBeVisible()
    // 图片格成像：轮询到近红像素出现（含首帧后的重绘窗口）
    await expect
      .poll(() => countPreviewRedPixels(page), { timeout: 15_000, intervals: [250, 500, 1_000] })
      .toBeGreaterThan(0)
  })
})
