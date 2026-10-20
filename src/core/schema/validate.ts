import { fail, ok, type Result } from '../errors'
import type { TemplateInstance } from '../types'

export function validateInstance(json: unknown): Result<TemplateInstance> {
  if (!json || typeof json !== 'object') {
    return fail('TEMPLATE_INVALID', '模板不是有效对象')
  }
  const o = json as Record<string, unknown>
  if (typeof o.templateId !== 'string' || !o.templateId) {
    return fail('TEMPLATE_INVALID', '缺少 templateId')
  }
  if (!o.slots || typeof o.slots !== 'object') {
    return fail('TEMPLATE_INVALID', '缺少 slots')
  }
  if (!Array.isArray(o.blocks)) {
    return fail('TEMPLATE_INVALID', '缺少 blocks')
  }
  if (!o.layout || typeof o.layout !== 'object') {
    return fail('TEMPLATE_INVALID', '缺少 layout')
  }
  const layout = o.layout as Record<string, unknown>
  if (!Array.isArray(layout.blockSlots)) {
    return fail('TEMPLATE_INVALID', 'layout.blockSlots 无效')
  }
  if (typeof o.themeId !== 'string' || !o.themeId) {
    return fail('TEMPLATE_INVALID', '缺少 themeId')
  }

  const inst = o as unknown as TemplateInstance
  if (!inst.schemaVersion) inst.schemaVersion = '1.0'
  if (inst.zebraOn === undefined) inst.zebraOn = true
  return ok(cloneInstance(inst))
}

/** Deep clone via JSON — safe for Vue reactive proxies (structuredClone cannot clone Proxy). */
export function cloneInstance(inst: TemplateInstance): TemplateInstance {
  return JSON.parse(JSON.stringify(inst)) as TemplateInstance
}
