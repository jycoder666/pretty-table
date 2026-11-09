import type { TemplateInstance } from '../types'
import { COMPARE_ALPHA_V1 } from './compare-alpha-v1'
import { DETAIL_ALPHA_V1 } from './detail-alpha-v1'
import { PRICING_V1 } from './pricing-v1'
import { MATRIX_V1 } from './matrix-v1'
import { STAT_V1 } from './stat-v1'
import { BLANK_V1 } from './blank-v1'
// 保险模板套件 8 张（增量设计-保险模板套件-2026-11-06 TP09；全量静态落地 = A5 首选，
// 与既有 6 张预设同一条静态链，全部进入口 chunk）
import { AGE_CARE_GUIDE } from './age-care-guide'
import { MED_INS_LIST } from './med-ins-list'
import { DUTY_COMPARE } from './duty-compare'
import { PRODUCT_CATALOG } from './product-catalog'
import { CARE_TIER_COMPARE } from './care-tier-compare'
import { CLAIM_STANDARDS } from './claim-standards'
import { CRITICAL_LIST_50 } from './critical-list-50'
import { PLAN_VS } from './plan-vs'
import { cloneInstance } from '../schema/validate'

/** blank（新建空白表）居首：模板库首屏「新建空白表」卡（FR-C6 / Q-10） */
const PRESETS: TemplateInstance[] = [
  BLANK_V1,
  COMPARE_ALPHA_V1,
  DETAIL_ALPHA_V1,
  PRICING_V1,
  MATRIX_V1,
  STAT_V1,
  // 保险模板套件 8 张按 need 序追加在 STAT_V1 后（TP09 验收①）
  AGE_CARE_GUIDE,
  MED_INS_LIST,
  DUTY_COMPARE,
  PRODUCT_CATALOG,
  CARE_TIER_COMPARE,
  CLAIM_STANDARDS,
  CRITICAL_LIST_50,
  PLAN_VS,
]

export function listPresetTemplates(): TemplateInstance[] {
  return PRESETS.map((t) => cloneInstance(t))
}

export function getPresetTemplate(templateId: string): TemplateInstance | null {
  const hit = PRESETS.find((t) => t.templateId === templateId)
  return hit ? cloneInstance(hit) : null
}

export {
  BLANK_V1,
  COMPARE_ALPHA_V1,
  DETAIL_ALPHA_V1,
  PRICING_V1,
  MATRIX_V1,
  STAT_V1,
  AGE_CARE_GUIDE,
  MED_INS_LIST,
  DUTY_COMPARE,
  PRODUCT_CATALOG,
  CARE_TIER_COMPARE,
  CLAIM_STANDARDS,
  CRITICAL_LIST_50,
  PLAN_VS,
}
export { createBlankInstance, type BlankOptions } from './blankFactory'
