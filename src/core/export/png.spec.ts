import { describe, expect, it, vi } from 'vitest'
import { COMPARE_ALPHA_V1 } from '../templates'
import { measureContentSize } from '../adapter/toOption'
import { cloneInstance } from '../schema/validate'
import {
  exportPng,
  measurePng,
  PNG_MAX_PIXELS_DEFAULT,
  collectImageUrls,
  preloadImages,
  parseColorRgb,
  hasContentPixels,
  hasRenderedContent,
  waitFirstRenderSignal,
  RenderNotReadyError,
} from './png'
import type { ListTable } from '../render/vtableLite'

// T34：VTable 深入口后绕开了 vitest 依赖预打包，lottie-web（vrender 动画依赖）
// 在 jsdom（无 canvas）模块求值期即崩。本文件全部为失败路径/估算用例，不构造真表，
// 直接 stub 掉渲染入口。
vi.mock('../render/vtableLite', () => ({
  ListTable: class {},
}))

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

  it('P1 缺陷2：图片预加载失败 → EXPORT_PNG_IMAGE_MISSING 显式失败（不静默画空图）', async () => {
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
      const inst = cloneInstance(COMPARE_ALPHA_V1)
      inst.slots['row.2.val.a'] = { image: BAD }
      const r = await exportPng(inst, { scale: 2 })
      expect(r.ok).toBe(false)
      expect(r.ok ? undefined : r.error.code).toBe('EXPORT_PNG_IMAGE_MISSING')
      // GC-25：message 为人话口径，壳层 errorCopy 同文案（码不外露）
      expect(r.ok ? undefined : r.error.message).toBe('图片资源未能加载，请重新上传后再导出')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

// ── P1 首帧竞态防护：信号等待 + 空图守卫（QA 4-worker 压测：旧口径静默空白图）──

describe('P1 · paper 色解析 parseColorRgb', () => {
  it('六位 / 三位 hex / rgb() 均可解析，预设 paper = #F7F9FC', () => {
    expect(parseColorRgb('#F7F9FC')).toEqual({ r: 247, g: 249, b: 252 })
    expect(parseColorRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(parseColorRgb('rgb(1, 2, 3)')).toEqual({ r: 1, g: 2, b: 3 })
    expect(parseColorRgb('rgba(10, 20, 30, 0.5)')).toEqual({ r: 10, g: 20, b: 30 })
  })

  it('异形格式返回 null（守卫放行不误伤）', () => {
    expect(parseColorRgb('hsl(0, 0%, 0%)')).toBeNull()
    expect(parseColorRgb('not-a-color')).toBeNull()
  })
})

describe('P1 · 内容像素判定 hasContentPixels', () => {
  const PAPER = { r: 247, g: 249, b: 252 }

  it('有 paper 基准：全 paper / 全透明 = 空白；含任一异色不透明像素 = 有内容', () => {
    const blankPaper = [247, 249, 252, 255, 247, 249, 252, 255]
    expect(hasContentPixels(blankPaper, PAPER)).toBe(false)
    const blankTransparent = [0, 0, 0, 0, 0, 0, 0, 0]
    expect(hasContentPixels(blankTransparent, PAPER)).toBe(false)
    const withContent = [247, 249, 252, 255, 200, 30, 30, 255]
    expect(hasContentPixels(withContent, PAPER)).toBe(true)
    // 半透明 paper 也不算内容（透明底导出边缘）
    const paperAlpha = [247, 249, 252, 128]
    expect(hasContentPixels(paperAlpha, PAPER)).toBe(false)
  })

  it('paper 未知（null）：退化口径 —— ≥2 种不透明颜色 = 有内容，单色/全透明 = 空白', () => {
    const mono = [10, 10, 10, 255, 10, 10, 10, 255]
    expect(hasContentPixels(mono, null)).toBe(false)
    const twoColors = [10, 10, 10, 255, 20, 20, 20, 255]
    expect(hasContentPixels(twoColors, null)).toBe(true)
    const transparent = [0, 0, 0, 0, 0, 0, 0, 0]
    expect(hasContentPixels(transparent, null)).toBe(false)
  })
})

describe('P1 · 探针环境降级（jsdom 无 canvas 实现不炸）', () => {
  it('画布未定型（0×0）→ null（调用方按未就绪继续等）', () => {
    expect(hasRenderedContent(null, { r: 0, g: 0, b: 0 })).toBeNull()
    const zero = document.createElement('canvas')
    zero.width = 0
    zero.height = 0
    expect(hasRenderedContent(zero, { r: 0, g: 0, b: 0 })).toBeNull()
  })

  it('getContext 不可用（jsdom）→ null，不抛错不误报', () => {
    const canvas = document.createElement('canvas')
    expect(hasRenderedContent(canvas, { r: 0, g: 0, b: 0 })).toBeNull()
  })
})

describe('P1 · 渲染就绪信号 waitFirstRenderSignal', () => {
  function fakeTable(on?: (type: string, listener: () => void) => number, off?: (id: number) => void) {
    return { on, off } as unknown as ListTable
  }

  it('实例无 on 能力（单测 stub）→ 直接放行', async () => {
    await expect(waitFirstRenderSignal(fakeTable(), 20)).resolves.toBeUndefined()
  })

  it('after_render 已在监听挂上后派发 → 立即放行', async () => {
    let listener: (() => void) | undefined
    const t = fakeTable((_type, l) => {
      listener = l
      return 1
    }, () => {})
    const p = waitFirstRenderSignal(t, 500)
    listener?.()
    await expect(p).resolves.toBeUndefined()
  })

  it('信号迟迟不来 → 超时拒绝 RenderNotReadyError（导出取消，不抓空图）', async () => {
    const t = fakeTable(() => 1, () => {})
    await expect(waitFirstRenderSignal(t, 15)).rejects.toBeInstanceOf(RenderNotReadyError)
  })
})
