import type { TemplateInstance } from '../types'
import { fail, ok, type Result } from '../errors'
import { buildExportModel, renderExportHtml } from './model'

/**
 * HTML 导出（T28 · FR-25/26）：先建 ExportModel，再渲染语义化表格。
 * 结构 = 横滚容器 → table（caption/thead/tbody/tfoot，th scope，rowspan/colspan），
 * 样式全内联，不输出 <style>/<script>/外链；文案全部转义（FR-05）。
 */
export function exportHtml(inst: TemplateInstance): Result<string> {
  const m = buildExportModel(inst)
  if (!m.ok) return fail('EXPORT_HTML_FAIL', m.error.message)
  try {
    return ok(renderExportHtml(m.value))
  } catch (e) {
    return fail('EXPORT_HTML_FAIL', e instanceof Error ? e.message : '导出 HTML 失败')
  }
}
