import { toCssVars, resolveTheme, type ThemeId } from '@/core'

export function applyThemeCssVars(themeId: ThemeId | string, root: HTMLElement = document.documentElement) {
  const { palette } = resolveTheme(themeId)
  const vars = toCssVars(palette)
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v)
  }
  root.dataset.theme = themeId
}
