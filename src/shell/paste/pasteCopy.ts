import type { CoreError, CoreWarning } from '@/core'

/**
 * pasteCopy（交互 §1.3 S3～S13 白话文案，文案权威在 03-ux）：
 * 按errors 顺序把多条原因拼成一次提示（区块/合并/锁定在前、超出在后），
 * 不说「错误/非法/越界」，不露码；notices 追加在句尾。
 */

const BASE_COPY: Record<string, string> = {
  PASTE_NO_ANCHOR: '这个格子不能填写，请选一个可填写的格子作为起点',
  PASTE_EMPTY: '剪贴板里没有可用的表格文字。请在 Excel / WPS 里选中单元格复制后再粘贴',
  PASTE_PARSE_FAILED: '没能识别复制的内容，请从表格软件重新复制',
  PASTE_UNSUPPORTED: '这张模板暂不支持粘贴填充',
  PASTE_HITS_MERGED: '这块区域里有合并的格子，没法按格填入。请先拆分，或换个起点',
  PASTE_HITS_BLOCK: '这块区域跨过了分区色条，没法连着填。请分两次粘贴，或先移除色条',
  PASTE_HITS_LOCKED: '这块区域里有模板固定的格子（不能改），请换个起点',
  PASTE_STALE: '表格刚被改过，请重新粘贴',
  PASTE_COMMIT_FAILED: '粘贴失败，表格未改动',
}

function outOfRangeCopy(details: unknown): string {
  const d = (details ?? {}) as { extraRows?: number; extraCols?: number }
  const r = d.extraRows ?? 0
  const c = d.extraCols ?? 0
  if (r > 0 && c > 0) {
    return `放不下：多出 ${r} 行 ${c} 列。表格不会自动加行列，请少复制一些，或换个更靠左、更靠上的起点`
  }
  if (c > 0) {
    return `放不下：多出 ${c} 列。表格不会自动加列，请少复制 ${c} 列，或换个更靠左的起点`
  }
  return `放不下：多出 ${r} 行。表格不会自动加行，请少复制 ${r} 行，或换个更靠上的起点`
}

function errorCopy(err: CoreError): string {
  if (err.code === 'PASTE_OUT_OF_RANGE') return outOfRangeCopy(err.details)
  return BASE_COPY[err.code] ?? '这次粘贴没有成功，表格保持原样，请重试'
}

export function pasteCopy(errors: CoreError[], notices: CoreWarning[] = []): string {
  const parts = errors.map(errorCopy)
  let text = parts[0] ?? '这次粘贴没有成功，表格保持原样，请重试'
  if (parts.length > 1) text += '；另外' + parts.slice(1).join('；另外')
  for (const n of notices) {
    text += `；${n.message}`
  }
  return text
}
