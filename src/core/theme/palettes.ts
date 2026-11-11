import type { ThemeId, ThemeTokens } from '../types'
import type { CoreWarning } from '../errors'

/** Single source of truth for T-A/B/C (G-2 / C-6). Hex only here. */

export interface Palette {
  paper: string
  primary: string
  headerText: string
  zebra: string
  emphasis: string
  /** 正向/成功语义色（「正常」青绿点等），token 可覆盖 */
  success: string
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
    success: '#1E9E6A',
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
    success: '#2E8B6A',
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
    success: '#5E8C4A',
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

/**
 * hex 输入钳制（自定义格式设计增量 §1.2）：只收 #RGB / #RRGGBB，
 * 规范为小写 6 位；非法返回 null（调用方不写入 + 壳内轻提示，不产生错误码）。
 */
export function sanitizeHex(v: string): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const h = s.slice(1)
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase()
  }
  return null
}

/**
 * 分组行 / 分区条柔彩预设（编辑台二轮 2026-11-07）：区块级底色可选值单点。
 * 仅 hex 清单在此（G-2：色值只准出现在 core/theme 下）；界面用词（杏橙/豆绿/…）由壳层配。
 */
export const SOFT_BLOCK_COLORS: readonly string[] = [
  '#f7e3d2', // 杏橙
  '#d9ebdc', // 豆绿
  '#dce8f7', // 雾蓝
  '#e9e1f5', // 浅紫
]

/**
 * 按底色亮度取可读文字色（区块级自定义底色的文字自动黑白）。
 * 感知亮度（ITU-R BT.601 加权）> 0.6 → 深字，否则白字；非法 hex 回退深字（浅底为主流）。
 */
export function readableTextColor(bg: string): string {
  const hex = sanitizeHex(bg)
  if (!hex) return '#1a1a1a'
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#1a1a1a' : '#ffffff'
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
  // schema 1.2：表头文字色覆盖（新键 headerText）
  if (tokens?.headerText) base.headerText = tokens.headerText
  if (typeof tokens?.zebra === 'string') base.zebra = tokens.zebra
  if (tokens?.emphasis) base.emphasis = tokens.emphasis
  if (tokens?.success) base.success = tokens.success
  if (tokens?.border) base.border = tokens.border
  if (tokens?.background) base.paper = tokens.background
  if (tokens?.tag) base.tag = tokens.tag
  // 复刻通道微调（2026-11-10）：柔彩底补开 token 覆盖（'bg' mark 消费），与同级角色色对齐
  if (tokens?.emphasisSoft) base.emphasisSoft = tokens.emphasisSoft

  const zebraOn = tokens?.zebra === false ? false : true
  return { themeId: resolved, palette: base, zebraOn, warning }
}
