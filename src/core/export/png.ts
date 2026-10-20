import { ListTable } from '@visactor/vtable'
import type { PngExportOptions, TemplateInstance } from '../types'
import { fail, ok, type Result } from '../errors'
import { toOption, measureContentSize } from '../adapter/toOption'
import { resolveTheme } from '../theme/palettes'

const DEFAULT_MAX_PIXELS = 16_777_216
const PAD = 16

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

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',')
  const mime = /data:(.*?);/.exec(meta ?? '')?.[1] ?? 'image/png'
  const bin = atob(b64 ?? '')
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

export async function exportPng(
  inst: TemplateInstance,
  opts: PngExportOptions = {},
): Promise<Result<Blob>> {
  const scale = opts.scale ?? 2
  const transparent = opts.transparent ?? false
  const maxPixels = opts.maxPixels ?? DEFAULT_MAX_PIXELS

  const measured = measureContentSize(inst)
  const outW = (measured.width + PAD * 2) * scale
  const outH = (measured.height + PAD * 2) * scale
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
    const option = toOption(inst, { mode: 'export', transparentUnderlay: transparent }) as Record<
      string,
      unknown
    >
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
    ctx.drawImage(img, PAD * scale, PAD * scale, img.width, img.height)

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

export function measurePng(inst: TemplateInstance, scale: 1 | 2 | 3 = 2) {
  const m = measureContentSize(inst)
  return {
    contentWidth: m.width,
    contentHeight: m.height,
    outWidth: (m.width + PAD * 2) * scale,
    outHeight: (m.height + PAD * 2) * scale,
  }
}
