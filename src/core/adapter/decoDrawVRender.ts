/**
 * Schema 1.3 · 格内装饰绘制通道的 vrender 装载点（与 imageDrawVRender 同层，vrender 依赖
 * 只准进 VTable chunk —— T34 纪律）。由 vtableLite.ts 侧效 import 注册（coreHost / png 共用）。
 *
 * 消费 toOption.decoSpecOf 组装的 DecoSpec（色值 / 字号 / 对齐已在核内解析为具体值），
 * 这里只做 vrender 图元拼装：createGroup / createRect / createText / createLine / createPolygon。
 * 圆点用「方形 + cornerRadius=r」实现（vrender 无独立 circle 工厂，视觉等价）；
 * 里程碑菱形用 createPolygon 四点；虚线用 createLine lineDash。
 */
import {
  createGroup,
  createImage,
  createLine,
  createPolygon,
  createRect,
  createText,
} from '@visactor/vtable/es/vrender'
import { registerCellGroupFactory, registerBarGroupFactory, registerDecoGroupFactory } from './toOption'
import type { DecoSpec } from './toOption'
import {
  DECO_CELLS_EMPTY,
  DECO_CELLS_INK,
  DECO_CELLS_TODAY,
  DECO_CARD_INK,
  DECO_CARD_MUTED,
  DECO_WIN_GOLD,
  DECO_INK,
  DECO_SUB_INK,
  DECO_STAR,
  DECO_STAR_EMPTY,
  DECO_DOT,
  DECO_TRACK,
  DECO_LINE,
  DECO_LEADER,
  DECO_PILL_INK,
  DECO_BANNER_INK,
  DECO_BANNER_BAR,
  DECO_MILESTONE,
} from '../theme/decoDefaults'

// 图片格 / 条形格通道（原 imageDrawVRender 职责，合并到同一装载点避免双 import 路径）
registerCellGroupFactory((image, width, height) => {
  const group = createGroup({
    x: 0,
    y: 0,
    width,
    height,
    fill: false,
    stroke: false,
    pickable: false,
  })
  group.appendChild(createImage({ x: 0, y: 0, width, height, image, pickable: false }))
  return group
})

registerBarGroupFactory((bar, text, textStyle, width, height, padH) => {
  const group = createGroup({
    x: 0,
    y: 0,
    width,
    height,
    fill: false,
    stroke: false,
    pickable: false,
  })
  const contentW = Math.max(0, width - padH * 2)
  const barH = height * 0.6
  const barW = contentW * bar.ratio
  if (barW > 0) {
    group.appendChild(
      createRect({
        x: padH,
        y: (height - barH) / 2,
        width: barW,
        height: barH,
        fill: bar.color,
        cornerRadius: Math.min(4, barH / 2),
        pickable: false,
      }),
    )
  }
  const anchorX =
    textStyle.textAlign === 'left' ? padH : textStyle.textAlign === 'center' ? width / 2 : width - padH
  group.appendChild(
    createText({
      x: anchorX,
      y: height / 2,
      text,
      fontSize: textStyle.fontSize,
      fill: textStyle.color,
      fontFamily: textStyle.fontFamily,
      fontWeight: textStyle.fontWeight,
      textAlign: textStyle.textAlign,
      textBaseline: 'middle',
      pickable: false,
    }),
  )
  return group
})

/** 离屏文本测量（leader 点线起点需要；jsdom 等无 2d 上下文时按字数估算兜底） */
function measureTextWidth(text: string, fontSize: number, fontFamily: string): number {
  try {
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.font = `${fontSize}px ${fontFamily}`
        return ctx.measureText(text).width
      }
    }
  } catch {
    /* fallthrough */
  }
  return text.length * fontSize * 0.9
}

/** 水平锚点（align + padH） */
function anchorXOf(align: DecoSpec['align'], width: number, padH: number): number {
  return align === 'center' ? width / 2 : align === 'right' ? width - padH : padH
}

