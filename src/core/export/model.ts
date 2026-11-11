import type { SlotValue, TemplateInstance, PosterSpec } from '../types'
import { resolveTheme, readableTextColor, type Palette } from '../theme/palettes'
import { cellInlineStyle } from '../theme/inlineStyle'
import { FONT_STACK } from '../theme/font'
import { DECO_CARD_INK, DECO_CELLS_TODAY, DECO_STAR, DECO_STAR_EMPTY, DECO_WIN_GOLD } from '../theme/decoDefaults'
import {
  posterWrapStyle,
  posterHeaderStyles,
  posterFooterStyles,
  posterChipsWrapStyle,
  posterChipStyle,
  posterLegendStyle,
} from '../theme/posterStyle'
import { MARK_LABEL } from '../format/formatTokens'
import { isImageDataUrl } from '../image/imageGuard'
import { effectiveKpiCards, renderKpiHeroHtml } from '../kpi/kpiCards'
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
  /** Schema 1.2 扩展：横条格式（color 已解析：自定义 hex 或主题 primary） */
  bar?: { ratio: number; color: string }
  /** Schema 1.3：副行小字 */
  sub?: string
  /** Schema 1.3：星级 0-5 */
  stars?: number
  /** Schema 1.3：状态圆点色（已解析：自定义 hex 或主题 emphasis） */
  dotColor?: string
  /** Schema 1.3：时间轴节点（first/last 裁剪贯穿线） */
  node?: { first?: boolean; last?: boolean; color: string }
  /** Schema 1.3：点线引导（点色 = 主题 border） */
  leader?: boolean
  /** Schema 1.3：甘特条（color 已解析） */
  gantt?: { from: number; to: number; color: string; milestone: boolean }
  /** Schema 1.3：banner 区块右侧强调文本 */
  bannerRight?: string
  /** Schema 1.3：装饰辅助色（构建期从 palette 解析：node/leader 点线色、sub 副行色） */
  lineColor?: string
  subColor?: string
  /** Schema 1.3：单位小字（同行跟在主值后） */
  unit?: string
  /** Schema 1.5：对阵卡（HTML 近似：上下两行小卡） */
  match?: { a: string; sa: string; b: string; sb: string; winA?: boolean; winB?: boolean }
  /** Schema 1.5：冠军卡 */
  champion?: { title?: string; name: string; note?: string }
  /** Schema 1.5：打卡矩阵（0/1 串 + 今天下标） */
  cells?: { pattern: string; today?: number }
}

