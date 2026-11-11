/**
 * Schema 1.3 装饰绘制通道的中性兜底色单点（G-2：hex 只准在 core/theme 下）。
 * decoDrawVRender 的 spec 缺字段兜底（正常路径 decoSpecOf 已从 palette 派生，
 * 这些值仅在 spec 被直构时兜底，视觉中性灰阶/既定强调色）。
 */
export const DECO_INK = '#1a1a1a'
export const DECO_SUB_INK = '#888888'
export const DECO_STAR = '#c8a24a'
export const DECO_STAR_EMPTY = '#ddd6c8'
export const DECO_DOT = '#c0653a'
export const DECO_TRACK = '#eeeeee'
export const DECO_LINE = '#cccccc'
export const DECO_LEADER = '#bbbbbb'
export const DECO_PILL_INK = '#ffffff'
export const DECO_BANNER_INK = '#333333'
export const DECO_BANNER_BAR = '#3a6ea5'
export const DECO_MILESTONE = '#e8632c'

/** Schema 1.5 对阵/冠军卡兜底色（正常路径 spec 已从 palette 派生） */
export const DECO_WIN_GOLD = '#d9b45a'
export const DECO_CARD_INK = '#ffffff'
export const DECO_CARD_MUTED = '#9a9a92'
export const DECO_CELLS_INK = '#2e5949'
export const DECO_CELLS_TODAY = '#c0653a'
export const DECO_CELLS_EMPTY = '#cccccc'
