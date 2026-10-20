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
  ThemeTokens,
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
} from './types'

export type { ErrorCode, WarnCode, CoreError, CoreWarning, Result, PasteErrorCode } from './errors'
export { ok, fail } from './errors'

export { validateInstance, cloneInstance } from './schema/validate'

export {
  PALETTES,
  THEME_NAMES,
  DEFAULT_THEME_ID,
  resolveTheme,
  isThemeId,
  type Palette,
} from './theme/palettes'
export { FONT_STACK } from './theme/font'
export { toCssVars } from './theme/cssVars'
export { toVTableTheme } from './theme/vtableTheme'
export { cellInlineStyle } from './theme/inlineStyle'

export { applyEditIntent, isEmphasizable, getSlotDisplayText } from './store/intent'
export { canMerge, canSplit, findMergeAt } from './store/mergeGuard'
export {
  createEditorState,
  dispatch,
  undoOnce,
  markClean,
  replaceCurrent,
  canUndo,
} from './store/editorState'

export {
  toOption,
  measureContentSize,
  buildVisualRows,
  remapMerges,
  findSlotAtVisual,
  visualToLogicalRow,
  type CellMeta,
} from './adapter/toOption'

export { mount } from './render/coreHost'
export { exportHtml } from './export/html'
export { exportPng, measurePng } from './export/png'

export { listPresetTemplates, getPresetTemplate, COMPARE_ALPHA_V1, DETAIL_ALPHA_V1 } from './templates'
