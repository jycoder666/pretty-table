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

export type SlotObject = {
  text: string | number
  align?: Align
  emphasize?: Emphasis | Emphasis[]
}

export type SlotValue = string | number | SlotObject

export interface ThemeTokens {
  primary: string
  zebra?: boolean | string
  emphasis?: string
  border?: string
  background?: string
  tag?: string
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
}

export type TemplateType = 'compare' | 'detail' | 'pricing' | 'matrix'

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

export interface EditorState {
  current: TemplateInstance
  undoSnapshot: TemplateInstance | null
  dirty: boolean
  version: number
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
