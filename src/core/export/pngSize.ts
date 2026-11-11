import type { TemplateInstance } from '../types'
import { measureContentSize } from '../adapter/toOption'
import { effectiveKpiCards, kpiHeroHeight } from '../kpi/kpiCards'
import {
  posterHeaderHeight,
  posterFooterHeight,
  posterPadding,
} from '../theme/posterStyle'

/**
 * PNG 尺寸估算（T34 拆分）：只算不画、不依赖 VTable。
 * exportPng 留在渲染动态导入图里（T34），门槛常量与本估算被壳层静态消费
 * （导出抽屉的实时预估、DebugPanel），必须与 VTable 解耦。
 */

/** 输出像素上限（T19 门槛实测回写值：约 4096×4096，Safari 画布面积保守值） */
export const PNG_MAX_PIXELS_DEFAULT = 16_777_216

/** 四周留白（CSS px），输出尺寸 =（内容 + 2×PAD）× 倍率 */
export const PNG_PAD = 16

/** 只算不画：按倍率预估输出像素尺寸（留白口径 =（内容 + 32）× 倍率；Schema 1.2 扩展 含 KPI hero 区高；
 * P4 起倍率为连续区间 0.5–4（不再限 1/2/3 三档）；
 * Schema 1.3 扩展：poster 海报层以海报留白替代 PNG_PAD，并加标题区/注脚区高度 */
export function measurePng(inst: TemplateInstance, scale: number = 2) {
  const m = measureContentSize(inst)
  const kpi = kpiHeroHeight(effectiveKpiCards(inst), inst.kpiStyle)
  const poster = inst.poster
  const header = posterHeaderHeight(poster)
  const footer = posterFooterHeight(poster)
  const pad = poster ? posterPadding(poster) : PNG_PAD
  return {
    contentWidth: m.width,
    contentHeight: m.height + kpi + header + footer,
    outWidth: (m.width + pad * 2) * scale,
    outHeight: (m.height + kpi + header + footer + pad * 2) * scale,
  }
}
