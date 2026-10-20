import type { Palette } from './palettes'

/**
 * 语义 → 既有主题 token 映射（增强期设计增量 §4.3 / OUT-13）。
 * 只映射 U-2 既有 token，不新增色值；实例 themeTokens 的覆盖一律被忽略。
 */
export type SemanticColorKind =
  | 'yes'
  | 'no'
  | 'partial'
  | 'recommendBadgeBg'
  | 'recommendBadgeText'
  | 'recommendColBg'

export function semanticColor(palette: Palette, kind: SemanticColorKind): string {
  switch (kind) {
    case 'yes':
    case 'partial':
      return palette.primary
    case 'no':
      return palette.emphasis
    case 'recommendBadgeBg':
      return palette.emphasis
    case 'recommendBadgeText':
      return palette.headerText
    case 'recommendColBg':
      return palette.emphasisSoft
  }
}
