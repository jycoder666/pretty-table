import type { TemplateInstance } from '../types'
import { COMPARE_ALPHA_V1 } from './compare-alpha-v1'
import { DETAIL_ALPHA_V1 } from './detail-alpha-v1'
import { cloneInstance } from '../schema/validate'

const PRESETS: TemplateInstance[] = [COMPARE_ALPHA_V1, DETAIL_ALPHA_V1]

export function listPresetTemplates(): TemplateInstance[] {
  return PRESETS.map((t) => cloneInstance(t))
}

export function getPresetTemplate(templateId: string): TemplateInstance | null {
  const hit = PRESETS.find((t) => t.templateId === templateId)
  return hit ? cloneInstance(hit) : null
}

export { COMPARE_ALPHA_V1, DETAIL_ALPHA_V1 }
