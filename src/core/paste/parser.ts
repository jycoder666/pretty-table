import Papa from 'papaparse'
import { fail, ok, type Result } from '../errors'

/** 粘贴剪贴板解析（设计增量 §2.1 步 2～3）：TSV 优先，text/plain 为空才取 text/html 第一个 table */

export interface PasteCell {
  r: number
  c: number
  raw: string
  kind: 'value' | 'empty'
}

export interface PasteGrid {
  h: number
  w: number
  cells: PasteCell[]
}

const MAX_BYTES = 64 * 1024

/** 只读第一个 <table> 的 textContent（绝不把 HTML 插进页面或 store） */
function textFromHtml(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const table = doc.querySelector('table')
    if (!table) return ''
    const lines: string[] = []
    for (const tr of Array.from(table.querySelectorAll('tr'))) {
      const cells = Array.from(tr.querySelectorAll('th,td')).map((c) =>
        (c.textContent ?? '').trim(),
      )
      lines.push(cells.join('\t'))
    }
    return lines.join('\n')
  } catch {
    return ''
  }
}

/**
 * 解析剪贴板文本：
 * - delimiter 固定 \t（逗号不拆列，Excel/WPS 复制即 TSV）
 * - 支持引号包裹的格内换行/制表符（PapaParse 内建）
 * - 去掉末尾空行空列；短行不补齐（缺格不产出）；源中明确空格 → kind:'empty'
 * - 单格去首尾空白
 */
export function parsePaste(data: { text?: string; html?: string }): Result<PasteGrid> {
  let text = typeof data.text === 'string' ? data.text : ''
  if (text.trim() === '' && typeof data.html === 'string' && data.html.trim() !== '') {
    text = textFromHtml(data.html)
  }
  if (text.trim() === '') {
    return fail('PASTE_EMPTY', '剪贴板里没有可用的表格文字')
  }
  if (new TextEncoder().encode(text).length > MAX_BYTES) {
    return fail('PASTE_PARSE_FAILED', '没能识别复制的内容，请从表格软件重新复制', {
      reason: 'too-large',
    })
  }

  const parsed = Papa.parse(text, { delimiter: '\t' })
  if (parsed.errors.length > 0) {
    return fail('PASTE_PARSE_FAILED', '没能识别复制的内容，请从表格软件重新复制', {
      reason: parsed.errors[0]?.message ?? 'parse-error',
    })
  }
  const rawRows = (parsed.data as unknown[]).filter(
    (r): r is string[] => Array.isArray(r),
  )
  const rows = rawRows.map((r) => r.map((c: unknown) => String(c ?? '')))

  while (rows.length > 0 && rows[rows.length - 1]!.every((c) => c.trim() === '')) rows.pop()
  if (rows.length === 0) {
    return fail('PASTE_PARSE_FAILED', '没能识别复制的内容，请从表格软件重新复制', {
      reason: 'empty',
    })
  }

  let w = Math.max(...rows.map((r) => r.length))
  while (w > 0 && rows.every((r) => (r[w - 1] ?? '').trim() === '')) w -= 1
  if (w === 0) {
    return fail('PASTE_PARSE_FAILED', '没能识别复制的内容，请从表格软件重新复制', {
      reason: 'empty',
    })
  }

  const cells: PasteCell[] = []
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!
    for (let c = 0; c < w; c++) {
      if (c >= row.length) continue // 短行缺格不产出（交互 S8）
      const raw = row[c]!.trim()
      cells.push({ r, c, raw, kind: raw === '' ? 'empty' : 'value' })
    }
  }
  return ok({ h: rows.length, w, cells })
}
