import type { RoleColorKey, TemplateInstance } from '../types'
import { resolveTheme, type Palette } from './palettes'

/**
 * 六角色色的壳层消费入口（自定义格式设计增量 §1.2 / FR-C1）。
 * 「单点合成、多点消费」：themeTokens 只允许在核内参与合成，
 * 壳层只读合成后的 Palette / 角色色，因此这里统一暴露只读辅助。
 */

/** 角色色 → Palette 键的映射（background 对应 Palette.paper） */
const ROLE_PALETTE_KEY: Readonly<Record<RoleColorKey, keyof Palette>> = {
  primary: 'primary',
  headerText: 'headerText',
  zebra: 'zebra',
  emphasis: 'emphasis',
  border: 'border',
  background: 'paper',
}

/** UI 呈现的六行角色色（顺序即属性面板展示顺序） */
export const ROLE_KEYS: readonly RoleColorKey[] = [
  'primary',
  'headerText',
  'zebra',
  'emphasis',
  'border',
  'background',
]

/** 角色色的中文标签（属性面板「颜色」区） */
export const ROLE_LABELS: Readonly<Record<RoleColorKey, string>> = {
  primary: '表头底色',
  headerText: '表头文字',
  zebra: '斑马纹',
  emphasis: '强调色',
  border: '边框色',
  background: '表格底色',
}

/** 壳层传实例即可，核内读 themeTokens 合成——壳层不触碰 themeTokens 字段 */
type RoleSource = Pick<TemplateInstance, 'themeId' | 'themeTokens'>

/** 当前实例的生效配色（预设 + 覆盖合成，一次合成） */
export function effectivePalette(inst: RoleSource | null | undefined): Palette | null {
  if (!inst) return null
  return resolveTheme(inst.themeId, inst.themeTokens).palette
}

/** 该角色色当前生效值（未覆盖时 = 预设值） */
export function roleColorOf(inst: RoleSource | null | undefined, role: RoleColorKey): string {
  const pal = effectivePalette(inst)
  if (!pal) return '#000000'
  return pal[ROLE_PALETTE_KEY[role]]
}

/** 该角色色是否被覆盖（与预设不同值；同值覆盖在 setThemeToken 时已被裁剪） */
export function isRoleOverridden(inst: RoleSource | null | undefined, role: RoleColorKey): boolean {
  if (!inst) return false
  const base = resolveTheme(inst.themeId).palette
  const eff = resolveTheme(inst.themeId, inst.themeTokens).palette
  const k = ROLE_PALETTE_KEY[role]
  return base[k].toLowerCase() !== eff[k].toLowerCase()
}
