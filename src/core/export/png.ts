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
    // R-3 导出同源：预加载图片资源注入 RenderContext.images，customRender 闭包经 drawImageCell 绘制（coverCrop 同源）
    const images = await preloadImages(collectImageUrls(inst))
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
    if (typeof table.setPixelRatio === 'function') {
      table.setPixelRatio(scale)
    }
    await waitCanvasStable(table)
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

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return fail('EXPORT_PNG_FAIL', 'PNG 编码失败')
    return ok(blob)
  } catch (e) {
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
 * 单张加载失败只跳过该图（对应格回退默认绘制，画空格不炸），不中断整体导出。
 */
export async function preloadImages(urls: string[]): Promise<Map<string, HTMLImageElement>> {
  const results = await Promise.allSettled(urls.map((u) => loadImage(u)))
  const map = new Map<string, HTMLImageElement>()
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') map.set(urls[i]!, r.value)
  })
  return map
}
