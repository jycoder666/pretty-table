/** Core types — shell/core contract (G-AR-01). No Vue/Pinia imports. */

export type ThemeId = 'T-A' | 'T-B' | 'T-C'
export type BlockType = 'sectionBar' | 'groupHeader' | 'emphFooter' | 'leftTag'
export type Align = 'left' | 'center' | 'right'
export type Emphasis = 'bold' | 'red' | 'bg'
export type CellCoord = [row: number, col: number]

export interface MergeRange {
  start: CellCoord
  end: CellCoord
}

export interface TextSlotObject {
  text: string | number
  align?: Align
  emphasize?: Emphasis | Emphasis[]
}

/** Schema 1.1: three-state semantic mark */
export type MarkValue = 'yes' | 'no' | 'partial'

/** Schema 1.1: semantic mark value (never a glyph; glyph comes from FormatTokens) */
export interface MarkSlotObject {
  mark: MarkValue | null
  align?: Align
  emphasize?: Emphasis | Emphasis[]
}

/** Schema 1.1: numeric value; display format comes from SlotDef */
export interface NumSlotObject {
  num: number | null
  align?: Align
  emphasize?: Emphasis | Emphasis[]
}

export type SlotObject = TextSlotObject | MarkSlotObject | NumSlotObject

export type SlotValue = string | number | SlotObject

/** Schema 1.1: per-slot declaration of kind and display format (FR-21/22, template-owned) */
export interface SlotDef {
  kind?: 'text' | 'number' | 'mark'
  format?: 'number' | 'percent' | 'currency'
  currency?: 'CNY' | 'USD'
  fractionDigits?: 0 | 1 | 2 | 3 | 4
  unit?: string
  locked?: boolean
}

/** 可自定义的表格角色色（UI 呈现六行；设计增量 §1.2 映射表） */
export type RoleColorKey =
  | 'primary' // 表头底色（表头与分区色条同源，沿用既有语义）
  | 'headerText' // 表头文字色（schema 1.2 新键）
  | 'zebra' // 斑马纹色（开关走既有 zebraOn / setZebra）
  | 'emphasis' // 强调色
  | 'border' // 边框色
  | 'background' // 表底纸色（Palette.paper）

export interface ThemeTokens {
  primary: string
  /** schema 1.2：表头文字色覆盖 */
  headerText?: string
  zebra?: boolean | string
  emphasis?: string
  border?: string
  background?: string
  tag?: string
}

/** 排版微调档位（全局；px 映射在 core/theme/layoutScales.ts） */
export interface LayoutStyle {
  /** 与列一一对应；null/缺位 = 该列用默认宽 */
  colWidths?: (number | null)[]
  rowHeightTier?: 1 | 2 | 3
  fontSizeTier?: 1 | 2 | 3
  paddingTier?: 1 | 2 | 3
}

export interface BlockDesc {
  id: string
  type: BlockType
  slotId: string
  props?: {
    label?: string
    text?: string
    styleTier?: 1 | 2 | 3
    [k: string]: unknown
  }
}

export interface BlockSlotDef {
  id: string
  accept: BlockType[]
  rowHint?: string
  region?: string
  mutexGroup?: string
  occupiedPolicy?: 'replace' | 'reject'
}

export interface LayoutSpec {
  rowCount: number
  colCount: number
  frozenColCount?: number
  merges?: MergeRange[]
  allowedMerges?: MergeRange[]
  structuralMerges?: MergeRange[]
  blockSlots: BlockSlotDef[]
  headerLevels?: 1 | 2 | 3
  /** Logical slot id per cell; null = not a writable slot */
  slotGrid?: (string | null)[][]
  /** Cells that are template-fixed (not editable / not emphasizable) */
  readonlyCells?: CellCoord[]
  /** Schema 1.1: columns eligible for the "recommended" badge; empty/absent = not supported */
  recommendableCols?: number[]
  /** Schema 1.1: slot used as the table caption in HTML export (FR-25) */
  captionSlot?: string
  /** schema 1.2：排版微调档位（缺省 = 全按预设默认） */
  style?: LayoutStyle
}

export type TemplateType = 'compare' | 'detail' | 'pricing' | 'matrix' | 'blank'