registerDecoGroupFactory((spec, width, height) => {
  const group = createGroup({
    x: 0,
    y: 0,
    width,
    height,
    fill: false,
    stroke: false,
    pickable: false,
  })
  const padH = spec.padH ?? 10
  const cy = height / 2
  const fs = spec.fontSize ?? 13

  if (spec.kind === 'rich') {
    // 主行（+ 同行单位小字）+ 副行小字（整体垂直居中：主行上移、副行下移各半行）
    const subFs = spec.subFontSize ?? fs * 0.78
    const mainH = fs * 1.2
    const subH = subFs * 1.25
    const top = cy - (mainH + 3 + subH) / 2
    const unitFs = fs * 0.62
    const unitW = spec.unit ? measureTextWidth(spec.unit, unitFs, spec.fontFamily ?? '') + 3 : 0
    const mainW = measureTextWidth(spec.main ?? '', fs, spec.fontFamily ?? '')
    const align = spec.align ?? 'left'
    // 单位锚定：右对齐 → 单位贴右缘、主行左移；左/居中 → 单位紧跟主行
    let mainX: number
    let unitX: number
    if (unitW > 0 && align === 'right') {
      mainX = width - padH - unitW
      unitX = width - padH
    } else if (align === 'right') {
      mainX = width - padH
      unitX = mainX
    } else if (align === 'center') {
      const totalW = mainW + unitW
      mainX = (width - totalW) / 2
      unitX = mainX + mainW + 3
    } else {
      mainX = padH
      unitX = padH + mainW + 3
    }
    group.appendChild(
      createText({
        x: mainX,
        y: top + mainH / 2,
        text: spec.main ?? '',
        fontSize: fs,
        fill: spec.color ?? DECO_INK,
        fontFamily: spec.fontFamily,
        fontWeight: spec.fontWeight,
        textAlign: align === 'center' && unitW > 0 ? 'left' : align,
        textBaseline: 'middle',
        pickable: false,
      }),
    )
    if (spec.unit) {
      group.appendChild(
        createText({
          x: unitX,
          y: top + mainH / 2 + fs * 0.08,
          text: spec.unit,
          fontSize: unitFs,
          fill: spec.subColor ?? DECO_SUB_INK,
          fontFamily: spec.fontFamily,
          textAlign: 'left',
          textBaseline: 'middle',
          pickable: false,
        }),
      )
    }
    if (spec.sub) {
      group.appendChild(
        createText({
          x: anchorXOf(align, width, padH),
          y: top + mainH + 3 + subH / 2,
          text: spec.sub,
          fontSize: subFs,
          fill: spec.subColor ?? DECO_SUB_INK,
          fontFamily: spec.fontFamily,
          textAlign: align,
          textBaseline: 'middle',
          pickable: false,
        }),
      )
    }
    return group
  }

  if (spec.kind === 'stars') {
    // 金★（前 n 个）+ 灰☆（其余）：两段文本按定宽步进拼接（全角星形步进 ≈ 字号）
    const n = Math.max(0, Math.min(5, spec.stars ?? 0))
    const step = fs * 1.08
    const totalW = 5 * step
    const startX =
      spec.align === 'center'
        ? (width - totalW) / 2
        : spec.align === 'right'
          ? width - padH - totalW
          : padH
    if (n > 0) {
      group.appendChild(
        createText({
          x: startX,
          y: cy,
          text: '★'.repeat(n),
          fontSize: fs,
          fill: spec.starColor ?? DECO_STAR,
          fontFamily: spec.fontFamily,
          textAlign: 'left',
          textBaseline: 'middle',
          pickable: false,
        }),
      )
    }
    if (n < 5) {
      group.appendChild(
        createText({
          x: startX + n * step,
          y: cy,
          text: '☆'.repeat(5 - n),
          fontSize: fs,
          fill: spec.starEmptyColor ?? DECO_STAR_EMPTY,
          fontFamily: spec.fontFamily,
          textAlign: 'left',
          textBaseline: 'middle',
          pickable: false,
        }),
      )
    }
    return group
  }

  if (spec.kind === 'dot') {
    // 状态圆点 + 文本（圆点 r=5，文本右移 dot 后 8px）
    const r = 5
    const ax = anchorXOf(spec.align, width, padH)
    const dotX = spec.align === 'right' ? ax - (measureTextWidth(spec.main ?? '', fs, spec.fontFamily ?? '') + 8 + r) : ax
    group.appendChild(
      createRect({
        x: dotX,
        y: cy - r,
        width: r * 2,
        height: r * 2,
        cornerRadius: r,
        fill: spec.dotColor ?? DECO_DOT,
        pickable: false,
      }),
    )
    group.appendChild(
      createText({
        x: dotX + r * 2 + 8,
        y: cy,
        text: spec.main ?? '',
        fontSize: fs,
        fill: spec.color ?? DECO_INK,
        fontFamily: spec.fontFamily,
        fontWeight: spec.fontWeight,
        textAlign: 'left',
        textBaseline: 'middle',
        pickable: false,
      }),
    )
    return group
  }

  if (spec.kind === 'gantt') {
    // 甘特条：轨道（内容区全宽）+ 色条（from-to）+ 可选里程碑菱形（终点）
    const from = spec.from ?? 0
    const to = spec.to ?? 0
    const trackH = Math.min(14, height * 0.32)
    const cw = Math.max(0, width - padH * 2)
    group.appendChild(
      createRect({
        x: padH,
        y: cy - trackH / 2,
        width: cw,
        height: trackH,
        cornerRadius: trackH / 2,
        fill: spec.trackColor ?? DECO_TRACK,
        pickable: false,
      }),
    )
    const barW = Math.max(2, (to - from) * cw)
    if (barW > 0) {
      group.appendChild(
        createRect({
          x: padH + from * cw,
          y: cy - trackH / 2,
          width: barW,
          height: trackH,
          cornerRadius: trackH / 2,
          fill: spec.barColor ?? DECO_BANNER_INK,
          pickable: false,
        }),
      )
    }
    if (spec.milestone === true) {
      const s = 6
      const mx = padH + to * cw
      group.appendChild(
        createPolygon({
          points: [
            { x: mx, y: cy - s },
            { x: mx + s, y: cy },
            { x: mx, y: cy + s },
            { x: mx - s, y: cy },
          ],
          fill: spec.milestoneColor ?? DECO_MILESTONE,
          pickable: false,
        }),
      )
    }
    return group
  }

  if (spec.kind === 'node') {
    // 时间轴：贯穿竖虚线（首行从圆点起 / 末行到圆点止）+ 圆点 + 右侧文本
    const r = 4
    const lineX = padH + r
    const top = spec.nodeFirst ? cy : 0
    const bottom = spec.nodeLast ? cy : height
    if (bottom > top) {
      group.appendChild(
        createLine({
          points: [
            { x: lineX, y: top },
            { x: lineX, y: bottom },
          ],
          stroke: spec.lineColor ?? DECO_LINE,
          lineWidth: 1,
          lineDash: [3, 3],
          pickable: false,
        }),
      )
    }
    group.appendChild(
      createRect({
        x: lineX - r,
        y: cy - r,
        width: r * 2,
        height: r * 2,
        cornerRadius: r,
        fill: spec.dotColor ?? DECO_DOT,
        pickable: false,
      }),
    )
    group.appendChild(
      createText({
        x: lineX + r + 9,
        y: cy,
        text: spec.main ?? '',
        fontSize: fs,
        fill: spec.color ?? DECO_INK,
        fontFamily: spec.fontFamily,
        fontWeight: spec.fontWeight,
        textAlign: 'left',
        textBaseline: 'middle',
        pickable: false,
      }),
    )
    return group
  }

  if (spec.kind === 'leader') {
    // 点线引导：文本 + 剩余空间 dotted 线（菜单菜名 → 价格）
    const ax = anchorXOf(spec.align, width, padH)
    const textW = measureTextWidth(spec.main ?? '', fs, spec.fontFamily ?? '')
    group.appendChild(
      createText({
        x: ax,
        y: cy,
        text: spec.main ?? '',
        fontSize: fs,
        fill: spec.color ?? DECO_INK,
        fontFamily: spec.fontFamily,
        fontWeight: spec.fontWeight,
        textAlign: spec.align ?? 'left',
        textBaseline: 'middle',
        pickable: false,
      }),
    )
    const lineStart =
      spec.align === 'right' ? padH : Math.min(width - padH - 8, ax + textW + 8)
    const lineEnd = spec.align === 'right' ? ax - textW - 8 : width - padH
    if (lineEnd > lineStart) {
      group.appendChild(
        createLine({
          points: [
            { x: lineStart, y: cy },
            { x: lineEnd, y: cy },
          ],
          stroke: spec.dotColor ?? DECO_LEADER,
          lineWidth: 1,
          lineDash: [2, 4],
          pickable: false,
        }),
      )
    }
    return group
  }

  if (spec.kind === 'headerCard') {
    // 平表头双行卡片：整格色块 + 居中主文本 + 副行小字（compare 表头「产品名 + 定位」）
    group.appendChild(
      createRect({
        x: 0,
        y: 0,
        width,
        height,
        fill: spec.bg ?? DECO_BANNER_INK,
        pickable: false,
      }),
    )
    const subFs = spec.subFontSize ?? fs * 0.78
    const hasSub = Boolean(spec.sub)
    const mainY = hasSub ? cy - subFs * 0.55 : cy
    group.appendChild(
      createText({
        x: anchorXOf(spec.align, width, padH),
        y: mainY,
        text: spec.main ?? '',
        fontSize: fs,
        fill: spec.color ?? DECO_PILL_INK,
        fontFamily: spec.fontFamily,
        fontWeight: spec.fontWeight ?? 700,
        textAlign: spec.align ?? 'center',
        textBaseline: 'middle',
        pickable: false,
      }),
    )
    if (hasSub) {
      group.appendChild(
        createText({
          x: anchorXOf(spec.align, width, padH),
          y: cy + fs * 0.62,
          text: spec.sub ?? '',
          fontSize: subFs,
          fill: spec.subColor ?? DECO_PILL_INK,
          fontFamily: spec.fontFamily,
          textAlign: spec.align ?? 'center',
          textBaseline: 'middle',
          pickable: false,
        }),
      )
    }
    return group
  }

  if (spec.kind === 'banner') {
    // 横幅行：柔色底 + 左强调竖条 + 主文本 + 右侧强调文本
    group.appendChild(
      createRect({
        x: 0,
        y: 0,
        width,
        height,
        fill: spec.bg ?? DECO_TRACK,
        pickable: false,
      }),
    )
    group.appendChild(
      createRect({
        x: 0,
        y: 6,
        width: 4,
        height: Math.max(0, height - 12),
        fill: spec.barLeftColor ?? DECO_BANNER_BAR,
        pickable: false,
      }),
    )
    const align = spec.align ?? 'left'
    const textX = align === 'center' ? width / 2 : padH + 12
    group.appendChild(
      createText({
        x: textX,
        y: cy,
        text: spec.main ?? '',
        fontSize: fs,
        fill: spec.color ?? DECO_BANNER_INK,
        fontFamily: spec.fontFamily,
        fontWeight: spec.fontWeight ?? 600,
        textAlign: align,
        textBaseline: 'middle',
        pickable: false,
      }),
    )
    if (spec.right) {
      group.appendChild(
        createText({
          x: width - padH,
          y: cy,
          text: spec.right,
          fontSize: fs,
          fill: spec.rightColor ?? DECO_DOT,
          fontFamily: spec.fontFamily,
          fontWeight: 700,
          textAlign: 'right',
          textBaseline: 'middle',
          pickable: false,
        }),
      )
    }
    return group
  }

  if (spec.kind === 'match') {
    // 对阵卡：格内上下两张小卡（队名 + 比分），胜方金竖条 + 白粗体（淘汰赛稿）
    const gap = 6
    const cardH = (height - gap) / 2
    const cardW = Math.max(0, width - padH * 2)
    const fsName = fs
    const win = spec.winColor ?? DECO_WIN_GOLD
    const border = spec.cardBorder ?? 'rgba(255,255,255,0.22)'
    const cardBg = spec.cardBg && spec.cardBg !== 'transparent' ? spec.cardBg : 'rgba(255,255,255,0.05)'
    const drawCard = (top: number, name: string, score: string, isWin: boolean) => {
      group.appendChild(
        createRect({
          x: padH,
          y: top,
          width: cardW,
          height: cardH,
          cornerRadius: 3,
          fill: cardBg,
          stroke: border,
          lineWidth: 1,
          pickable: false,
        }),
      )
      if (isWin) {
        group.appendChild(
          createRect({
            x: padH,
            y: top,
            width: 3,
            height: cardH,
            cornerRadius: 0,
            fill: win,
            pickable: false,
          }),
        )
      }
      group.appendChild(
        createText({
          x: padH + 14,
          y: top + cardH / 2,
          text: name,
          fontSize: fsName,
          fill: isWin ? DECO_CARD_INK : spec.subColor ?? DECO_CARD_MUTED,
          fontFamily: spec.fontFamily,
          fontWeight: isWin ? 700 : 400,
          textAlign: 'left',
          textBaseline: 'middle',
          pickable: false,
        }),
      )
      group.appendChild(
        createText({
          x: padH + cardW - 14,
          y: top + cardH / 2,
          text: score,
          fontSize: fsName,
          fill: isWin ? win : spec.subColor ?? DECO_CARD_MUTED,
          fontFamily: spec.fontFamily,
          fontWeight: isWin ? 700 : 400,
          textAlign: 'right',
          textBaseline: 'middle',
          pickable: false,
        }),
      )
    }
    drawCard(0, spec.sideA ?? '', spec.scoreA ?? '', spec.winA === true)
    drawCard(cardH + gap, spec.sideB ?? '', spec.scoreB ?? '', spec.winB === true)
    return group
  }

  if (spec.kind === 'champion') {
    // 冠军卡：金边半透明金底，居中三行（小标 / 队名 / 备注）
    const border = spec.cardBorder ?? DECO_WIN_GOLD
    const cardBg = spec.cardBg ?? 'rgba(217,180,90,0.12)'
    group.appendChild(
      createRect({
        x: padH,
        y: 4,
        width: Math.max(0, width - padH * 2),
        height: Math.max(0, height - 8),
        cornerRadius: 3,
        fill: cardBg,
        stroke: border,
        lineWidth: 1.5,
        pickable: false,
      }),
    )
    const cy = height / 2
    if (spec.sub) {
      group.appendChild(
        createText({
          x: width / 2,
          y: cy - fs * 1.1,
          text: spec.sub,
          fontSize: fs * 0.72,
          fill: spec.cardTitleColor ?? DECO_WIN_GOLD,
          fontFamily: spec.fontFamily,
          textAlign: 'center',
          textBaseline: 'middle',
          pickable: false,
        }),
      )
    }
    group.appendChild(
      createText({
        x: width / 2,
        y: cy + (spec.sub ? 2 : -fs * 0.2),
        text: spec.main ?? '',
        fontSize: fs * 1.15,
        fill: spec.color ?? DECO_CARD_INK,
        fontFamily: spec.fontFamily,
        fontWeight: 700,
        textAlign: 'center',
        textBaseline: 'middle',
        pickable: false,
      }),
    )
    if (spec.right) {
      group.appendChild(
        createText({
          x: width / 2,
          y: cy + fs * 1.25,
          text: spec.right,
          fontSize: fs * 0.72,
          fill: spec.subColor ?? DECO_CARD_MUTED,
          fontFamily: spec.fontFamily,
          textAlign: 'center',
          textBaseline: 'middle',
          pickable: false,
        }),
      )
    }
    return group
  }

  if (spec.kind === 'cells') {
    // 打卡矩阵：格内一行小方格（'1' 实心完成 / '0' 空心未完成 / today 红框）
    const pattern = spec.main ?? ''
    const n = pattern.length
    if (n === 0) return group
    const trackW = Math.max(0, width - padH * 2)
    const cellW = Math.min(26, trackW / n / 1.22)
    const cellH = Math.min(height * 0.6, cellW * 1.0)
    const gapW = (trackW - cellW * n) / Math.max(1, n - 1)
    const cy = height / 2
    for (let i = 0; i < n; i++) {
      const x0 = padH + i * (cellW + gapW)
      const filled = pattern[i] === '1'
      const isToday = spec.today === i
      if (filled) {
        group.appendChild(
          createRect({
            x: x0,
            y: cy - cellH / 2,
            width: cellW,
            height: cellH,
            cornerRadius: Math.min(4, cellW / 4),
            fill: spec.color ?? DECO_CELLS_INK,
            pickable: false,
          }),
        )
      } else {
        group.appendChild(
          createRect({
            x: x0,
            y: cy - cellH / 2,
            width: cellW,
            height: cellH,
            cornerRadius: Math.min(4, cellW / 4),
            fill: false,
            stroke: isToday ? spec.dotColor ?? DECO_CELLS_TODAY : spec.cellEmptyBorder ?? DECO_CELLS_EMPTY,
            lineWidth: isToday ? 2 : 1,
            pickable: false,
          }),
        )
      }
      if (isToday && filled) {
        // 今天且已完成：红框叠在实心格外
        group.appendChild(
          createRect({
            x: x0 - 1.5,
            y: cy - cellH / 2 - 1.5,
            width: cellW + 3,
            height: cellH + 3,
            cornerRadius: Math.min(5, cellW / 3),
            fill: false,
            stroke: spec.dotColor ?? DECO_CELLS_TODAY,
            lineWidth: 2,
            pickable: false,
          }),
        )
      }
    }
    return group
  }

  // pill：药丸表头（圆角色块 + 居中主文本 + 可选副文本；上下内缩可调 Schema 1.4）
  const insetV = Math.min(height / 2 - 2, Math.max(0, spec.insetV ?? 6))
  const pillH = height - insetV * 2
  const pillY = insetV
  const hasSub = Boolean(spec.sub)
  group.appendChild(
    createRect({
      x: padH + 2,
      y: pillY,
      width: Math.max(0, width - padH * 2 - 4),
      height: Math.max(0, pillH),
      cornerRadius: pillH / 2,
      fill: spec.bg ?? DECO_BANNER_INK,
      pickable: false,
    }),
  )
  if (hasSub) {
    const subFs = spec.subFontSize ?? fs * 0.78
    group.appendChild(
      createText({
        x: width / 2,
        y: pillY + pillH * 0.36,
        text: spec.main ?? '',
        fontSize: fs,
        fill: spec.color ?? DECO_PILL_INK,
        fontFamily: spec.fontFamily,
        fontWeight: spec.fontWeight ?? 700,
        textAlign: 'center',
        textBaseline: 'middle',
        pickable: false,
      }),
    )
    group.appendChild(
      createText({
        x: width / 2,
        y: pillY + pillH * 0.72,
        text: spec.sub ?? '',
        fontSize: subFs,
        fill: spec.subColor ?? DECO_PILL_INK,
        fontFamily: spec.fontFamily,
        textAlign: 'center',
        textBaseline: 'middle',
        pickable: false,
      }),
    )
  } else {
    group.appendChild(
      createText({
        x: width / 2,
        y: pillY + pillH / 2,
        text: spec.main ?? '',
        fontSize: fs,
        fill: spec.color ?? DECO_PILL_INK,
        fontFamily: spec.fontFamily,
        fontWeight: spec.fontWeight ?? 700,
        textAlign: 'center',
        textBaseline: 'middle',
        pickable: false,
      }),
    )
  }
  return group
})
