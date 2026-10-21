// T34：VTable 经 vtableLite 深入口（plain ListTable + 构造期必需注册），与 coreHost 同口径，
// 避免 index 全量入口连带 PivotTable/PivotChart → vrender-components 图表依赖进包。
import { ListTable } from '../render/vtableLite'
import type { PngExportOptions, TemplateInstance } from '../types'
import { fail, ok, type Result } from '../errors'
import { toOption, measureContentSize } from '../adapter/toOption'
import { resolveTheme } from '../theme/palettes'
import { isImageDataUrl } from '../image/imageGuard'
import { PNG_MAX_PIXELS_DEFAULT, PNG_PAD, measurePng } from './pngSize'

// pngSize 是与 VTable 解耦的估算模块（壳层静态消费）；此处 re-export 保持
// 核内旧路径（./png）可用，但 @/core 出口只从 pngSize 静态导出（T34 切 chunk）。
export { PNG_MAX_PIXELS_DEFAULT, measurePng }

function waitFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number) => {
      if (left <= 0) resolve()
      else requestAnimationFrame(() => step(left - 1))
    }
    step(n)
  })
}

// ── P1 首帧竞态修复：QA 4-worker 压测实测（基线 b850527 与 HEAD 一致 100% 复现），
// 旧口径（画布尺寸稳定 + 1 帧 rAF）在 CPU 紧张时抢在 vrender 舞台首帧渲染完成前
// 抓到空画布 → 合成后 = 纯 paper 色静默空白图。三层防护：信号等待 + 内容探针 + 空图守卫。

/** 渲染就绪等待上限（ms）：超时走导出失败路径，绝不继续抓空图 */
const RENDER_READY_TIMEOUT_MS = 5000
/** 内容探针降采样网格边长：读像素开销可忽略，空白/内容判定足够 */
const PROBE_GRID = 64

/** 简化 RGB（paper 比对用） */
interface Rgb {
  r: number
  g: number
  b: number
}

/** 渲染未就绪（信号超时 / 画布迟迟无内容）：导出取消，绝不抓空图 */
export class RenderNotReadyError extends Error {
  constructor() {
    super('表格渲染未就绪')
    this.name = 'RenderNotReadyError'
  }
}

/**
 * 解析 CSS 颜色为 RGB（paper 空白比对口径）。
 * 支持 #RGB / #RRGGBB / rgb() / rgba()；主题预设均为 hex，异形格式返回 null（守卫放行不误伤）。
 */
export function parseColorRgb(color: string): Rgb | null {
  const s = color.trim().toLowerCase()
  let m = /^#([0-9a-f]{6})$/.exec(s)
  if (m) {
    const n = parseInt(m[1]!, 16)
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
  }
  m = /^#([0-9a-f]{3})$/.exec(s)
  if (m) {
    const h = m[1]!
    return {
      r: parseInt(h[0]! + h[0]!, 16),
      g: parseInt(h[1]! + h[1]!, 16),
      b: parseInt(h[2]! + h[2]!, 16),
    }
  }
  m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(s)
  if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) }
  return null
}

/**
 * 纯函数（单测口径）：采样像素中是否存在「真实内容」。
 * 有 paper 基准色：存在任一「不透明且非 paper 色」像素即有内容；
 * paper 未知：存在 ≥2 种不透明颜色即有内容（纯空白 = 单色）。
 */
export function hasContentPixels(data: Uint8ClampedArray | number[], paper: Rgb | null): boolean {
  if (paper) {
    for (let i = 0; i < data.length; i += 4) {
      if ((data[i + 3] as number) === 0) continue
      const r = data[i] as number
      const g = data[i + 1] as number
      const b = data[i + 2] as number
      if (r !== paper.r || g !== paper.g || b !== paper.b) return true
    }
    return false
  }
  let seen: number | null = null
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] as number) === 0) continue
    const key = (((data[i] as number) << 16) | ((data[i + 1] as number) << 8) | (data[i + 2] as number)) >>> 0
    if (seen === null) seen = key
    else if (key !== seen) return true
  }
  return false
}

/**
 * 降采样读像素探针：把画布缩到 PROBE_GRID² 后扫描内容像素。
 * 返回 true/false = 判定结果；null = 环境不支持读像素（jsdom / 异常），不可据此报错。
 */
export function sampleCanvasContent(canvas: HTMLCanvasElement, paper: Rgb | null): boolean | null {
  const probe = document.createElement('canvas')
  probe.width = PROBE_GRID
  probe.height = PROBE_GRID
  const ctx = probe.getContext('2d')
  if (!ctx) return null
  try {
    ctx.drawImage(canvas, 0, 0, PROBE_GRID, PROBE_GRID)
    return hasContentPixels(ctx.getImageData(0, 0, PROBE_GRID, PROBE_GRID).data, paper)
  } catch {
    return null
  }
}

