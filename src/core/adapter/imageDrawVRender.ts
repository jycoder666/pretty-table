/**
 * P1 修复 · 图片格绘制通道的 vrender 装载点（T34：vrender 依赖只准进 VTable chunk）。
 *
 * 与 vtable 内部同源：vtable 的 dealWithCustom 用 `instanceof VGroup`（经
 * `@visactor/vtable/es/vrender` 转出 vrender-core）判定 rootContainer，这里从同一
 * 模块取 createGroup / createImage，保证实例同类、判定通过。image 属性传
 * HTMLCanvasElement → vrender loadImage 的 isObject 分支同步置 success，
 * 首帧即画出（无异步图片加载，导出无漏图竞态）。
 *
 * 由 vtableLite.ts 侧效 import 注册（coreHost / png 共用该入口）。
 * Schema 1.2 扩展：同一装载点顺带注册条形格工厂（createRect / createText 同模块取用）。
 */
import { createGroup, createImage, createRect, createText } from '@visactor/vtable/es/vrender'
import { registerCellGroupFactory, registerBarGroupFactory } from './toOption'

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
  group.appendChild(
    createImage({ x: 0, y: 0, width, height, image, pickable: false }),
  )
  return group
})

// ── Schema 1.2 扩展：单元格条形格式（水平彩色条 + 数值文本覆盖）──
// 几何口径与 HTML 导出（model.ts barTrackStyle）同源：条高 60% 行高、垂直居中、
// 圆角 4px、宽 = 内容区宽 × ratio；文本按槽位对齐（num 默认右对齐）覆盖在条上层。
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
