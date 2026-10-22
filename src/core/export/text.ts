import type { TemplateInstance } from '../types'
import { fail, ok, type Result } from '../errors'
import { buildExportModel, renderExportText } from './model'

/**
 * 纯文本导出（T28 · 设计增量 §5.2 剪贴板行）：与 HTML 同源 ExportModel → TSV。
 * 复制时作为 text/plain 风味写入，富文本编辑器优先取 text/html，表格软件取 TSV。
 * 错误码沿用 EXPORT_HTML_FAIL（契约 §4.1：序列化/剪贴板失败，文案「复制失败，请重试」）。
 */
export function exportText(inst: TemplateInstance): Result<string> {
  const m = buildExportModel(inst)
  if (!m.ok) return fail('EXPORT_HTML_FAIL', m.error.message)
  try {
    return ok(renderExportText(m.value))
  } catch (e) {
    return fail('EXPORT_HTML_FAIL', e instanceof Error ? e.message : '导出文本失败')
  }
}
