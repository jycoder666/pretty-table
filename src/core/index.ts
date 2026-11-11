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
  KpiCard,
  BarFormat,
  DotFormat,
  GanttFormat,
  PosterSpec,
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
  readableTextColor,
  SOFT_BLOCK_COLORS,
  type Palette,
} from './theme/palettes'
export {
  LIMITS,
  STRUCTURE_MIN_ROWS,
  STRUCTURE_MIN_COLS,
  MERGE_MAX_SPAN_ROWS,
  MERGE_MAX_SPAN_COLS,
  MERGE_MAX_CLUSTERS,
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
  groupRowBlocks,
  type GroupRowInfo,
} from './store/intent'
export {
  applyStructuralIntent,
  hasContentInRow,
  hasContentInCol,
  canAddRow,
  canAddCol,
  previewStructuralImpact,
  previewStructuralRange,
  type StructuralImpact,
  type StructuralIntent,
} from './store/structure'
export { moveGate, moveBlockGate, doMoveRow, doMoveCol, doMoveBlockRow, doMoveBlockCol } from './store/moveOps'
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
  drawBarCell,
  type CellMeta,
  type VCustomRenderArgs,
  type VCellRect,
} from './adapter/toOption'

// 表外 KPI 统计卡 + 单元格条形格式（schema 1.2 扩展；预览 / HTML / PNG 三方同源单点）
export {
  KPI_CARD_MAX,
  effectiveKpiCards,
  kpiHeroHeight,
  sanitizeKpiCards,
  sanitizeBar,
  kpiValueText,
  renderKpiHeroHtml,
  drawKpiHero,
  kpiHeroStyle,
  kpiCardStyle,
  kpiValueStyle,
  kpiUnitStyle,
  kpiLabelStyle,
  kpiStripStyle,
  kpiStripItemStyle,
  kpiStripLabelStyle,
  kpiStripValueStyle,
} from './kpi/kpiCards'

// Schema 1.3：页面海报层（预览 / HTML / PNG 三方同源单点）
export {
  hasPoster,
  posterWrapStyle,
  posterHeaderStyles,
  posterFooterStyles,
  posterPadding,
  posterColors,
  posterHeaderHeight,
  posterFooterHeight,
  sanitizePoster,
} from './theme/posterStyle'

// T34：渲染核（VTable 依赖图）只经动态导入出口暴露，壳层用 loadRenderCore()
export { loadRenderCore, type RenderCore } from './render/lazyCore'
export { exportHtml } from './export/html'
export { exportText } from './export/text'
export {
  buildExportModel,
  renderExportHtml,
  captionText,
  type ExportModel,
  type ExportCell,
} from './export/model'
// PNG 估算/门槛常量不依赖 VTable，从 pngSize 静态导出（exportPng 走 loadRenderCore）；
// PNG_PAD 供壳层尺寸档位换算（P4），同样无 VTable 依赖、静态可用
export { measurePng, PNG_MAX_PIXELS_DEFAULT, PNG_PAD } from './export/pngSize'
// P4 CSV 导出：纯数据网格（复用 exportHtml 的 ExportModel 构建链，无 VTable 依赖，静态可用）
export { exportCsv } from './export/csv'

// 模板 JSON 导出/导入（跨设备同步 · 核内单点，壳只做文件 IO）
export { instanceToJSON, instanceFromJSON, type TransferParseResult } from './transfer/transfer'

export {
  listPresetTemplates,
  getPresetTemplate,
  createBlankInstance,
  BLANK_V1,
  COMPARE_ALPHA_V1,
  DETAIL_ALPHA_V1,
  PRICING_V1,
  MATRIX_V1,
  STAT_V1,
  // 保险模板套件 8 张（增量设计-保险模板套件-2026-11-06 TP09 验收②；壳层/测试经此入口）
  AGE_CARE_GUIDE,
  MED_INS_LIST,
  DUTY_COMPARE,
  PRODUCT_CATALOG,
  CARE_TIER_COMPARE,
  CLAIM_STANDARDS,
  CRITICAL_LIST_50,
  PLAN_VS,
} from './templates'
