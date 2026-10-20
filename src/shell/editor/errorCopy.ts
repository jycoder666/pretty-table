import type { ErrorCode } from '@/core'

const MAP: Partial<Record<ErrorCode, string>> = {
  TEMPLATE_INVALID: '表格渲染失败，请重选模板',
  THEME_MISSING: '主题不存在，已用默认',
  SLOT_UNKNOWN: '未知槽位',
  SLOT_MISS: '请放到表内虚线槽位',
  BLOCK_TYPE_REJECT: '这里不能放这个区块',
  BLOCK_SLOT_OCCUPIED: '该位置已有区块，请先删除或换空槽',
  MERGE_NOT_ALLOWED: '此处不能合并，请在模板允许区内选择',
  MERGE_STRUCTURAL: '此处由模板锁定，不能拆分',
  EXPORT_HTML_FAIL: '复制失败，请重试',
  EXPORT_PNG_FAIL: '导出失败，请重试',
  EXPORT_BLOCKED_RENDERING: '请等待表格渲染完成',
  EXPORT_PNG_TOO_LARGE: '图片太大，请改用更低倍率',
  TEMPLATE_LIST_FAIL: '我的模板加载失败，请重试',
  TEMPLATE_SAVE_FAIL: '保存失败，请重试',
  DRAFT_RESTORE_FAIL: '上次的编辑没能恢复',
  DRAFT_SAVE_FAIL: '自动保存失败，刷新后可能无法恢复',
}

export function errorCopy(code: ErrorCode, fallback?: string): string {
  return MAP[code] ?? fallback ?? '操作失败，请重试'
}
