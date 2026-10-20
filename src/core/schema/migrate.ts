import { fail, ok, type CoreWarning, type Result } from '../errors'
import type { SlotDef, TemplateDefinition, TemplateInstance, TemplateType } from '../types'

/**
 * Schema migration (增强期设计增量 §3.3/§3.4):
 * - 读 1.0/1.x → 补默认值，写出 schemaVersion "1.1"（写时一律 1.1）
 * - 读 2.x → TEMPLATE_INVALID
 * - 非法 mark/format/recommendCol 值 → warn 不拒
 * - 缺 slotGrid 时借系统底稿（sourceTemplateId / 同 templateId，且行列一致）
 * 纯函数：不修改入参，只改内存副本；不批量回写本机已存模板。
 */

export const SCHEMA_VERSION_CURRENT = '1.1'

/** OUT-13：实例里携带的语义色/符号映射一律忽略 */
export const SEMANTIC_TOKEN_KEYS: readonly string[] = [
  'markYesColor',
  'markNoColor',
  'markPartialColor',
  'recommendBadgeBg',
  'recommendBadgeText',
  'recommendColBg',
]

const VALID_SLOT_KINDS: readonly string[] = ['text', 'number', 'mark']
const VALID_FORMATS: readonly string[] = ['number', 'percent', 'currency']

function schemaMajor(v: unknown): number {
  const m = /^(\d+)/.exec(typeof v === 'string' ? v : '')
  return m ? Number(m[1]) : 0
}

function inferTemplateType(templateId: string): TemplateType {
  if (/pricing|price|价目/i.test(templateId)) return 'pricing'
  if (/matrix|矩阵/i.test(templateId)) return 'matrix'
  if (/detail|明细/i.test(templateId)) return 'detail'
  return 'compare'
}

