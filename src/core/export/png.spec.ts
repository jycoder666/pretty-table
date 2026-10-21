import { describe, expect, it, vi } from 'vitest'
import { COMPARE_ALPHA_V1 } from '../templates'
import { measureContentSize } from '../adapter/toOption'
import { cloneInstance } from '../schema/validate'
import { exportPng, measurePng, PNG_MAX_PIXELS_DEFAULT, collectImageUrls, preloadImages } from './png'

describe('PNG 倍率与透明底（T27）', () => {
  it('三档倍率预估 =（内容 + 32）× 倍率（±2px）', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    const content = measureContentSize(inst)
    for (const s of [1, 2, 3] as const) {
      const m = measurePng(inst, s)
      expect(Math.abs(m.outWidth - (content.width + 32) * s)).toBeLessThanOrEqual(2)
      expect(Math.abs(m.outHeight - (content.height + 32) * s)).toBeLessThanOrEqual(2)
    }
  })

  it('非法倍率直接拒绝，不进渲染路径', async () => {
    const r = await exportPng(cloneInstance(COMPARE_ALPHA_V1), { scale: 5 as 3 })
    expect(r.ok).toBe(false)
    expect(r.ok ? undefined : r.error.code).toBe('EXPORT_PNG_FAIL')
  })

  it('输出超门槛 → EXPORT_PNG_TOO_LARGE，不自动降倍', async () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    const m1 = measurePng(inst, 1)
    // 门槛压到 1× 预估之下：任何倍率都必须拒绝（含默认 2×），验证无静默降倍
    const r = await exportPng(inst, { scale: 2, maxPixels: m1.outWidth * m1.outHeight - 1 })
    expect(r.ok).toBe(false)
    expect(r.ok ? undefined : r.error.code).toBe('EXPORT_PNG_TOO_LARGE')
  })

  it('门槛默认 16,777,216（T19 实测回写值）', () => {
    expect(PNG_MAX_PIXELS_DEFAULT).toBe(16_777_216)
  })
})

// ── 交互升级 T03：PNG 导出图片预加载（RenderContext.images 注入）──

describe('PNG 图片预加载（交互升级 T03）', () => {
  const T03_IMG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

  it('collectImageUrls：只收集白名单内 data URI（GC-22），去重', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.slots['row.2.val.a'] = { image: T03_IMG }
    inst.slots['row.3.val.a'] = { image: 'http://evil.example/x.png' }
    inst.slots['row.4.val.a'] = { image: '"><script>alert(1)</script>' }
    inst.slots['row.5.val.a'] = '普通文字'
    expect(collectImageUrls(inst)).toEqual([T03_IMG])
  })

  it('preloadImages：加载失败的图跳过，不中断导出（画空格不炸）', async () => {
    const BAD = 'data:image/png;base64,QUFB'
    const failOn = new Set([BAD])
    class FakeImage {
      onload?: () => void
      onerror?: () => void
      naturalWidth = 8
      naturalHeight = 8
      set src(v: string) {
        queueMicrotask(() => (failOn.has(v) ? this.onerror?.() : this.onload?.()))
      }
    }
    vi.stubGlobal('Image', FakeImage as unknown as typeof Image)
    try {
      const map = await preloadImages([T03_IMG, BAD])
      expect(map.has(T03_IMG)).toBe(true)
      expect(map.has(BAD)).toBe(false)
      expect(map.size).toBe(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
