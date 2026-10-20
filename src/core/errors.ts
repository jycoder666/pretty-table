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
  | PasteErrorCode

export type WarnCode =
  | 'SLOT_UNKNOWN'
  | 'BLOCK_TYPE_REJECT'
  | 'THEME_MISSING'
  | 'UNKNOWN_FIELD'
  | 'MARK_UNKNOWN'
  | 'FORMAT_UNKNOWN'
  | 'PASTE_NOTICE_AS_TEXT'

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