export function migrateInstance(
  json: unknown,
  presets: readonly TemplateDefinition[],
): Result<TemplateInstance> {
  // 结构最低要求（与 validateInstance 对齐；缺必填即拒）
  if (!json || typeof json !== 'object') return fail('TEMPLATE_INVALID', '模板不是有效对象')
  const o = json as Record<string, unknown>
  if (typeof o.templateId !== 'string' || !o.templateId) {
    return fail('TEMPLATE_INVALID', '缺少 templateId')
  }
  if (!o.slots || typeof o.slots !== 'object') return fail('TEMPLATE_INVALID', '缺少 slots')
  if (!Array.isArray(o.blocks)) return fail('TEMPLATE_INVALID', '缺少 blocks')
  if (!o.layout || typeof o.layout !== 'object') return fail('TEMPLATE_INVALID', '缺少 layout')
  if (typeof o.themeId !== 'string' || !o.themeId) return fail('TEMPLATE_INVALID', '缺少 themeId')

  const rawVersion = typeof o.schemaVersion === 'string' ? o.schemaVersion : '1.0'
  if (schemaMajor(rawVersion) >= 2) {
    return fail('TEMPLATE_INVALID', '模板版本过新，无法读取', { schemaVersion: rawVersion })
  }

  const inst = JSON.parse(JSON.stringify(o)) as TemplateInstance
  const warnings: CoreWarning[] = []
  inst.schemaVersion = SCHEMA_VERSION_CURRENT

  // meta.templateType 缺省 → 按 templateId 推断，推断不到 compare
  inst.meta = { ...inst.meta }
  if (!inst.meta.templateType) {
    inst.meta.templateType = inferTemplateType(inst.templateId)
  }

  const layout = { ...inst.layout }
  inst.layout = layout

  // highlight 缺省 → recommendCol=null
  if (!inst.highlight || typeof inst.highlight !== 'object') {
    inst.highlight = { recommendCol: null }
  } else if (inst.highlight.recommendCol === undefined) {
    inst.highlight = { ...inst.highlight, recommendCol: null }
  }

  // slotDefs：先保留声明并清洗 format/kind
  let slotDefs: Record<string, SlotDef> = {}
  if (inst.slotDefs && typeof inst.slotDefs === 'object') {
    for (const [id, def] of Object.entries(inst.slotDefs)) {
      if (!def || typeof def !== 'object') continue
      const d: SlotDef = { ...def }
      if (d.format !== undefined && !VALID_FORMATS.includes(d.format)) {
        d.format = 'number'
        warnings.push({
          code: 'FORMAT_UNKNOWN',
          message: '无法识别的数字格式，已按数字处理',
          details: { slotId: id, format: def.format },
        })
      }
      if (d.kind !== undefined && !VALID_SLOT_KINDS.includes(d.kind)) {
        d.kind = 'text'
        warnings.push({
          code: 'UNKNOWN_FIELD',
          message: '无法识别的槽位类型，已按文字处理',
          details: { slotId: id, kind: def.kind },
        })
      }
      slotDefs[id] = d
    }
  }

  // 缺 slotGrid → 借系统底稿（§3.4）：sourceTemplateId 优先，其次同 templateId
  if (!layout.slotGrid) {
    const sourceId = inst.meta.sourceTemplateId ?? inst.templateId
    const preset = presets.find((p) => p.templateId === sourceId)
    if (
      preset?.layout?.slotGrid &&
      preset.layout.rowCount === layout.rowCount &&
      preset.layout.colCount === layout.colCount
    ) {
      layout.slotGrid = JSON.parse(JSON.stringify(preset.layout.slotGrid)) as (string | null)[][]
      if (!inst.slotDefs && preset.slotDefs) {
        slotDefs = JSON.parse(JSON.stringify(preset.slotDefs)) as Record<string, SlotDef>
      }
    }
    // 借不到 → 保持缺省：实例照常可编辑、可导出，仅粘贴不可用（PASTE_UNSUPPORTED）
  }
  inst.slotDefs = slotDefs

  // 槽值清洗：mark 不在三值 → null + warn；num 非数字 → null
  const slots = inst.slots as Record<string, unknown>
  for (const [id, v] of Object.entries(slots)) {
    if (!v || typeof v !== 'object') continue
    const obj = v as Record<string, unknown>
    if ('mark' in obj) {
      const m = obj.mark
      if (m !== null && m !== 'yes' && m !== 'no' && m !== 'partial') {
        inst.slots[id] = { ...obj, mark: null }
        warnings.push({
          code: 'MARK_UNKNOWN',
          message: '无法识别的符号值，已按未选处理',
          details: { slotId: id, mark: m },
        })
      }
    } else if ('num' in obj && typeof obj.num !== 'number' && obj.num !== null) {
      inst.slots[id] = { ...obj, num: null }
    }
  }

  // recommendCol 必须在 recommendableCols 内，否则置 null + warn
  const recs = Array.isArray(layout.recommendableCols)
    ? (layout.recommendableCols as number[])
    : []
  const recCol = inst.highlight.recommendCol
  if (recCol !== null && recCol !== undefined && !recs.includes(recCol)) {
    inst.highlight = { recommendCol: null }
    warnings.push({
      code: 'UNKNOWN_FIELD',
      message: '推荐列不在可推荐范围内，已取消推荐',
      details: { recommendCol: recCol },
    })
  } else if (inst.highlight.recommendCol === undefined) {
    inst.highlight = { recommendCol: null }
  }

  // themeTokens 里的语义色映射一律忽略（OUT-13）
  if (inst.themeTokens && typeof inst.themeTokens === 'object') {
    const tokens = inst.themeTokens as unknown as Record<string, unknown>
    const hit = SEMANTIC_TOKEN_KEYS.filter((k) => k in tokens)
    if (hit.length) {
      for (const k of hit) delete tokens[k]
      warnings.push({
        code: 'UNKNOWN_FIELD',
        message: '不支持自定义符号与颜色，相关设置已忽略',
        details: { keys: hit },
      })
    }
  }

  return ok(inst, warnings)
}