export interface TemplateMeta {
  displayName?: string
  description?: string
  templateType?: TemplateType
  origin?: 'preset' | 'user'
  sourceTemplateId?: string | null
  savedAt?: string | null
}

export interface TemplateInstance {
  schemaVersion: string
  templateId: string
  themeId: ThemeId | string
  themeTokens?: ThemeTokens
  slots: Record<string, SlotValue>
  blocks: BlockDesc[]
  layout: LayoutSpec
  meta?: TemplateMeta
  /** Schema 1.1: slot kind/format declarations; absent = all slots are plain text */
  slotDefs?: Record<string, SlotDef>
  /** Schema 1.1: at most one recommended column */
  highlight?: { recommendCol: number | null }
  /** Runtime: zebra on/off; defaults true when unset */
  zebraOn?: boolean
}

export type TemplateDefinition = TemplateInstance
export type TemplateJSON = TemplateInstance

export type EditIntent =
  | { kind: 'setSlot'; slotId: string; value: SlotValue }
  | { kind: 'setTheme'; themeId: ThemeId }
  | { kind: 'setZebra'; on: boolean }
  | { kind: 'merge'; range: MergeRange }
  | { kind: 'split'; range: MergeRange }
  | { kind: 'setAlign'; slotId: string; align: Align }
  | { kind: 'setEmphasis'; slotId: string; emphasize: Emphasis[] }
  | { kind: 'addBlock'; block: BlockDesc }
  | { kind: 'removeBlock'; blockId: string }
  | { kind: 'updateBlock'; blockId: string; props: Partial<NonNullable<BlockDesc['props']>> }
  /** 增强期 FR-23：最多一列推荐；设新列即替换旧值，null 取消 */
  | { kind: 'setRecommendCol'; col: number | null }
  /** FR-C1 颜色覆盖：value=null 清除该角色覆盖（回到预设） */
  | { kind: 'setThemeToken'; token: RoleColorKey; value: string | null }
  | { kind: 'resetThemeTokens' }
  /** FR-C2 排版档位（width=null 恢复默认宽） */
  | { kind: 'setColWidth'; col: number; width: number | null }
  | { kind: 'setRowHeightTier'; tier: 1 | 2 | 3 }
  | { kind: 'setFontSizeTier'; tier: 1 | 2 | 3 }
  | { kind: 'setPaddingTier'; tier: 1 | 2 | 3 }
  /** FR-C3 结构编辑（全部按钮式；一次意图 = 一张撤销快照 = 一套 remap） */
  | { kind: 'addRow'; afterRow?: number }
  | { kind: 'removeRow'; row: number }
  | { kind: 'addCol'; afterCol?: number }
  | { kind: 'removeCol'; col: number }
  | { kind: 'setHeaderLevel'; levels: 1 | 2 | 3 }

export interface EditorState {
  current: TemplateInstance
  undoSnapshot: TemplateInstance | null
  /** PX-03：二级撤销链，仅文字编辑会话边界（beginTextSession）推进；普通操作保持一步撤销 */
  undoPrev?: TemplateInstance | null
  dirty: boolean
  version: number
  /** 粘贴预览期间为 true：合并/拆分/对齐/强调/区块等编辑意图一律被拒（FR-17） */
  pastePending?: boolean
}

export type RenderState = 'loading' | 'ready' | 'error'
export type RenderContext = { mode: 'preview' | 'export'; transparentUnderlay?: boolean }

export interface PngExportOptions {
  scale?: 1 | 2 | 3
  transparent?: boolean
  maxPixels?: number
}

export interface CoreOptions {
  initial?: TemplateJSON
  blockSlotPolicy?: 'replace' | 'reject'
  onError?: (err: import('./errors').CoreError) => void
  onRenderState?: (s: RenderState) => void
}

export interface CoreHandle {
  loadTemplate(json: TemplateJSON): void
  applyTheme(themeId: string | ThemeTokens): void
  setSlot(slotId: string, value: SlotValue): void
  addBlock(block: BlockDesc): void
  removeBlock(blockId: string): void
  exportHtml(): Promise<string>
  exportPng(opts?: PngExportOptions): Promise<Blob>
  getPreviewEl(): HTMLElement | null
  destroy(): void
}
