export type PasteErrorCode =
  | 'PASTE_NO_ANCHOR'
  | 'PASTE_EMPTY'
  | 'PASTE_PARSE_FAILED'
  | 'PASTE_UNSUPPORTED'
  | 'PASTE_HITS_MERGED'
  | 'PASTE_HITS_BLOCK'
  | 'PASTE_HITS_LOCKED'
  | 'PASTE_OUT_OF_RANGE'
  | 'PASTE_STALE'
  | 'PASTE_COMMIT_FAILED'

export type ErrorCode =
  | 'TEMPLATE_INVALID'
  | 'THEME_MISSING'
  | 'SLOT_UNKNOWN'
  | 'SLOT_MISS'
  | 'BLOCK_TYPE_REJECT'
  | 'BLOCK_SLOT_OCCUPIED'
  | 'BLOCK_NOT_FOUND'
  | 'MERGE_NOT_ALLOWED'
  | 'MERGE_STRUCTURAL'
  | 'MERGE_CONFLICT'
  | 'LIMIT_ROWS'
  | 'LIMIT_COLS'
  | 'SLOT_DROP_BLOCKED'
  | 'RENDER_FAIL'
  | 'EXPORT_HTML_FAIL'
  | 'EXPORT_PNG_FAIL'
  | 'EXPORT_BLOCKED_RENDERING'
  |   'TEMPLATE_LIST_FAIL'
  | 'TEMPLATE_SAVE_FAIL'
  | 'TEMPLATE_DELETE_FAIL'
  | 'DRAFT_RESTORE_FAIL'
  | 'DRAFT_SAVE_FAIL'
  | 'EXPORT_PNG_TOO_LARGE'
  // P1（缺陷 2）：导出期图片资源预加载失败 → 显式报错不静默（用户只见白话，GC-25）
  | 'EXPORT_PNG_IMAGE_MISSING'
  // 交互升级 R-3：图片填充（错误码表见设计增量 §3；用户只见白话，code 不外露 GC-25）
  | 'IMAGE_TOO_LARGE'
  | 'IMAGE_BUDGET_EXCEEDED'
  | 'IMAGE_FORMAT_UNSUPPORTED'
  | 'IMAGE_NOT_ALLOWED'
  | 'IMAGE_DECODE_FAIL'
  | PasteErrorCode

export type WarnCode =
  | 'SLOT_UNKNOWN'
  | 'BLOCK_TYPE_REJECT'
  | 'THEME_MISSING'
  | 'UNKNOWN_FIELD'
  | 'MARK_UNKNOWN'
  | 'FORMAT_UNKNOWN'
  | 'PASTE_NOTICE_AS_TEXT'
  | 'TOKEN_INVALID'
  | 'STRUCT_LOSS'
  // 交互升级 R-3：存档数据里图片内容损坏（读时清洗，清除该图）
  | 'IMAGE_INVALID'

export interface CoreError {
  code: ErrorCode
  message: string
  details?: unknown
}

export interface CoreWarning {
  code: WarnCode
  message: string
  details?: unknown
}

export type Result<T> =
  | { ok: true; value: T; warnings?: CoreWarning[] }
  | { ok: false; error: CoreError }

export function ok<T>(value: T, warnings?: CoreWarning[]): Result<T> {
  return warnings?.length ? { ok: true, value, warnings } : { ok: true, value }
}

export function fail<T = never>(code: ErrorCode, message: string, details?: unknown): Result<T> {
  return { ok: false, error: { code, message, details } }
}
