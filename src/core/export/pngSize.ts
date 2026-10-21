import type { TemplateInstance } from '../types'
import { measureContentSize } from '../adapter/toOption'

/**
 * PNG 尺寸估算（T34 拆分）：只算不画、不依赖 VTable。
 * exportPng 留在渲染动态导入图里（T34），门槛常量与本估算被壳层静态消费
 * （导出抽屉的实时预估、DebugPanel），必须与 VTable 解耦。
 */

/** 输出像素上限（T19 门槛实测回写值：约 4096×4096，Safari 画布面积保守值） */
export const PNG_MAX_PIXELS_DEFAULT = 16_777_216

/** 四周留白（CSS px），输出尺寸 =（内容 + 2×PAD）× 倍率 */
export const PNG_PAD = 16

/** 只算不画：按倍率预估输出像素尺寸（留白口径 =（内容 + 32）× 倍率） */
export function measurePng(inst: TemplateInstance, scale: 1 | 2 | 3 = 2) {
  const m = measureContentSize(inst)
  return {
    contentWidth: m.width,
    contentHeight: m.height,
    outWidth: (m.width + PNG_PAD * 2) * scale,
    outHeight: (m.height + PNG_PAD * 2) * scale,
  }
}
