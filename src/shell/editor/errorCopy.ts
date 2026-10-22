import type { ErrorCode, WarnCode } from '@/core'

const MAP: Partial<Record<ErrorCode, string>> = {
  TEMPLATE_INVALID: '表格渲染失败，请重选模板',
  THEME_MISSING: '主题不存在，已用默认',
  SLOT_UNKNOWN: '未知槽位',
  SLOT_MISS: '请放到表内虚线槽位',
  BLOCK_TYPE_REJECT: '这里不能放这个区块',
  BLOCK_SLOT_OCCUPIED: '该位置已有区块，请先删除或换空槽',
  // WP1：闸门口径对齐（allowedMerges 早已降级为兼容字段，不再有「模板允许区」这一说）
  MERGE_NOT_ALLOWED: '这里不能合并：单格无需合并、已经是合并区，或含模板固定的格子',
  MERGE_STRUCTURAL: '这一块由模板固定，不能合并也不能拆分',
  MERGE_CONFLICT: '和已有的合并区叠不上，请先拆开再合并',
  LIMIT_ROWS: '最多 20 行，加不下了',
  LIMIT_COLS: '最多 12 列',
  // WP4：行列换位被结构约束挡住（核内已给具体原因，这里兜底一句白话）
  STRUCT_MOVE_BLOCKED: '这一行/列现在挪不动，请先处理合并区或表头',
  EXPORT_HTML_FAIL: '复制失败，请重试',
  EXPORT_PNG_FAIL: '导出失败，请重试',
  EXPORT_BLOCKED_RENDERING: '请等待表格渲染完成',
  EXPORT_PNG_TOO_LARGE: '图片太大，请改用更低倍率',
  EXPORT_PNG_IMAGE_MISSING: '图片资源未能加载，请重新上传后再导出',
  EXPORT_PNG_EMPTY: '表格渲染尚未完成，请稍后重试',
  TEMPLATE_LIST_FAIL: '我的模板加载失败，请重试',
  TEMPLATE_SAVE_FAIL: '保存失败，请重试',
  TEMPLATE_DELETE_FAIL: '删除失败，请重试',
  DRAFT_RESTORE_FAIL: '上次的编辑没能恢复',
  DRAFT_SAVE_FAIL: '自动保存失败，刷新后可能无法恢复',
  // R-3 图片（GC-25：码不外露，白话文案）
  IMAGE_TOO_LARGE: '图片太大，请换一张 2MB 以内的',
  IMAGE_BUDGET_EXCEEDED: '图片数量或总大小到上限了，先删几张再试',
  IMAGE_FORMAT_UNSUPPORTED: '只支持 PNG / JPG / WebP / GIF 图片',
  IMAGE_NOT_ALLOWED: '这个格子不能放图片',
  IMAGE_DECODE_FAIL: '图片读不出来，请换一张试试',
}

/** 结构/导入类 warn（STRUCT_LOSS / UNKNOWN_FIELD 等）的聚合白话文案（T04） */
const WARN_MAP: Partial<Record<WarnCode, string>> = {
  STRUCT_LOSS: '部分合并或内容因结构变化被删掉',
  UNKNOWN_FIELD: '部分不支持的字段已被忽略',
  TOKEN_INVALID: '个别颜色值格式不对，已按预设处理',
  THEME_MISSING: '主题不存在，已用默认',
  IMAGE_INVALID: '有一张图片读不出来，已清空该格',
}

export function errorCopy(code: ErrorCode, fallback?: string): string {
  return MAP[code] ?? fallback ?? '操作失败，请重试'
}

export function warnCopy(code: WarnCode): string {
  return WARN_MAP[code] ?? '部分内容已按默认处理'
}
