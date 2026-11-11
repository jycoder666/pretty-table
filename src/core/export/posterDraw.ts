import type { PosterSpec } from '../types'
import type { Palette } from '../theme/palettes'
import {
  posterColors,
  posterHeaderHeight,
  posterFooterHeight,
  posterTitleFont,
  POSTER_DOTS_SIZE,
  POSTER_DOTS_R,
  POSTER_RULED_GAP,
  POSTER_RULED_W,
  POSTER_KICKER_FONT,
  POSTER_TITLE_FONT,
  POSTER_SUBTITLE_FONT,
  POSTER_META_FONT,
  POSTER_FOOTER_FONT,
} from '../theme/posterStyle'
import { FONT_STACK } from '../theme/font'

/**
 * Schema 1.3 · PNG 合成期的海报层 canvas 手绘（与 posterStyle.ts 内联样式同一几何常量）。
 * 预览 / HTML 走 CSS（点纹 radial-gradient / 横线 repeating-linear-gradient），
 * canvas 无法用 CSS —— 本模块按同值手绘，三方视觉对齐。
 */

/** 纸面底色 + 纹理（覆盖整个输出画布；solid 纯色零纹理） */
export function drawPosterBackground(
  ctx: CanvasRenderingContext2D,
  poster: PosterSpec | undefined,
  palette: Palette,
  w: number,
  h: number,
): void {
  const c = posterColors(poster, palette)
  ctx.fillStyle = c.bg
  ctx.fillRect(0, 0, w, h)
  const mode = poster?.bg ?? 'solid'
  if (mode === 'dots') {
    ctx.fillStyle = c.texture
    const size = POSTER_DOTS_SIZE
    const r = POSTER_DOTS_R
    for (let y = r; y < h; y += size) {
      for (let x = r; x < w; x += size) {
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  } else if (mode === 'ruled') {
    ctx.strokeStyle = c.texture
    ctx.lineWidth = POSTER_RULED_W
    const gap = POSTER_RULED_GAP
    for (let y = gap; y < h; y += gap) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }
  } else if (mode === 'gradient') {
    const grad = ctx.createLinearGradient(0, 0, w * 0.6, h)
    grad.addColorStop(0, c.bg)
    grad.addColorStop(1, c.texture)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
  }
}

/** 眉标字距（canvas letterSpacing 支持面窄，不支持时逐字手绘间隔） */
function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  track: number,
): void {
  let cx = x
  for (const ch of text) {
    ctx.fillText(ch, cx, y)
    cx += ctx.measureText(ch).width + track
  }
}

/**
 * 标题区（眉标 / 标题 / 副标题左块 + meta 右块）。
 * 坐标语义：x/y = 内容区左上角（含海报留白），返回占用高度（与 posterHeaderHeight 同值 × scale）。
 */
export function drawPosterHeader(
  ctx: CanvasRenderingContext2D,
  poster: PosterSpec | undefined,
  palette: Palette,
  x: number,
  y: number,
  contentWidth: number,
  scale: number,
): number {
  const total = posterHeaderHeight(poster) * scale
  if (total <= 0) return 0
  const c = posterColors(poster, palette)
  const f = posterTitleFont(poster)
  let cy = y
  ctx.textBaseline = 'top'
  if (poster?.kicker) {
    ctx.fillStyle = c.accent
    ctx.font = `${POSTER_KICKER_FONT * scale}px ${FONT_STACK}`
    drawTracked(ctx, poster.kicker, x, cy, 3.2 * scale)
    cy += (POSTER_KICKER_FONT * 1.5 + 6) * scale
  }
  if (poster?.title) {
    ctx.fillStyle = c.title
    ctx.font = `700 ${POSTER_TITLE_FONT * scale}px ${f}`
    ctx.fillText(poster.title, x, cy)
    cy += (POSTER_TITLE_FONT * 1.3 + 8) * scale
  }
  if (poster?.subtitle) {
    ctx.fillStyle = c.sub
    ctx.font = `${POSTER_SUBTITLE_FONT * scale}px ${FONT_STACK}`
    ctx.fillText(poster.subtitle, x, cy)
  }
  if (poster?.metaLines?.length) {
    ctx.fillStyle = c.meta
    ctx.font = `${POSTER_META_FONT * scale}px ${FONT_STACK}`
    ctx.textAlign = 'right'
    poster.metaLines.forEach((line, i) => {
      ctx.fillText(line, x + contentWidth, y + i * POSTER_META_FONT * 1.7 * scale)
    })
    ctx.textAlign = 'left'
  }
  return total
}

/** 注脚区（注脚行左 + 页码徽标右下）。返回占用高度（与 posterFooterHeight 同值 × scale）。 */
export function drawPosterFooter(
  ctx: CanvasRenderingContext2D,
  poster: PosterSpec | undefined,
  palette: Palette,
  x: number,
  y: number,
  contentWidth: number,
  scale: number,
): number {
  const total = posterFooterHeight(poster) * scale
  if (total <= 0) return 0
  const c = posterColors(poster, palette)
  ctx.textBaseline = 'top'
  if (poster?.footerLines?.length) {
    ctx.fillStyle = c.footer
    ctx.font = `${POSTER_FOOTER_FONT * scale}px ${FONT_STACK}`
    poster.footerLines.forEach((line, i) => {
      ctx.fillText(line, x, y + i * POSTER_FOOTER_FONT * 1.7 * scale)
    })
  }
  if (poster?.pageBadge) {
    ctx.fillStyle = c.accent
    ctx.font = `${POSTER_FOOTER_FONT * scale}px ${FONT_STACK}`
    ctx.textAlign = 'right'
    const lines = Math.max(poster.footerLines?.length ?? 0, 1)
    ctx.fillText(
      poster.pageBadge,
      x + contentWidth,
      y + (lines - 1) * POSTER_FOOTER_FONT * 1.7 * scale,
    )
    ctx.textAlign = 'left'
  }
  return total
}
