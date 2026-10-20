import type { TemplateInstance } from '../types'
import { resolveTheme } from '../theme/palettes'
import { cellInlineStyle } from '../theme/inlineStyle'
import { FONT_STACK } from '../theme/font'
import { fail, ok, type Result } from '../errors'
import { buildVisualRows, remapMerges, type CellMeta } from '../adapter/toOption'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function exportHtml(inst: TemplateInstance): Result<string> {
  try {
    const { palette, zebraOn } = resolveTheme(inst.themeId, inst.themeTokens)
    const effectiveZebra = inst.zebraOn === false ? false : zebraOn
    const { metas, blockRowIndexes } = buildVisualRows(inst)
    const merges = remapMerges(inst, blockRowIndexes)
    const skip = new Set<string>()
    const span = new Map<string, { rs: number; cs: number }>()
    for (const m of merges) {
      const key = `${m.start[0]},${m.start[1]}`
      span.set(key, {
        rs: m.end[0] - m.start[0] + 1,
        cs: m.end[1] - m.start[1] + 1,
      })
      for (let r = m.start[0]; r <= m.end[0]; r++) {
        for (let c = m.start[1]; c <= m.end[1]; c++) {
          if (r === m.start[0] && c === m.start[1]) continue
          skip.add(`${r},${c}`)
        }
      }
    }

    const caption = escapeHtml(inst.meta?.displayName ?? '表格')
    const rowsHtml = metas
      .map((row, ri) => {
        const cells = row
          .map((cell, ci) => {
            if (skip.has(`${ri},${ci}`)) return ''
            const tag = cell.role === 'header' ? 'th' : 'td'
            const style = styleOf(cell, palette, effectiveZebra, ri)
            const sp = span.get(`${ri},${ci}`)
            const rs = sp && sp.rs > 1 ? ` rowspan="${sp.rs}"` : ''
            const cs = sp && sp.cs > 1 ? ` colspan="${sp.cs}"` : ''
            const text = cell.isPlaceholder ? '' : cell.text
            return `<${tag} style="${style}"${rs}${cs}>${escapeHtml(text)}</${tag}>`
          })
          .join('')
        return `<tr>${cells}</tr>`
      })
      .join('')

    const html = `<table class="pt-table" style="border-collapse:collapse;font-family:${FONT_STACK};background:${palette.paper};width:100%;max-width:100%"><caption style="caption-side:top;text-align:left;padding:6px 0;font-weight:600">${caption}</caption><tbody>${rowsHtml}</tbody></table>`
    return ok(html)
  } catch (e) {
    return fail('EXPORT_HTML_FAIL', e instanceof Error ? e.message : '导出 HTML 失败')
  }
}

function styleOf(
  cell: CellMeta,
  palette: ReturnType<typeof resolveTheme>['palette'],
  zebraOn: boolean,
  ri: number,
): string {
  return cellInlineStyle(palette, {
    role:
      cell.role === 'readonly'
        ? 'label'
        : cell.role === 'block'
          ? 'block'
          : cell.role === 'header'
            ? 'header'
            : cell.role === 'label'
              ? 'label'
              : 'body',
    zebraRow: zebraOn && ri % 2 === 1,
    align: cell.align,
    emphasize: cell.emphasize,
  })
}
