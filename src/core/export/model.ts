import type { SlotValue, TemplateInstance } from '../types'
import { resolveTheme, type Palette } from '../theme/palettes'
import { cellInlineStyle } from '../theme/inlineStyle'
import { FONT_STACK } from '../theme/font'
import { MARK_LABEL } from '../format/formatTokens'
import { isImageDataUrl } from '../image/imageGuard'
import {
  buildVisualRows,
  remapMerges,
  typeMetrics,
  type CellMeta,
  type TypeMetrics,
} from '../adapter/toOption'
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
  /** R-3：图片格 data URL（经 isImageDataUrl 白名单校验后透传，src 不转义，GC-22） */
  image?: string
  /** R-3：图片格行高 px（与预览 rowHeights 同源；rowSpan 时为跨行高之和） */
  heightPx?: number
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

/** R-4 强调注脚（emphFooter）导出样式：纸底次要灰靠左小字，与预览 styleForCell 同源（零新增色值 GC-11） */
function emphFooterStyle(palette: Palette, metrics: TypeMetrics, tier?: number): string {
  return [
    `font-family:${FONT_STACK}`,
    `font-size:${metrics.fontSize + (tier === 2 ? 2 : 0)}px`,
    `padding:${metrics.padV}px ${metrics.padH}px`,
    `border:1px solid ${palette.border}`,
    `background:${palette.paper}`,
    `color:${palette.muted}`,
    'text-align:left',
    'font-weight:400',
  ].join(';')
}

/** footer 槽判定：footer 区块的整行固定进 tfoot（与预览表底位置强绑定，共享知识 §7.8） */
function isFooterSlot(inst: TemplateInstance, slotId: string): boolean {
  return inst.layout.blockSlots.find((s) => s.id === slotId)?.region === 'footer'
}

function cellStyle(
  cell: CellMeta,
  palette: Palette,
  zebraOn: boolean,
  ri: number,
  ci: number,
  recommendCol: number | null,
  metrics: TypeMetrics,
): string {
  const parts: string[] = [
    cellInlineStyle(
      palette,
      {
        role: inlineRole(cell),
        zebraRow: zebraOn && ri % 2 === 1,
        align: cell.align,
        emphasize: cell.emphasize,
      },
      metrics,
    ),
  ]
  // R-4 左栏标签：tag 底色（深浅 2 档），与预览 styleForCell 同源（追加在后覆盖 body 底色）
  if (cell.role === 'leftTag') {
    parts.push(`background:${cell.styleTier === 2 ? palette.zebra : palette.tag}`)
    parts.push(`color:${palette.tagText}`)
    parts.push('font-weight:600')
  }
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
    const metrics = typeMetrics(inst.layout.style)
    const headRows: ExportCell[][] = []
    const bodyRows: ExportCell[][] = []
    const footRows: ExportCell[][] = []
    const emittedBlockSlots = new Set<string>()

    const { metas, rowHeights, blockRowIndexes } = buildVisualRows(inst)
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

    metas.forEach((row, ri) => {
      if (blockRowIndexes.has(ri)) {
        // 区块行：整行一条（预览占位空槽导出为空串）
        const head = row[0]
        const slotId = blockRowIndexes.get(ri) ?? ''
        emittedBlockSlots.add(slotId)
        const cell: ExportCell = {
          text: head?.isPlaceholder ? '' : (head?.text ?? ''),
          tag: 'th',
          colSpan: colCount,
          style:
            head?.blockType === 'emphFooter'
              ? emphFooterStyle(palette, metrics, head?.styleTier)
              : cellInlineStyle(palette, { role: 'block' }, metrics),
        }
        // R-4：footer 区块行固定进 tfoot（与预览表底一致），不再双输出到 bodyRows
        if (isFooterSlot(inst, slotId)) footRows.push([cell])
        else bodyRows.push([cell])
        return
      }
      const inHeader = ri < headerLevels
      const cells: ExportCell[] = []
      row.forEach((cell, ci) => {
        if (skip.has(`${ri},${ci}`)) return
        const sp = span.get(`${ri},${ci}`)
        const firstCol = ci === 0
        const rowHeader =
          firstCol && (cell.role === 'label' || cell.role === 'readonly' || cell.role === 'leftTag')
        const tag: 'th' | 'td' = inHeader || rowHeader ? 'th' : 'td'
        // R-3：图片格只透传白名单内 data URL（GC-22，防御性兜底）；行高与预览 rowHeights 同源
        const image =
          !inHeader && cell.image !== undefined && isImageDataUrl(cell.image) ? cell.image : undefined
        const rs = sp && sp.rs > 1 ? sp.rs : 1
        const heightPx = image
          ? rowHeights.slice(ri, ri + rs).reduce((a, b) => a + b, 0)
          : undefined
        const style = cellStyle(cell, palette, effectiveZebra, ri, ci, recommendCol, metrics)
        cells.push({
          text: cell.isPlaceholder ? '' : cell.text,
          tag,
          scope: inHeader ? 'col' : tag === 'th' && !inHeader ? 'row' : undefined,
          rowSpan: sp && sp.rs > 1 ? sp.rs : undefined,
          colSpan: sp && sp.cs > 1 ? sp.cs : undefined,
          style: heightPx !== undefined ? `${style};height:${heightPx}px` : style,
          ariaLabel: cell.mark ? MARK_LABEL[cell.mark] : undefined,
          badge: cell.badge,
          image,
          heightPx,
        })
      })
      if (inHeader) headRows.push(cells)
      else bodyRows.push(cells)
    })

    // tfoot：footer 区块行已由 metas 路由进来；兜底收集无 rowHint 的遗留 emphFooter（口径收窄前的旧数据）
    for (const b of inst.blocks) {
      if (b.type === 'emphFooter' && !emittedBlockSlots.has(b.slotId)) {
        footRows.push([
          {
            text: String(b.props?.text ?? ''),
            tag: 'th',
            colSpan: colCount,
            style: emphFooterStyle(palette, metrics, typeof b.props?.styleTier === 'number' ? b.props.styleTier : undefined),
          },
        ])
      }
    }

    // min-width 按 colWidths 求和（自定义格式 §1.8）；未设列宽沿用窄屏默认（首列 96、其余 120）
    const minWidthPx = Array.from({ length: colCount }, (_, c) => {
      const w = inst.layout.style?.colWidths?.[c]
      return typeof w === 'number' ? w : c === 0 ? MIN_FIRST_COL_WIDTH : MIN_COL_WIDTH
    }).reduce((a, b) => a + b, 0)

    return ok({
      caption: captionText(inst),
      headRows,
      bodyRows,
      footRows,
      frozenColCount: inst.layout.frozenColCount ?? 0,
      minWidthPx,
    })
  } catch (e) {
    return fail('EXPORT_HTML_FAIL', e instanceof Error ? e.message : '导出模型构建失败')
  }
}

