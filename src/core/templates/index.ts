import type { TemplateInstance } from '../types'
import { COMPARE_ALPHA_V1 } from './compare-alpha-v1'
import { DETAIL_ALPHA_V1 } from './detail-alpha-v1'
import { PRICING_V1 } from './pricing-v1'
import { MATRIX_V1 } from './matrix-v1'
import { BLANK_V1 } from './blank-v1'
import { cloneInstance } from '../schema/validate'

/** blank（新建空白表）居首：模板库首屏「新建空白表」卡（FR-C6 / Q-10） */
const PRESETS: TemplateInstance[] = [BLANK_V1, COMPARE_ALPHA_V1, DETAIL_ALPHA_V1, PRICING_V1, MATRIX_V1]

export function listPresetTemplates(): TemplateInstance[] {
  return PRESETS.map((t) => cloneInstance(t))
}

export function getPresetTemplate(templateId: string): TemplateInstance | null {
  const hit = PRESETS.find((t) => t.templateId === templateId)
  return hit ? cloneInstance(hit) : null
}

export { BLANK_V1, COMPARE_ALPHA_V1, DETAIL_ALPHA_V1, PRICING_V1, MATRIX_V1 }