export interface ExportModel {
  caption?: string
  /** Schema 1.2 扩展：表外 KPI 统计卡（已渲染好的 hero HTML；无卡片 = 缺省零占位） */
  kpiHeroHtml?: string
  headRows: ExportCell[][]
  bodyRows: ExportCell[][]
  footRows: ExportCell[][]
  frozenColCount: number
  minWidthPx: number
  /** Schema 1.3：海报层（wrapStyle 容器内联样式 + 已渲染 header/footer HTML；缺省 = 无海报层） */
  poster?: { wrapStyle: string; headerHtml: string; footerHtml: string }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** caption 取值：captionSlot 文本槽优先，否则 displayName（壳层表名编辑框同源单点） */
export function captionText(inst: TemplateInstance): string {
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

function inlineRole(cell: CellMeta, plainHeader: boolean): 'header' | 'headerPlain' | 'body' | 'label' | 'block' {
  if (cell.role === 'block') return 'block'
  if (cell.role === 'header') return plainHeader ? 'headerPlain' : 'header'
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
  borderScheme: 'full' | 'rows' | 'cols' | 'none',
  plainHeader: boolean,
): string {
  const parts: string[] = [
    cellInlineStyle(
      palette,
      {
        role: inlineRole(cell, plainHeader),
        zebraRow: zebraOn && ri % 2 === 1,
        align: cell.align,
        emphasize: cell.emphasize,
      },
      metrics,
    ),
  ]
  // Schema 1.3：边框方案（rows 仅横线 / cols 仅竖线 / none 无框；宽度覆写在基础 border 之后）
  if (borderScheme === 'rows') parts.push('border-width:1px 0')
  else if (borderScheme === 'cols') parts.push('border-width:0 1px')
  else if (borderScheme === 'none') parts.push('border-width:0')
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
  // Schema 1.3：逐格底色 / 文字色 / 字号倍率（作者意图优先级最高）
  if (cell.bg) parts.push(`background:${cell.bg}`)
  if (cell.color) parts.push(`color:${cell.color}`)
  if (cell.cellScale && cell.cellScale !== 1) {
    parts.push(`font-size:${Math.round(metrics.fontSize * cell.cellScale)}px`)
  }
  // Schema 1.3：描边盒（无框方案下的独立描边格）
  if (cell.boxed) parts.push(`border:1px solid ${palette.border}`)
  // 窄屏首列 sticky（FR-26）：首列固定，其余横滚
  if (ci === 0) parts.push('position:sticky;left:0')
  return parts.join(';')
}

/** Schema 1.3：banner 区块行样式（柔色底 + 左强调竖条；主/右文本由 cellHtml flex 排布） */
function bannerStyle(
  cell: CellMeta,
  palette: Palette,
  metrics: TypeMetrics,
): string {
  return [
    `font-family:${metrics.fontFamily}`,
    `font-size:${metrics.fontSize}px`,
    `padding:${metrics.padV}px ${metrics.padH}px`,
    `background:${cell.blockColor ?? palette.zebra}`,
    `border-left:4px solid ${palette.emphasis}`,
    `color:${palette.primary}`,
    'text-align:left',
    'font-weight:600',
  ].join(';')
}

/** Schema 1.3：海报标题区 HTML（posterHeaderStyles 同源） */
function posterHeaderHtml(poster: PosterSpec, palette: Palette): string {
  const has =
    poster.kicker ||
    poster.title ||
    poster.subtitle ||
    poster.metaLines?.length ||
    poster.chips?.length ||
    poster.legend
  if (!has) return ''
  const s = posterHeaderStyles(poster, palette)
  const left = [
    poster.kicker ? `<p style="${escapeHtml(s.kicker)}">${escapeHtml(poster.kicker)}</p>` : '',
    poster.title ? `<h1 style="${escapeHtml(s.title)}">${escapeHtml(poster.title)}</h1>` : '',
    poster.subtitle
      ? `<p style="${escapeHtml(s.subtitle)}">${escapeHtml(poster.subtitle)}</p>`
      : '',
  ].join('')
  // Schema 1.5：chips（第 0 个黑底白字）/ legend 图例行
  const chips = poster.chips?.length
    ? `<div style="${escapeHtml(posterChipsWrapStyle(palette))}">${poster.chips
        .map((chip, i) => `<span style="${escapeHtml(posterChipStyle(palette, i))}">${escapeHtml(chip)}</span>`)
        .join('')}</div>`
    : ''
  const legend = poster.legend
    ? `<p style="${escapeHtml(posterLegendStyle(palette))}">${escapeHtml(poster.legend)}</p>`
    : ''
  const right = poster.metaLines?.length
    ? `<div style="${escapeHtml(s.meta)}">${poster.metaLines.map(escapeHtml).join('<br>')}</div>`
    : ''
  return `<div style="${escapeHtml(s.wrap)}"><div>${left}${chips}${legend}</div>${right}</div>`
}

/** Schema 1.3：海报注脚区 HTML */
function posterFooterHtml(poster: PosterSpec, palette: Palette): string {
  const has = poster.footerLines?.length || poster.pageBadge
  if (!has) return ''
  const s = posterFooterStyles(poster, palette)
  const lines = poster.footerLines?.length
    ? `<div style="${escapeHtml(s.line)}">${poster.footerLines.map(escapeHtml).join('<br>')}</div>`
    : '<div></div>'
  const badge = poster.pageBadge
    ? `<div style="${escapeHtml(s.badge)}">${escapeHtml(poster.pageBadge)}</div>`
    : '<div></div>'
  return `<div style="${escapeHtml(s.wrap)}">${lines}${badge}</div>`
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
    const borderScheme = inst.layout.style?.borderScheme ?? 'full'
    const plainHeader = inst.layout.style?.plainHeader === true
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
        // 区块级底色（sectionBar / groupHeader）：追加覆盖主色；文字色按亮度自动黑白（与预览同源）
        const blockColorOverride =
          head && head.blockType !== 'emphFooter' && head.blockType !== 'banner' && head.blockColor
            ? `background:${head.blockColor};color:${readableTextColor(head.blockColor)}`
            : ''
        const cell: ExportCell = {
          text: head?.isPlaceholder ? '' : (head?.text ?? ''),
          tag: 'th',
          colSpan: colCount,
          bannerRight: head?.bannerRight,
          style:
            head?.blockType === 'emphFooter'
              ? emphFooterStyle(palette, metrics, head?.styleTier)
              : head?.blockType === 'banner'
                ? bannerStyle(head, palette, metrics)
                : [
                    cellInlineStyle(palette, { role: 'block' }, metrics),
                    blockColorOverride,
                  ]
                    .filter(Boolean)
                    .join(';'),
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
        // Schema 1.2 扩展：横条格式（表体数据格；条色 = 自定义 hex 或主题 primary）
        const bar =
          !inHeader && cell.bar
            ? {
                ratio: Math.min(1, Math.max(0, Number(cell.bar.ratio) || 0)),
                color: cell.bar.color || palette.primary,
              }
            : undefined
        // Schema 1.3：格内装饰提取（色值 palette 派生，作者 hex 优先）
        const dotColor =
          !inHeader && cell.dot ? cell.dot.color || palette.emphasis : undefined
        const node =
          !inHeader && cell.node
            ? {
                first: cell.nodeFirst === true,
                last: cell.nodeLast === true,
                color: cell.color || palette.emphasis,
              }
            : undefined
        const gantt =
          !inHeader && cell.gantt
            ? {
                from: Math.min(1, Math.max(0, cell.gantt.from)),
                to: Math.min(1, Math.max(0, cell.gantt.to)),
                color: cell.gantt.color || palette.primary,
                milestone: cell.gantt.milestone === true,
              }
            : undefined
        // Schema 1.5：对阵/冠军/打卡槽提取（HTML 近似渲染）
        const match =
          !inHeader && cell.match
            ? {
                a: String(cell.match.a ?? ''),
                sa: String(cell.match.sa ?? ''),
                b: String(cell.match.b ?? ''),
                sb: String(cell.match.sb ?? ''),
                ...(cell.match.winA === true ? { winA: true } : {}),
                ...(cell.match.winB === true ? { winB: true } : {}),
              }
            : undefined
        const champion =
          !inHeader && cell.champion
            ? {
                name: String(cell.champion.name ?? ''),
                ...(cell.champion.title ? { title: String(cell.champion.title) } : {}),
                ...(cell.champion.note ? { note: String(cell.champion.note) } : {}),
              }
            : undefined
        const cellsDeco =
          !inHeader && cell.cells
            ? {
                pattern: String(cell.cells.pattern ?? ''),
                ...(typeof cell.cells.today === 'number' ? { today: cell.cells.today } : {}),
              }
            : undefined
        const style = cellStyle(
          cell,
          palette,
          effectiveZebra,
          ri,
          ci,
          recommendCol,
          metrics,
          borderScheme,
          plainHeader,
        )
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
          bar,
          sub: cell.sub ? cell.sub : undefined,
          stars: !inHeader && cell.stars !== undefined ? cell.stars : undefined,
          dotColor,
          node,
          gantt,
          leader: !inHeader && cell.leader === true ? true : undefined,
          lineColor: palette.border,
          subColor: palette.muted,
          unit: !inHeader && cell.unit ? cell.unit : undefined,
          match,
          champion,
          cells: cellsDeco,
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

    // Schema 1.2 扩展：KPI hero 区在模型构建期渲染成内联样式 HTML（与表格同 palette 派生）
    const kpiCards = effectiveKpiCards(inst)
    // Schema 1.3：海报层 HTML（wrap / header / footer 三段，渲染期包住横滚容器）
    const posterSpec = inst.poster
    const poster = posterSpec
      ? {
          wrapStyle: posterWrapStyle(posterSpec, palette),
          headerHtml: posterHeaderHtml(posterSpec, palette),
          footerHtml: posterFooterHtml(posterSpec, palette),
        }
      : undefined
    return ok({
      caption: captionText(inst),
      kpiHeroHtml:
        kpiCards.length > 0 ? renderKpiHeroHtml(kpiCards, palette, inst.kpiStyle) : undefined,
      headRows,
      bodyRows,
      footRows,
      frozenColCount: inst.layout.frozenColCount ?? 0,
      minWidthPx,
      poster,
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
    // Schema 1.2 扩展：横条格 = 相对容器 + 绝对定位色条（宽 = ratio 百分比、高 60%）+ 文本覆盖
    const barInner = cell.bar
      ? `<div style="position:absolute;left:0;top:20%;height:60%;width:${Math.round(cell.bar.ratio * 100)}%;background:${attr(cell.bar.color)};border-radius:3px"></div>`
      : ''
    // Schema 1.3：格内装饰 HTML（与 canvas 通道同一几何/语义色口径）
    const ganttInner = cell.gantt
      ? `<div style="position:relative;height:14px;background:transparent"><div style="position:absolute;left:0;right:0;top:50%;height:14px;transform:translateY(-50%);border-radius:7px;background:color-mix(in srgb, ${attr(cell.gantt.color)} 16%, transparent)"></div><div style="position:absolute;left:${(cell.gantt.from * 100).toFixed(1)}%;width:${((cell.gantt.to - cell.gantt.from) * 100).toFixed(1)}%;top:50%;height:14px;transform:translateY(-50%);border-radius:7px;background:${attr(cell.gantt.color)}"></div>${cell.gantt.milestone ? `<span style="position:absolute;left:${(cell.gantt.to * 100).toFixed(1)}%;top:50%;width:10px;height:10px;transform:translate(-50%,-50%) rotate(45deg);background:${attr(cell.gantt.color)}"></span>` : ''}</div>`
      : ''
    const nodeInner = cell.node
      ? `<div style="position:relative;padding-left:22px"><span style="position:absolute;left:5px;${cell.node.first ? 'top:50%' : 'top:0'};${cell.node.last ? 'bottom:50%' : 'bottom:0'};border-left:1px dashed ${attr(cell.lineColor ?? '')}"></span><span style="position:absolute;left:2px;top:50%;transform:translateY(-50%);width:8px;height:8px;border-radius:4px;background:${attr(cell.node.color)}"></span><span>${escapeHtml(cell.text)}</span></div>`
      : ''
    const dotInner = cell.dotColor
      ? `<span style="display:inline-block;width:9px;height:9px;border-radius:5px;background:${attr(cell.dotColor)};margin-right:8px;vertical-align:middle"></span><span style="vertical-align:middle">${escapeHtml(cell.text)}</span>`
      : ''
    const starsInner = cell.stars !== undefined
      ? `<span style="color:${attr(DECO_STAR)}">${'★'.repeat(cell.stars)}</span><span style="color:${attr(DECO_STAR_EMPTY)}">${'☆'.repeat(Math.max(0, 5 - cell.stars))}</span>`
      : ''
    const leaderInner = cell.leader
      ? `<div style="display:flex;align-items:center;gap:8px;min-width:0"><span style="white-space:nowrap">${escapeHtml(cell.text)}</span><span style="flex:1;border-bottom:1px dotted ${attr(cell.lineColor ?? '')};transform:translateY(2px)"></span></div>`
      : ''
    const subInner = !cell.sub
      ? ''
      : `<div style="font-size:11px;color:${attr(cell.subColor ?? '')};margin-top:2px;line-height:1.35">${escapeHtml(cell.sub)}</div>`
    // Schema 1.5：对阵卡 = 上下两张小卡（胜方金色左条 + 白粗体）；冠军卡 = 描边居中三行
    const matchRow = (name: string, score: string, win: boolean): string =>
      `<div style="display:flex;justify-content:space-between;gap:8px;border:1px solid ${attr(cell.lineColor ?? '')};${win ? `border-left:3px solid ${attr(DECO_WIN_GOLD)};background:${attr(DECO_WIN_GOLD)}55;` : ''}border-radius:3px;padding:4px 8px"><span style="${win ? `font-weight:700;color:${DECO_CARD_INK}` : `color:${attr(cell.subColor ?? '')}`}">${escapeHtml(name)}</span><span style="${win ? `font-weight:700;color:${DECO_CARD_INK}` : `color:${attr(cell.subColor ?? '')}`}">${escapeHtml(score)}</span></div>`
    const matchInner = cell.match
      ? `<div style="display:flex;flex-direction:column;gap:4px">${matchRow(cell.match.a, cell.match.sa, cell.match.winA === true)}${matchRow(cell.match.b, cell.match.sb, cell.match.winB === true)}</div>`
      : ''
    const championInner = cell.champion
      ? `<div style="border:1px solid ${attr(cell.lineColor ?? '')};border-radius:3px;text-align:center;padding:6px 8px">${cell.champion.title ? `<div style="font-size:11px;color:${attr(cell.subColor ?? '')}">${escapeHtml(cell.champion.title)}</div>` : ''}<div style="font-weight:700">${escapeHtml(cell.champion.name)}</div>${cell.champion.note ? `<div style="font-size:11px;color:${attr(cell.subColor ?? '')}">${escapeHtml(cell.champion.note)}</div>` : ''}</div>`
      : ''
    const cellsInner = cell.cells
      ? `<div style="display:flex;gap:3px">${[...cell.cells.pattern]
          .map((ch, i) => {
            const isToday = cell.cells!.today === i
            return ch === '1'
              ? `<i style="width:14px;height:14px;border-radius:3px;background:${attr(cell.subColor ?? '')};${isToday ? `box-shadow:0 0 0 2px ${attr(DECO_CELLS_TODAY)};` : ''}display:inline-block"></i>`
              : `<i style="width:14px;height:14px;border-radius:3px;border:1px solid ${attr(isToday ? DECO_CELLS_TODAY : cell.lineColor ?? '')};display:inline-block"></i>`
          })
          .join('')}</div>`
      : ''
    const bannerInner = cell.bannerRight
      ? `<div style="display:flex;justify-content:space-between;align-items:center;gap:16px"><span>${escapeHtml(cell.text)}</span><span style="font-weight:700">${escapeHtml(cell.bannerRight)}</span></div>`
      : ''
    const inner = cell.image
      ? `<img src="${cell.image}" alt="" style="display:block;width:100%;height:100%;object-fit:cover">`
      : cell.bar
        ? `<div style="position:relative">${barInner}<span style="position:relative">${escapeHtml(cell.text)}${badge}</span></div>`
        : cell.gantt
          ? ganttInner
          : cell.node
            ? nodeInner
            : cell.dotColor
              ? dotInner
              : cell.stars !== undefined
                ? starsInner
                : cell.leader
                  ? leaderInner
                  : cell.match
                    ? matchInner
                    : cell.champion
                      ? championInner
                      : cell.cells
                        ? cellsInner
                        : cell.bannerRight
                          ? bannerInner
                          : `${escapeHtml(cell.text)}${cell.unit ? `<span style="font-size:0.72em;color:${attr(cell.subColor ?? '')}"> ${escapeHtml(cell.unit)}</span>` : ''}${badge}${subInner}`
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
  // Schema 1.2 扩展：KPI hero 区置于横滚容器内、表格上方（无卡片零占位）
  const scrollWrap = `<div style="max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch">${model.kpiHeroHtml ?? ''}${table}</div>`
  // Schema 1.3：海报层包裹（bg + 标题区 + 横滚容器 + 注脚区；无海报 = 原样输出）
  if (model.poster) {
    return `<div style="${attr(model.poster.wrapStyle)}">${model.poster.headerHtml}${scrollWrap}${model.poster.footerHtml}</div>`
  }
  return scrollWrap
}

/**
 * 渲染 ExportModel → TSV 纯文本（设计增量 §5.2 剪贴板行：text/plain 风味，便于再贴回表格软件）。
 * 口径与 HTML 的 textContent 一致：caption 占首行、单元格文本 + 表头角标文本；
 * 合并格按锚点写文本、被覆盖的位置补空串，保证矩形网格（Excel/WPS 粘回后列数不塌）；
 * 单元格内不可能含制表符/换行（槽位文本来自 TSV 粘贴解析或单行输入），仍统一替换为空格兜底。
 */
export function renderExportText(model: ExportModel): string {
  const cellText = (cell: ExportCell): string =>
    `${cell.text}${cell.badge ?? ''}`.replace(/[\t\r\n]+/g, ' ')
  const lines: string[] = []
  if (model.caption) lines.push(model.caption.replace(/[\t\r\n]+/g, ' '))
  /** 列号 → 还需覆盖的行数（含当前行）；被 rowspan 覆盖的列在本行补空串 */
  const spans = new Map<number, number>()
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
      out.push(cellText(cell))
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
    lines.push(out.join('\t'))
  }
  return lines.join('\n')
}

export { escapeHtml }
