/** Render core public API — shell may only import from this file (C-4). */

export type {
  ThemeId,
  BlockType,
  Align,
  Emphasis,
  CellCoord,
  MergeRange,
  SlotObject,
  SlotValue,
  MarkValue,
  MarkSlotObject,
  NumSlotObject,
  ImageSlotObject,
  TextSlotObject,
  SlotDef,
  ThemeTokens,
  RoleColorKey,
  LayoutStyle,
  BlockDesc,
  BlockSlotDef,
  LayoutSpec,
  TemplateType,
  TemplateMeta,
  TemplateInstance,
  TemplateDefinition,
  TemplateJSON,
  EditIntent,
  EditorState,
  RenderState,
  RenderContext,
  PngExportOptions,
  CoreOptions,
  CoreHandle,
  ViewportRect,
  ViewportHit,
} from './types'

export type { ErrorCode, WarnCode, CoreError, CoreWarning, Result, PasteErrorCode } from './errors'
export { ok, fail } from './errors'

export {
  IMAGE_LIMITS,
  canSetImage,
  checkImageBudget,
  validateImageDataUrl,
  isImageDataUrl,
  dataUrlBytes,
  coverCrop,
  type ImageFormat,
} from './image/imageGuard'

export { validateInstance, cloneInstance } from './schema/validate'
export { snapshotForUndo } from './schema/clone'
export { migrateInstance, SCHEMA_VERSION_CURRENT } from './schema/migrate'

export {
  MARK_GLYPH,
  MARK_LABEL,
  MARK_WORDS,
  RECOMMEND_BADGE_TEXT,
  formatNumber,
  parseMark,
} from './format/formatTokens'
export { parseNumeric } from './format/parseNumeric'

export {
  PALETTES,
  THEME_NAMES,
  DEFAULT_THEME_ID,
  resolveTheme,
  isThemeId,
  sanitizeHex,
  type Palette,
} from './theme/palettes'
export {
  LIMITS,
  COL_WIDTH_RANGE,
  ROW_HEIGHT_TIERS,
  FONT_SIZE_TIERS,
  PADDING_TIERS,
  clampColWidth,
  clampTier,
  visibleRowCount,
} from './theme/layoutScales'
export { ROLE_SWATCHES } from './theme/swatch'
export {
  ROLE_KEYS,
  ROLE_LABELS,
  effectivePalette,
  roleColorOf,
  isRoleOverridden,
} from './theme/roles'
export { FONT_STACK } from './theme/font'
export { toCssVars } from './theme/cssVars'
export { toVTableTheme } from './theme/vtableTheme'
export { cellInlineStyle } from './theme/inlineStyle'
export { semanticColor, type SemanticColorKind } from './theme/semantic'

export {
  applyEditIntent,
  isEmphasizable,
  getSlotDisplayText,
  countFilledSlotsInRange,
  slotIdsInRange,
} from './store/intent'
export {
  applyStructuralIntent,
  hasContentInRow,
  hasContentInCol,
  canAddRow,
  canAddCol,
  type StructuralIntent,
} from './store/structure'
export { canMerge, canSplit, findMergeAt } from './store/mergeGuard'
export { createStoreTxn, type StoreTxn, type StoreTxnResult } from './store/txn'
export { parsePaste, type PasteCell, type PasteGrid } from './paste/parser'
export {
  buildVisibleGrid,
  planPaste,
  type VisibleRow,
  type PastePlan,
  type PastePlanCell,
} from './paste/planner'
export {
  validatePaste,
  type ValidatedPastePlan,
  type PasteValidation,
} from './paste/validator'
export {
  createEditorState,
  dispatch,
  dispatchBatch,
  undo,
  redo,
  markClean,
  replaceCurrent,
  canUndo,
  canRedo,
  pushSnapshot,
  type DispatchOptions,
} from './store/editorState'
export { UNDO_LIMITS } from './types'

export {
  toOption,
  measureContentSize,
  buildVisualRows,
  remapMerges,
  findSlotAtVisual,
  visualToLogicalRow,
  colWidthAt,
  rowHeightOf,
  typeMetrics,
  drawImageCell,
  type CellMeta,
  type VCustomRenderArgs,
  type VCellRect,
} from './adapter/toOption'

// T34：渲染核（VTable 依赖图）只经动态导入出口暴露，壳层用 loadRenderCore()
export { loadRenderCore, type RenderCore } from './render/lazyCore'
export { exportHtml } from './export/html'
export { exportText } from './export/text'
export {
  buildExportModel,
  renderExportHtml,
  type ExportModel,
  type ExportCell,
} from './export/model'
// PNG 估算/门槛常量不依赖 VTable，从 pngSize 静态导出（exportPng 走 loadRenderCore）
export { measurePng, PNG_MAX_PIXELS_DEFAULT } from './export/pngSize'

export {
  listPresetTemplates,
  getPresetTemplate,
  createBlankInstance,
  BLANK_V1,
  COMPARE_ALPHA_V1,
  DETAIL_ALPHA_V1,
  PRICING_V1,
  MATRIX_V1,
} from './templates'
