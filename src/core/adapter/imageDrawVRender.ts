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
 */
import { createGroup, createImage } from '@visactor/vtable/es/vrender'
import { registerCellGroupFactory } from './toOption'

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
