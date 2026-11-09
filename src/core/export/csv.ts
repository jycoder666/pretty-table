import type { TemplateInstance } from '../types'
import { fail, ok, type Result } from '../errors'
import { buildExportModel, type ExportModel } from './model'

/**
 * CSV 导出（P4 · RFC 4180）：纯数据网格，不带主题样式、KPI 卡与 caption。
 * 与 renderExportText（TSV）同源遍历 ExportModel：合并格仅锚点格输出值、
 * 被 colspan/rowspan 覆盖的位置补空串，保证矩形网格（贴回表格软件列数不塌）。
 * 值含 , " \n \r → 整值双引号包裹、内部 " 加倍；行分隔 \r\n；
 * 返回文本以 \uFEFF BOM 开头（Excel 直开中文不乱码，下载侧直接落盘）。
 */

/** RFC 4180 单字段转义：含 , " \n \r 才加引号；内部双引号加倍 */
function csvField(v: string): string {
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

/** 把导出模型行（含合并跨度）展开成矩形网格；口径与 renderExportText 一致（含表头角标文本） */
function modelToGrid(model: ExportModel): string[][] {
  /** 列号 → 还需覆盖的行数（含当前行）；被 rowspan 覆盖的列在本行补空串 */
  const spans = new Map<number, number>()
  const grid: string[][] = []
  for (const row of [...model.headRows, ...model.bodyRows, ...model.footRows]) {
    const out: string[] = []
    let ci = 0
    const fillCovered = () => {
      while (spans.has(ci)) {
        out.push('')
        ci++
      }
    }
    for (const cell of row) {
      fillCovered()
      const cs = cell.colSpan ?? 1
      const rs = cell.rowSpan ?? 1
      out.push(`${cell.text}${cell.badge ?? ''}`)
      for (let k = 1; k < cs; k++) out.push('')
      if (rs > 1) for (let k = 0; k < cs; k++) spans.set(ci + k, rs)
      ci += cs
    }
    fillCovered()
    // 迭代中删/改自身键是 Map 的既有语义，无需先复制
    for (const [c, n] of spans) {
      if (n - 1 <= 0) spans.delete(c)
      else spans.set(c, n - 1)
    }
    grid.push(out)
  }
  return grid
}

/** CSV 导出：首行是表头（模型已区分 head/body/foot，按序拼接）；空表安全拒绝 */
export function exportCsv(inst: TemplateInstance): Result<string> {
  const m = buildExportModel(inst)
  if (!m.ok) return m
  const grid = modelToGrid(m.value)
  if (grid.length === 0) return fail('EXPORT_CSV_FAIL', '没有可导出的数据')
  const body = grid.map((row) => row.map(csvField).join(',')).join('\r\n')
  return ok('\uFEFF' + body)
}
