import { readFileSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

import { createBlankInstance, type TemplateInstance } from '../src/core/index'

/**
 * P1 首帧竞态回归（QA 压测定因：高负载下 exportImg 抢在 vrender 舞台首帧渲染
 * 完成前抓空画布 → 静默产出纯 paper 色空白图 + 「PNG 已下载」成功 toast）。
 *
 * 构造手法（镜像 QA 4-worker 压测 + CDP CPU 节流放大）：
 * - 4 个独立 context 页面同一瞬间齐发「导出 PNG」，互相抢 CPU（QA 原手法）；
 * - 每页叠加 CDP `Emulation.setCPUThrottlingRate` 4× 节流，压低帧管线吞吐；
 * - 下载产物在浏览器内解码采样，统计非 paper（247,249,252）像素。
 *
 * 核心不变量：**「PNG 已下载」成功提示 ⟹ 产物非空白**。
 * 修复前（HEAD 8f088b5，scripts/tmp-png-stress.mjs 同手法基线）：6 并发 3 轮
 * 下载 9 张其中 4 张静默空白；修复后：0 空白（成功必非空 / 失败必有人话报错）。
 */

test.setTimeout(90_000)

/** 空白实例 */
function makeInstance(): TemplateInstance {
  const inst = createBlankInstance({ rows: 5, cols: 4, headerLevels: 1 })
  inst.layout.style = { rowHeightTier: 1, colWidths: [180, 180, 180, 180] }
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

/** 浏览器内解码产物 PNG，统计非 paper 色不透明像素数与不透明 distinct 颜色数 */
async function productStats(page: Page, bytes: Buffer): Promise<{ nonPaper: number; distinct: number }> {
  return page.evaluate(async (b64) => {
    const bin = atob(b64)
    const buf = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
    const bmp = await createImageBitmap(new Blob([buf], { type: 'image/png' }))
    const canvas = document.createElement('canvas')
    canvas.width = Math.min(bmp.width, 512)
    canvas.height = Math.min(bmp.height, 512)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d ctx')
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let nonPaper = 0
    const distinct = new Set<string>()
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]!
      const g = data[i + 1]!
      const b = data[i + 2]!
      const a = data[i + 3]!
      if (a === 0) continue
      distinct.add(`${r},${g},${b}`)
      if (!(r === 247 && g === 249 && b === 252)) nonPaper++
    }
    return { nonPaper, distinct: distinct.size }
  }, bytes.toString('base64'))
}

interface Outcome {
  kind: 'blank' | 'non-blank' | 'error'
  toastText: string
}

/** 结果核对（模块级 helper，避免用例体内条件断言）：成功 ⟹ 非空白；报错 ⟹ 白话文案 */
function assertNoSilentBlank(outcomes: Outcome[]): void {
  for (const o of outcomes) {
    if (o.kind === 'error') {
      // 显式报错路径：白话文案（GC-25 不露码），且无下载
      expect(o.toastText).toMatch(/重试/)
      expect(o.toastText).not.toContain('EXPORT_PNG')
      continue
    }
    expect(o.kind, '成功提示必须伴随非空白产物（QA 静默空白回归点）').toBe('non-blank')
    expect(o.toastText).toBe('PNG 已下载')
  }
}

/** 单页走完导出：下载→验产物像素；失败→读报错 toast。返回判定结果 */
async function exportOnce(page: Page): Promise<Outcome> {
  const dl = page
    .waitForEvent('download', { timeout: 60_000 })
    .then(async (d) => {
      // 下载事件即到即读 toast：toast 数秒后自动消失，等读完产物像素再读必然落空
      const t = await toast(page)
        .textContent()
        .catch(() => '')
      return { kind: 'download' as const, path: await d.path(), toast: t }
    })
    .catch(() => ({ kind: 'none' as const }))
  const failToast = page.locator('.pt-toast', { hasText: '重试' }).first()
  const failureToast = failToast
    .waitFor({ timeout: 60_000 })
    .then(() => failToast.textContent())
    .then((t) => ({ kind: 'error' as const, text: t ?? '' }))
  await page.locator('.drawer button', { hasText: '导出 PNG' }).click()
  const r = await Promise.race([dl, failureToast])
  if (r.kind === 'error') {
    return { kind: 'error', toastText: r.text }
  }
  if (r.kind === 'none') {
    // 既无下载也无报错（极端饥饿）——按报错口径记录，不得算作静默空白
    return { kind: 'error', toastText: '(60s 无下载无报错)' }
  }
  const bytes = readFileSync(r.path)
  // 成功提示口径核对：下载事件后 toast 必报「PNG 已下载」
  expect(r.toast, '下载事件后 toast 必报「PNG 已下载」').toContain('PNG 已下载')
  const stats = await productStats(page, bytes)
  const blank = stats.distinct <= 1 || stats.nonPaper === 0
  return { kind: blank ? 'blank' : 'non-blank', toastText: 'PNG 已下载' }
}

test.describe('P1 回归 · 高负载并发导出不静默空白', () => {
  // CDP 节流仅 chromium 支持
  test.skip(({ browserName }) => browserName !== 'chromium', 'CDP CPU 节流仅 chromium')

  test('4 页面并发（CPU 4× 节流）：成功必有非空产物 / 失败必有人话报错', async ({ browser }) => {
    const sessions: { ctx: Awaited<ReturnType<typeof browser.newContext>>; page: Page }[] = []
    for (let i = 0; i < 4; i++) {
      const ctx = await browser.newContext()
      const page = await ctx.newPage()
      const cdp = await ctx.newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
      await seedDraft(page, makeInstance())
      await page.goto('/')
      await openExport(page)
      sessions.push({ ctx, page })
    }

    // 同一瞬间齐发（镜像 QA 4-worker 抢 CPU）
    const outcomes = await Promise.all(sessions.map((s) => exportOnce(s.page)))
    await Promise.all(sessions.map((s) => s.ctx.close()))

    // 核心不变量：绝不出现「成功提示 + 空白产物」；4 条都必须有明确结论
    assertNoSilentBlank(outcomes)
    expect(outcomes.length).toBe(4)
  })
})