/** 渲染 ExportModel → 全内联样式 HTML 片段（无 <style>/<script>/外链/事件属性） */
export function renderExportHtml(model: ExportModel): string {
  // 属性值单点转义（GC-22）：复用 escapeHtml，把 FONT_STACK 等值里的 `"` 转成 &quot;，
  // 避免浏览器在第一个 `"` 处截断 style 属性致全部内联样式丢失（TC-088）。
  // 不在此处理 <img src>：它由 isImageDataUrl 白名单前置闸门（GC-22），data URI 本身不转义。
  const attr = (v: string): string => escapeHtml(v)
  const cellHtml = (cell: ExportCell): string => {
    const attrs = [`style="${attr(cell.style)}"`]
    // scope 为内部枚举、rowspan/colspan 为内部数字，理论不含危险字符；
    // 仍统一过 attr 兜底（防止未来类型漂移引入用户数据），成本可忽略
    if (cell.scope) attrs.push(`scope="${attr(cell.scope)}"`)
    if (cell.rowSpan !== undefined) attrs.push(`rowspan="${attr(String(cell.rowSpan))}"`)
    if (cell.colSpan !== undefined) attrs.push(`colspan="${attr(String(cell.colSpan))}"`)
    if (cell.ariaLabel) attrs.push(`aria-label="${attr(cell.ariaLabel)}"`)
    const badge = cell.badge ? `<span style="font-size:11px">${escapeHtml(cell.badge)}</span>` : ''
    // GC-22：src 只可能来自 isImageDataUrl 白名单校验通过的值（buildExportModel 已闸），
    // 白名单正则保证无引号/无标签注入，data URI 本身不转义
    const inner = cell.image
      ? `<img src="${cell.image}" alt="" style="display:block;width:100%;height:100%;object-fit:cover">`
      : `${escapeHtml(cell.text)}${badge}`
    return `<${cell.tag} ${attrs.join(' ')}>${inner}</${cell.tag}>`
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
