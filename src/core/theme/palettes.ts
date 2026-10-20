import type { ThemeId, ThemeTokens } from '../types'
import type { CoreWarning } from '../errors'

/** Single source of truth for T-A/B/C (G-2 / C-6). Hex only here. */

export interface Palette {
  paper: string
  primary: string
  headerText: string
  zebra: string
  emphasis: string
  emphasisSoft: string
  border: string
  tag: string
  tagText: string
  /** 次要文字灰（提示/占位），供壳层 CSS 变量 --pt-muted 使用 */
  muted: string
}

export const PALETTES: Readonly<Record<ThemeId, Palette>> = {
  'T-A': {
    paper: '#F7F9FC',
    primary: '#2F5B9A',
    headerText: '#FFFFFF',
    zebra: '#EEF2F7',
    emphasis: '#C0392B',
    emphasisSoft: '#FDECEA',
    border: '#C5D0DE',
    tag: '#E8EEF6',
    tagText: '#2F5B9A',
    muted: '#6B7280',
  },
  'T-B': {
    paper: '#F4F6F3',
    primary: '#2F4F45',
    headerText: '#F5F7F4',
    zebra: '#E8EDE8',
    emphasis: '#A65B2A',
    emphasisSoft: '#F5EDE4',
    border: '#B7C2B8',
    tag: '#DCE5DF',
    tagText: '#2F4F45',
    muted: '#6B7280',
  },
  'T-C': {
    paper: '#FAF7F2',
    primary: '#4A463F',
    headerText: '#FAF7F2',
    zebra: '#F0EBE3',
    emphasis: '#8A6A2F',
    emphasisSoft: '#F5EDD8',
    border: '#D4CBBC',
    tag: '#EDE6DA',
    tagText: '#4A463F',
    muted: '#6B7280',
  },
}

export const THEME_NAMES: Readonly<Record<ThemeId, string>> = {
  'T-A': '蓝白台账',
  'T-B': '墨青簿册',
  'T-C': '暖灰金',
}

export const DEFAULT_THEME_ID: ThemeId = 'T-A'

export function isThemeId(id: string): id is ThemeId {
  return id === 'T-A' || id === 'T-B' || id === 'T-C'
}

export function resolveTheme(
  themeId: string,
  tokens?: ThemeTokens,
): {
  themeId: ThemeId
  palette: Palette
  zebraOn: boolean
  warning?: CoreWarning
} {
  let resolved: ThemeId = DEFAULT_THEME_ID
  let warning: CoreWarning | undefined
  if (isThemeId(themeId)) {
    resolved = themeId
  } else {
    warning = {
      code: 'THEME_MISSING',
      message: '主题不存在，已用默认',
      details: { themeId },
    }
  }
  const base = { ...PALETTES[resolved] }
  if (tokens?.primary) base.primary = tokens.primary
  if (typeof tokens?.zebra === 'string') base.zebra = tokens.zebra
  if (tokens?.emphasis) base.emphasis = tokens.emphasis
  if (tokens?.border) base.border = tokens.border
  if (tokens?.background) base.paper = tokens.background
  if (tokens?.tag) base.tag = tokens.tag

  const zebraOn = tokens?.zebra === false ? false : true
  return { themeId: resolved, palette: base, zebraOn, warning }
}
