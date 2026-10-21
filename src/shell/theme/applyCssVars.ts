import { toCssVars, resolveTheme, type Palette, type ThemeId } from '@/core'

/**
 * 把主题配色写到 --pt-* CSS 变量上。
 * palette 缺省 → 按预设主题合成（库页 / 无实例场景）；
 * 传入实例的生效配色（effectivePalette 的合成结果）→ 自定义角色色同步刷新（FR-C1）。
 * 注意：壳层只消费合成后的 Palette，实例覆盖字段不在此处触碰（C-4 / §1.2 红线）。
 */
export function applyThemeCssVars(
  themeId: ThemeId | string,
  palette?: Palette | null,
  root: HTMLElement = document.documentElement,
) {
  const resolved = palette ?? resolveTheme(themeId).palette
  const vars = toCssVars(resolved)
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v)
  }
  root.dataset.theme = themeId
}
