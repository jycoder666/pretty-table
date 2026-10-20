import type { SlotValue, TemplateInstance } from '../types'
import { resolveTheme, type Palette } from '../theme/palettes'
import { cellInlineStyle } from '../theme/inlineStyle'
import { MARK_LABEL } from '../format/formatTokens'
import { buildVisualRows, remapMerges, type CellMeta } from '../adapter/toOption'
import { fail, ok, type Result } from '../errors'

/**
 * HTML 导出模型（T28 · FR-25/26）：先构建与渲染解耦的结构，
 * 再渲染成全部内联样式、无 <style>/<script>/外链 的语义化表格。
 */

/** 窄屏横滚最小列宽（设计增量 §5.3）：首列 96px，其余 120px */
const MIN_COL_WIDTH = 120
const MIN_FIRST_COL_WIDTH = 96

export interface ExportCell {
  text: string
  tag: 'th' | 'td'
  scope?: 'col' | 'row'
  rowSpan?: number
  colSpan?: number
  style: string
  /** 三态符号格的语义说明（支持/不支持/部分支持） */
  ariaLabel?: string
  /** 表头角标文本（如「推荐」），渲染为 <span> */
  badge?: string
}

export interface ExportModel {
  caption?: string
  headRows: ExportCell[][]
  bodyRows: ExportCell[][]
  footRows: ExportCell[][]
  frozenColCount: number
  minWidthPx: number
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** caption 取值：captionSlot 文本槽优先，否则 displayName */
function captionText(inst: TemplateInstance): string {
  const sid = inst.layout.captionSlot
  if (sid) {
    const v: SlotValue | undefined = inst.slots[sid]
    if (typeof v === 'string') return v
    if (typeof v === 'number') return String(v)
    if (v && typeof v === 'object' && 'text' in v) return String(v.text ?? '')
    return ''
  }
  return inst.meta?.displayName ?? '表格'
}

function inlineRole(cell: CellMeta): 'header' | 'body' | 'label' | 'block' {
  if (cell.role === 'block') return 'block'
  if (cell.role === 'header') return 'header'
  if (cell.role === 'label' || cell.role === 'readonly') return 'label'
  return 'body'
}

function cellStyle(
  cell: CellMeta,
  palette: Palette,
  zebraOn: boolean,
  ri: number,
  ci: number,
  recommendCol: number | null,
): string {
  const parts: string[] = [
    cellInlineStyle(palette, {
      role: inlineRole(cell),
      zebraRow: zebraOn && ri % 2 === 1,
      align: cell.align,
      emphasize: cell.emphasize,
    }),
  ]
  // 推荐列内联描边（FR-23）：列内单元格加粗主色描边
  if (recommendCol !== null && ci === recommendCol) {
    parts.push(`border:2px solid ${palette.primary}`)
  }
  // 窄屏首列 sticky（FR-26）：首列固定，其余横滚
  if (ci === 0) parts.push('position:sticky;left:0')
  return parts.join(';')
}

/**
 * 由模板实例构建导出模型：
 * - 表头行（headerLevels）→ headRows，th scope=col
 * - 表体行首列标签/只读格 → th scope=row；区块行 → 整行 th colspan
 * - emphFooter 区块 → footRows（整行 th colspan）
 * - 空槽/占位 → 空串（GC-23，不泄占位文案）
 */
export function buildExportModel(inst: TemplateInstance): Result<ExportModel> {
  try {
    const { palette, zebraOn } = resolveTheme(inst.themeId, inst.themeTokens)
    const effectiveZebra = inst.zebraOn === false ? false : zebraOn
    const colCount = inst.layout.colCount
    const headerLevels = inst.layout.headerLevels ?? 1
    const recommendCol = inst.highlight?.recommendCol ?? null
    const { metas, blockRowIndexes } = buildVisualRows(inst)
    const merges = remapMerges(inst, blockRowIndexes)

    const span = new Map<string, { rs: number; cs: number }>()
    const skip = new Set<string>()
    for (const m of merges) {
      span.set(`${m.start[0]},${m.start[1]}`, {
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

    const headRows: ExportCell[][] = []
    const bodyRows: ExportCell[][] = []

    metas.forEach((row, ri) => {
      if (blockRowIndexes.has(ri)) {
        // 区块行：整行一条（预览占位空槽导出为空串）
        const head = row[0]
        bodyRows.push([
          {
            text: head?.isPlaceholder ? '' : (head?.text ?? ''),
            tag: 'th',
            colSpan: colCount,
            style: cellInlineStyle(palette, { role: 'block' }),
          },
        ])
        return
      }
      const inHeader = ri < headerLevels
      const cells: ExportCell[] = []
      row.forEach((cell, ci) => {
        if (skip.has(`${ri},${ci}`)) return
        const sp = span.get(`${ri},${ci}`)
        const firstCol = ci === 0
        const rowHeader = firstCol && (cell.role === 'label' || cell.role === 'readonly')
        const tag: 'th' | 'td' = inHeader || rowHeader ? 'th' : 'td'
        cells.push({
          text: cell.isPlaceholder ? '' : cell.text,
          tag,
          scope: inHeader ? 'col' : tag === 'th' && !inHeader ? 'row' : undefined,
          rowSpan: sp && sp.rs > 1 ? sp.rs : undefined,
          colSpan: sp && sp.cs > 1 ? sp.cs : undefined,
          style: cellStyle(cell, palette, effectiveZebra, ri, ci, recommendCol),
          ariaLabel: cell.mark ? MARK_LABEL[cell.mark] : undefined,
          badge: cell.badge,
        })
      })
      if (inHeader) headRows.push(cells)
      else bodyRows.push(cells)
    })

    // tfoot：emphFooter 区块（预览表体不含注脚，导出补足语义）
    const footRows: ExportCell[][] = inst.blocks
      .filter((b) => b.type === 'emphFooter')
      .map((b) => [
        {
          text: String(b.props?.text ?? ''),
          tag: 'th',
          colSpan: colCount,
          style: cellInlineStyle(palette, { role: 'block' }),
        },
      ])

    return ok({
      caption: captionText(inst),
      headRows,
      bodyRows,
      footRows,
      frozenColCount: inst.layout.frozenColCount ?? 0,
      minWidthPx: MIN_FIRST_COL_WIDTH + Math.max(0, colCount - 1) * MIN_COL_WIDTH,
    })
  } catch (e) {
    return fail('EXPORT_HTML_FAIL', e instanceof Error ? e.message : '导出模型构建失败')
  }
}

/** 渲染 ExportModel → 全内联样式 HTML 片段（无 <style>/<script>/外链/事件属性） */
export function renderExportHtml(model: ExportModel): string {
  const cellHtml = (cell: ExportCell): string => {
    const attrs = [`style="${cell.style}"`]
    if (cell.scope) attrs.push(`scope="${cell.scope}"`)
    if (cell.rowSpan !== undefined) attrs.push(`rowspan="${cell.rowSpan}"`)
    if (cell.colSpan !== undefined) attrs.push(`colspan="${cell.colSpan}"`)
    if (cell.ariaLabel) attrs.push(`aria-label="${escapeHtml(cell.ariaLabel)}"`)
    const badge = cell.badge ? `<span style="font-size:11px">${escapeHtml(cell.badge)}</span>` : ''
    return `<${cell.tag} ${attrs.join(' ')}>${escapeHtml(cell.text)}${badge}</${cell.tag}>`
  }
  const rowHtml = (row: ExportCell[]): string => `<tr>${row.map(cellHtml).join('')}</tr>`
  const thead = model.headRows.length ? `<thead>${model.headRows.map(rowHtml).join('')}</thead>` : ''
  const tbody = `<tbody>${model.bodyRows.map(rowHtml).join('')}</tbody>`
  const tfoot = model.footRows.length ? `<tfoot>${model.footRows.map(rowHtml).join('')}</tfoot>` : ''
  const caption = model.caption
    ? `<caption style="caption-side:top;text-align:left;padding:6px 0;font-weight:600">${escapeHtml(model.caption)}</caption>`
    : ''
  const table = `<table style="border-collapse:collapse;width:100%;max-width:100%;min-width:${model.minWidthPx}px">${caption}${thead}${tbody}${tfoot}</table>`
  // 窄屏（FR-26）：外包横滚容器 + table min-width，页面不撑破；编辑器剥掉 sticky/overflow 时优雅降级
  return `<div style="max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch">${table}</div>`
}

export { escapeHtml }
