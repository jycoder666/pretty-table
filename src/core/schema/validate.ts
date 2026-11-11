import { fail, ok, type CoreWarning, type Result } from '../errors'
import type { LayoutStyle, TemplateInstance } from '../types'
import { clampColWidth, clampRowHeight, clampTier, clampTier3 } from '../theme/layoutScales'
import { sanitizeHex } from '../theme/palettes'
import { isImageDataUrl } from '../image/imageGuard'
import { sanitizeBar, sanitizeKpiCards } from '../kpi/kpiCards'
import { sanitizePoster } from '../theme/posterStyle'
import {
  isRichSlotObject,
  sanitizeCells,
  sanitizeChampion,
  sanitizeMatch,
  sanitizeSlotDeco,
  sanitizeStyle13,
} from './sanitize13'

/** themeTokens 里的角色色键（schema 1.2），hex 值需要清洗 */
const TOKEN_COLOR_KEYS: readonly string[] = [
  'primary',
  'headerText',
  'zebra',
  'emphasis',
  'success',
  'border',
  'background',
  'tag',
  'emphasisSoft',
]

/** style 档位与列宽钳制（宽容未知键、越界收口，不报错崩） */
function sanitizeStyle(style: LayoutStyle | undefined): LayoutStyle | undefined {
  if (!style || typeof style !== 'object') return undefined
  const out: LayoutStyle = { ...style }
  if (out.rowHeightTier !== undefined) out.rowHeightTier = clampTier(Number(out.rowHeightTier))
  if (out.fontSizeTier !== undefined) out.fontSizeTier = clampTier3(Number(out.fontSizeTier))
  if (out.paddingTier !== undefined) out.paddingTier = clampTier3(Number(out.paddingTier))
  if (out.colWidths !== undefined) {
    out.colWidths = Array.isArray(out.colWidths)
      ? out.colWidths.map((w) =>
          typeof w === 'number' && Number.isFinite(w) ? clampColWidth(w) : null,
        )
      : undefined
  }
  return out
}

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
  // schema 2.x 及以上为破坏性变更，读入即拒（增强期设计增量 §3.2）
  const major = /^(\d+)/.exec(inst.schemaVersion)
  if (major && Number(major[1]) >= 2) {
    return fail('TEMPLATE_INVALID', '模板版本过新，无法读取', { schemaVersion: inst.schemaVersion })
  }
  if (inst.zebraOn === undefined) inst.zebraOn = true
  if (!inst.highlight) inst.highlight = { recommendCol: null }

  const warnings: CoreWarning[] = []

  // schema 1.2：layout.style 钳制（越界收口到档位/列宽边界）
  if (inst.layout.style) {
    const style = sanitizeStyle(inst.layout.style)
    if (style) {
      // schema 1.3：字体族 / 边框方案 / 表头形状枚举清洗
      sanitizeStyle13(style)
      inst.layout = { ...inst.layout, style }
    } else {
      inst.layout = { ...inst.layout }
      delete inst.layout.style
    }
  }

  // schema 1.2：themeTokens 角色 hex 清洗——非法值清除该键 + warn TOKEN_INVALID
  if (inst.themeTokens && typeof inst.themeTokens === 'object') {
    const tokens = inst.themeTokens as unknown as Record<string, unknown>
    let badHex = 0
    for (const k of TOKEN_COLOR_KEYS) {
      const v = tokens[k]
      if (typeof v !== 'string') continue
      const s = sanitizeHex(v)
      if (s === null) {
        delete tokens[k]
        badHex++
      } else if (s !== v) {
        tokens[k] = s
      }
    }
    if (badHex > 0) {
      warnings.push({
        code: 'TOKEN_INVALID',
        message: `${badHex} 处颜色设置读不出来，已恢复预设`,
        details: { count: badHex },
      })
    }
  }

  // 交互升级 R-3：图片槽值形态校验（宽容未知，畸形清洗）——{image} 非白名单 data URL → 删除 + warn
  if (inst.slots && typeof inst.slots === 'object') {
    const slots = inst.slots as unknown as Record<string, unknown>
    let badImages = 0
    for (const [id, v] of Object.entries(slots)) {
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue
      const obj = v as Record<string, unknown>
      if (!('image' in obj)) continue
      if (typeof obj.image !== 'string' || !isImageDataUrl(obj.image)) {
        delete slots[id]
        badImages++
      }
    }
    if (badImages > 0) {
      warnings.push({
        code: 'IMAGE_INVALID',
        message: '有一张图片读不出来，已清空该格',
        details: { count: badImages },
      })
    }
    // Schema 1.2 扩展：槽值 bar 格式清洗（ratio 非法删键、color 非法 hex 回主题默认）
    for (const [id, v] of Object.entries(slots)) {
      if (!v || typeof v !== 'object' || Array.isArray(v) || !('bar' in v)) continue
      const obj = v as Record<string, unknown>
      const cleaned = sanitizeBar(obj.bar)
      if (!cleaned) delete obj.bar
      else obj.bar = cleaned
      void id
    }
    // Schema 1.3 扩展：格内装饰字段清洗（sub/逐格色/星级/圆点/甘特/时间轴/点线/描边盒）
    for (const v of Object.values(slots)) {
      if (!isRichSlotObject(v)) continue
      sanitizeSlotDeco(v as unknown as Record<string, unknown>)
    }
    // Schema 1.5 扩展：对阵/打卡/冠军槽清洗（畸形删键退回空槽）
    for (const [id, v] of Object.entries(slots)) {
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue
      const obj = v as Record<string, unknown>
      if ('match' in obj) {
        const m = sanitizeMatch(obj.match)
        if (m) obj.match = m
        else delete slots[id]
      }
      if ('cells' in obj) {
        const c = sanitizeCells(obj.cells)
        if (c) obj.cells = c
        else delete slots[id]
      }
      if ('champion' in obj) {
        const c = sanitizeChampion(obj.champion)
        if (c) obj.champion = c
        else delete slots[id]
      }
    }
  }

  // Schema 1.2 扩展：kpiCards 清洗（非数组删字段；项级清洗与截断在 sanitizeKpiCards 内）
  const kpiClean = sanitizeKpiCards(inst.kpiCards)
  if (kpiClean === null) delete inst.kpiCards
  else inst.kpiCards = kpiClean

  // Schema 1.3：kpiStyle 枚举清洗（cards/strip 之外删键）
  if (
    inst.kpiStyle !== undefined &&
    inst.kpiStyle !== 'cards' &&
    inst.kpiStyle !== 'strip' &&
    inst.kpiStyle !== 'plain'
  ) {
    delete inst.kpiStyle
  }

  // Schema 1.5：meta.cover 封面清洗（data URL 白名单 + 400KB 上限；非法删键）
  if (inst.meta && typeof inst.meta === 'object') {
    const meta = inst.meta as Record<string, unknown>
    if ('cover' in meta) {
      const cover = meta.cover
      if (typeof cover !== 'string' || !isImageDataUrl(cover) || cover.length > 400_000) {
        delete meta.cover
      }
    }
  }

  // Schema 1.3：poster 海报层清洗（枚举/hex/行数/留白钳制；全空删字段零占位）
  if (inst.poster !== undefined) {
    const poster = sanitizePoster(inst.poster)
    if (poster) inst.poster = poster
    else delete inst.poster
  }

  return ok(cloneInstance(inst), warnings.length ? warnings : undefined)
}

/** Deep clone via JSON — safe for Vue reactive proxies (structuredClone cannot clone Proxy). */
export function cloneInstance(inst: TemplateInstance): TemplateInstance {
  return JSON.parse(JSON.stringify(inst)) as TemplateInstance
}