/** 表格画布就绪探针：画布不存在/未定型返回 null（调用方按「未就绪」继续等） */
export function hasRenderedContent(canvas: HTMLCanvasElement | null, paper: Rgb | null): boolean | null {
  if (!canvas || canvas.width <= 0 || canvas.height <= 0) return null
  return sampleCanvasContent(canvas, paper)
}

function getTableCanvas(table: ListTable): HTMLCanvasElement | null {
  const el = table.getElement?.() as HTMLElement | undefined
  return (el?.querySelector?.('canvas') as HTMLCanvasElement | null) ?? null
}

/**
 * P1 信号等待（首保险）：等 vtable 的 after_render 事件 —— 1.26.8 在 stage 每次渲染
 * 完成后经 afterRender 钩子派发（scenegraph.js），首个事件即「首帧渲染完成」。
 * 必须在构造的同一任务内挂监听（首帧渲染 rAF 异步派发，先挂必不漏）；
 * 实例无 on 能力（单测 stub / jsdom）直接放行，交由内容探针 + 空图守卫兜底。
 */
export function waitFirstRenderSignal(table: ListTable, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof table.on !== 'function') {
      resolve()
      return
    }
    let settled = false
    const id = table.on('after_render', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve()
    })
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        table.off(id)
      } catch {
        /* ignore */
      }
      reject(new RenderNotReadyError())
    }, timeoutMs)
  })
}

/**
 * P1 内容探针轮询（次保险）：after_render 之后仍确认画布上出现了非 paper 的真实
 * 内容像素才放行（防「空舞台渲染也派发事件」的极端时序）。
 * 前提：waitCanvasStable 已保证画布存在且尺寸定型，画布缺失不可达；
 * 读像素不受支持（null）放行，交由空图守卫终检，不误伤极端环境。
 */
async function waitCanvasContent(table: ListTable, paper: Rgb | null, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const has = hasRenderedContent(getTableCanvas(table), paper)
    if (has === true) return
    if (has === null) return
    if (Date.now() >= deadline) throw new RenderNotReadyError()
    await waitFrames(1)
  }
}

async function waitCanvasStable(table: ListTable): Promise<{ w: number; h: number }> {
  let last = ''
  for (let i = 0; i < 120; i++) {
    const el = table.getElement?.() as HTMLElement | undefined
    const canvas = el?.querySelector?.('canvas') as HTMLCanvasElement | null
    const w = canvas?.width ?? 0
    const h = canvas?.height ?? 0
    const key = `${w}x${h}`
    if (w > 0 && h > 0 && key === last) return { w, h }
    last = key
    await waitFrames(1)
  }
  throw new Error('画布尺寸未就绪')
}

export async function exportPng(
  inst: TemplateInstance,
  opts: PngExportOptions = {},
): Promise<Result<Blob>> {
  const scale = opts.scale ?? 2
  const transparent = opts.transparent ?? false
  const maxPixels = opts.maxPixels ?? PNG_MAX_PIXELS_DEFAULT

  // 只放开 1/2/3 倍（FR-24）；非法倍率直接拒绝，不进渲染
  if (scale !== 1 && scale !== 2 && scale !== 3) {
    return fail('EXPORT_PNG_FAIL', `不支持的倍率 ${String(scale)}，仅支持 1×/2×/3×`)
  }

  const measured = measureContentSize(inst)
  const outW = (measured.width + PNG_PAD * 2) * scale
  const outH = (measured.height + PNG_PAD * 2) * scale
  if (outW * outH > maxPixels) {
    return fail('EXPORT_PNG_TOO_LARGE', `输出 ${Math.round(outW)}×${Math.round(outH)}=${Math.round(outW * outH)} 像素超过上限 ${maxPixels}，请改用更低倍率重试`, {
      width: outW,
      height: outH,
      maxPixels,
    })
  }

  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready
  }

  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-99999px;top:0;width:1px;height:1px;overflow:hidden;'
  document.body.appendChild(host)

  let table: ListTable | null = null
  try {
    const { palette } = resolveTheme(inst.themeId, inst.themeTokens)
    // R-3 导出同源：预加载图片资源注入 RenderContext.images，customLayout 闭包经
    // drawImageCell（自持离屏裁剪 + vrender 同步绘制，coverCrop 同源）
    // P1（缺陷 2）降级口径：资源缺失不得静默——导出前显式失败，
    // 壳层转人话 toast（errorCopy：EXPORT_PNG_IMAGE_MISSING），绝不画空图了事
    const urls = collectImageUrls(inst)
    const images = await preloadImages(urls)
    const missing = urls.filter((u) => !images.has(u))
    if (missing.length > 0) {
      return fail('EXPORT_PNG_IMAGE_MISSING', '图片资源未能加载，请重新上传后再导出', {
        missing: missing.length,
      })
    }
    const option = toOption(inst, {
      mode: 'export',
      transparentUnderlay: transparent,
      images: images.size > 0 ? images : undefined,
    }) as Record<string, unknown>
    option.canvasWidth = 'auto'
    option.canvasHeight = 'auto'
    option.pixelRatio = 1
    option.animationAppear = false

    table = new ListTable(host, option as ConstructorParameters<typeof ListTable>[1])
    // P1：构造同一任务内先挂 after_render 监听（首帧渲染 rAF 派发，先挂必不漏），
    // 再 setPixelRatio（内部含 resize/重渲染，信号只认其后的渲染完成）
    const firstRender = waitFirstRenderSignal(table, RENDER_READY_TIMEOUT_MS)
    // waitCanvasStable 可能先抛（画布尺寸 120 帧未定型），提前挂空 catch
    // 避免 firstRender 的超时拒绝沦为 unhandledrejection
    firstRender.catch(() => {})
    if (typeof table.setPixelRatio === 'function') {
      table.setPixelRatio(scale)
    }
    await waitCanvasStable(table)
    // P1：信号先行（正常路径零可感知延迟），rAF 兜底保留，内容探针确认真实内容
    await firstRender
    await waitCanvasContent(table, parseColorRgb(palette.paper), RENDER_READY_TIMEOUT_MS)
    await waitFrames(1)

    const dataUrl = table.exportImg()
    if (!dataUrl || typeof dataUrl !== 'string') {
      return fail('EXPORT_PNG_FAIL', 'exportImg 未返回图片')
    }

    // Composite with 16px padding
    const img = await loadImage(dataUrl)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(outW)
    canvas.height = Math.round(outH)
    const ctx = canvas.getContext('2d')
    if (!ctx) return fail('EXPORT_PNG_FAIL', '无法创建画布')

    if (transparent) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    } else {
      ctx.fillStyle = palette.paper
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(img, PNG_PAD * scale, PNG_PAD * scale, img.width, img.height)

    // P1 空图守卫（终检兜底）：产物降采样后除纸面/透明外无任何内容像素 →
    // 显式报错（EXPORT_PNG_EMPTY + errorCopy 白话，GC-25），绝不静默交付全空白图。
    // 读像素不受支持（jsdom 等极端环境）时放弃守卫，不误伤正常导出。
    const paperRgb = parseColorRgb(palette.paper)
    if (paperRgb && sampleCanvasContent(canvas, paperRgb) === false) {
      return fail('EXPORT_PNG_EMPTY', '表格渲染尚未完成，请稍后重试')
    }

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return fail('EXPORT_PNG_FAIL', 'PNG 编码失败')
    return ok(blob)
  } catch (e) {
    // P1：渲染就绪等待超时 → 走现有导出失败路径（不抓空图、不静默成功）
    if (e instanceof RenderNotReadyError) {
      return fail('EXPORT_PNG_FAIL', '表格渲染尚未完成，导出已取消，请稍后重试')
    }
    return fail('EXPORT_PNG_FAIL', e instanceof Error ? e.message : '导出 PNG 失败')
  } finally {
    await waitFrames(1)
    try {
      table?.release?.()
    } catch {
      /* ignore */
    }
    host.remove()
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = src
  })
}

/**
 * R-3 导出同源：从槽值收集图片 data URL（只收白名单内值，GC-22 单点透传）。
 */
export function collectImageUrls(inst: TemplateInstance): string[] {
  const urls = new Set<string>()
  for (const v of Object.values(inst.slots)) {
    if (v && typeof v === 'object' && 'image' in v && isImageDataUrl(v.image)) urls.add(v.image)
  }
  return [...urls]
}

/**
 * R-3 导出同源：离屏预加载全部图片资源，注入 RenderContext.images。
 * 单张加载失败只跳过该图（不中断整体预加载）；缺失交由 exportPng 显式报错
 * （EXPORT_PNG_IMAGE_MISSING，P1 修复：不再静默画空格）。
 */
export async function preloadImages(urls: string[]): Promise<Map<string, HTMLImageElement>> {
  const results = await Promise.allSettled(urls.map((u) => loadImage(u)))
  const map = new Map<string, HTMLImageElement>()
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') map.set(urls[i]!, r.value)
  })
  return map
}
