import type {
  Align,
  BlockType,
  Emphasis,
  LayoutStyle,
  MarkSlotObject,
  MarkValue,
  MergeRange,
  NumSlotObject,
  RenderContext,
  SlotDef,
  SlotValue,
  TemplateInstance,
} from '../types'
import { resolveTheme, type Palette } from '../theme/palettes'
import { toVTableTheme } from '../theme/vtableTheme'
import { FONT_STACK } from '../theme/font'
import { semanticColor } from '../theme/semantic'
import { FONT_SIZE_TIERS, PADDING_TIERS, ROW_HEIGHT_TIERS } from '../theme/layoutScales'
import { MARK_GLYPH, RECOMMEND_BADGE_TEXT, formatNumber } from '../format/formatTokens'
import { coverCrop } from '../image/imageGuard'

const COL_WIDTH = 140
const LABEL_WIDTH = 120
const ROW_HEIGHT = 36
const HEADER_HEIGHT = 36
const BLOCK_HEIGHT = 32

/** 字号/内边距档位消费指标（自定义格式 §1.3）：同一常量表，toOption / model 两处消费 */
export interface TypeMetrics {
  fontSize: number
  padV: number
  padH: number
}

/** 无 style（或档位缺省）→ 既有默认值；设了档位 → 档位 px（内边距四边统一） */
export function typeMetrics(style: LayoutStyle | undefined): TypeMetrics {
  return {
    fontSize: style?.fontSizeTier !== undefined ? FONT_SIZE_TIERS[style.fontSizeTier - 1]! : 13,
    padV: style?.paddingTier !== undefined ? PADDING_TIERS[style.paddingTier - 1]! : 8,
    padH: style?.paddingTier !== undefined ? PADDING_TIERS[style.paddingTier - 1]! : 10,
  }
}

/** 行高档位：缺省 = 既有 36；设了档位 → 档位 px（表头与表体同档，区块行仍 32） */
export function rowHeightOf(style: LayoutStyle | undefined, isHeader: boolean): number {
  if (style?.rowHeightTier === undefined) return isHeader ? HEADER_HEIGHT : ROW_HEIGHT
  return ROW_HEIGHT_TIERS[style.rowHeightTier - 1]!
}

/** 生效列宽：colWidths 数值优先，null/缺位回默认（首列 120、其余 140） */
export function colWidthAt(inst: TemplateInstance, col: number): number {
  const w = inst.layout.style?.colWidths?.[col]
  return typeof w === 'number' ? w : col === 0 ? LABEL_WIDTH : COL_WIDTH
}

export type CellMeta = {
  slotId: string | null
  role: 'header' | 'body' | 'label' | 'block' | 'readonly' | 'leftTag'
  text: string
  align?: Align
  emphasize?: Emphasis[]
  isPlaceholder?: boolean
  /** Schema 1.1: semantic mark (glyph text already resolved into `text`) */
  mark?: MarkValue | null
  /** Schema 1.1: corner badge text on a header cell (e.g. 「推荐」) */
  badge?: string
  /** R-3：图片格 data URL（经 imageGuard 白名单校验的值原样透传） */
  image?: string
  /** R-4：区块类型（block / leftTag 格上标注，styleForCell 按 type 分色） */
  blockType?: BlockType
  /** R-4：区块样式档位（emphFooter 字号 2 档 / leftTag 深浅 2 档） */
  styleTier?: number
}

function slotParts(
  v: SlotValue | undefined,
  def: SlotDef | undefined,
): {
  text: string
  align?: Align
  emphasize?: Emphasis[]
  mark?: MarkValue | null
  num?: number | null
  image?: string
} {
  if (v === undefined || v === null) return { text: '' }
  if (typeof v === 'object') {
    if ('image' in v) {
      // 图片槽（R-3）：text 置空，data URL 透传给 CellMeta 消费方
      return { text: '', image: v.image }
    }
    const em = v.emphasize
    const style = {
      align: v.align,
      emphasize: Array.isArray(em) ? em : em ? [em] : undefined,
    }
    if ('mark' in v) {
      const m = (v as MarkSlotObject).mark
      return { text: m ? MARK_GLYPH[m] : '', mark: m, ...style }
    }
    if ('num' in v) {
      const n = (v as NumSlotObject).num
      return {
        text: n === null || n === undefined ? '' : formatNumber(n, def ?? { format: 'number' }),
        num: n,
        ...style,
      }
    }
    return { text: String(v.text ?? ''), ...style }
  }
  // mark/num 槽存普通文字（如「面议」「100万」）→ 按文字显示，不套格式
  return { text: String(v) }
}

function gapAfterSet(inst: TemplateInstance): Set<number> {
  const gapAfter = new Set<number>()
  for (const def of inst.layout.blockSlots) {
    // 与 paste/planner 同一约定：rowHint = after-N（N 为逻辑行号）
    const m = /^after-(\d+)$/.exec(def.rowHint ?? '')
    if (m) gapAfter.add(Number(m[1]))
  }
  return gapAfter
}

export function buildVisualRows(inst: TemplateInstance): {
  metas: CellMeta[][]
  rowHeights: number[]
  blockRowIndexes: Map<number, string>
} {
  const grid = inst.layout.slotGrid ?? []
  const colCount = inst.layout.colCount
  const headerLevels = inst.layout.headerLevels ?? 1
  const metas: CellMeta[][] = []
  const rowHeights: number[] = []
  const blockRowIndexes = new Map<number, string>()
  const gapAfter = new Map<number, string>()
  for (const def of inst.layout.blockSlots) {
    const m = /^after-(\d+)$/.exec(def.rowHint ?? '')
    if (m) gapAfter.set(Number(m[1]), def.id)
  }
  // R-4 leftTag：left-N 锚点 → 该逻辑行首列标记（不插行）
  const leftTagAt = new Map<number, { text: string; styleTier?: number }>()
  for (const def of inst.layout.blockSlots) {
    const m = /^left-(\d+)$/.exec(def.rowHint ?? '')
    if (!m) continue
    const block = inst.blocks.find((b) => b.slotId === def.id)
    if (block) {
      leftTagAt.set(Number(m[1]), {
        text: String(block.props?.text ?? ''),
        styleTier: typeof block.props?.styleTier === 'number' ? block.props.styleTier : undefined,
      })
    }
  }

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] ?? []
    const metaRow: CellMeta[] = []
    for (let c = 0; c < colCount; c++) {
      const sid = row[c] ?? null
      const readonly = inst.layout.readonlyCells?.some(([rr, cc]) => rr === r && cc === c)
      let text = ''
      let align: Align | undefined
      let emphasize: Emphasis[] | undefined
      let isPlaceholder = false
      let mark: MarkValue | null | undefined
      let image: string | undefined
      let role: CellMeta['role'] = r < headerLevels ? 'header' : c === 0 ? 'label' : 'body'

      if (r === 0 && c === 0 && inst.meta?.templateType === 'compare') {
        text = '项目'
        role = 'header'
      } else if (r === 1 && inst.meta?.templateType === 'detail') {
        text = c === 0 ? '项目' : c === 1 ? '说明' : '备注'
        role = 'header'
      } else if (sid) {
        const parts = slotParts(inst.slots[sid], inst.slotDefs?.[sid])
        text = parts.text
        mark = parts.mark
        image = parts.image
        // mark 默认居中、num 默认右对齐（设计增量 §4.4）
        if (parts.mark !== undefined) align = parts.align ?? 'center'
        else if (parts.num !== undefined) align = parts.align ?? 'right'
        else align = parts.align
        emphasize = parts.emphasize
        // 含图格不显示占位（R-3）；空图片槽（已清）照常显示占位
        if (text === '' && !image) {
          isPlaceholder = true
          text = '填写内容'
        }
        if (readonly) role = 'readonly'
      } else if (readonly) {
        role = 'readonly'
      }

      // R-4 leftTag：区块落位后该行首列整格让给标签（tag 色底，不插行）
      const tag = c === 0 ? leftTagAt.get(r) : undefined
      if (tag) {
        role = 'leftTag'
        text = tag.text
        isPlaceholder = false
        metaRow.push({ slotId: sid, role, text, isPlaceholder, blockType: 'leftTag', styleTier: tag.styleTier })
        continue
      }

      metaRow.push({
        slotId: sid,
        role,
        text,
        align,
        emphasize,
        isPlaceholder,
        mark,
        image,
      })
    }
    metas.push(metaRow)
    rowHeights.push(rowHeightOf(inst.layout.style, r < headerLevels))

    const gapId = gapAfter.get(r)
    if (gapId) {
      const def = inst.layout.blockSlots.find((s) => s.id === gapId)
      const isFooter = def?.region === 'footer'
      const block = inst.blocks.find((b) => b.slotId === gapId)
      // footer 槽空置时不预留表底行（预览/导出都不多一行；between-rows 空槽照旧显示占位）
      if (isFooter && !block) continue
      const label = block
        ? block.type === 'sectionBar'
          ? String(block.props?.label ?? '分区')
          : String(block.props?.text ?? block.props?.label ?? (isFooter ? '注脚内容' : '分组标题'))
        : '（可拖入分区色条 / 分组标题）'
      const blockRow: CellMeta[] = Array.from({ length: colCount }, (_, c) => ({
        slotId: c === 0 ? gapId : null,
        role: block ? 'block' : 'body',
        text: c === 0 ? label : '',
        isPlaceholder: !block,
        blockType: block?.type,
        styleTier: typeof block?.props?.styleTier === 'number' ? block.props.styleTier : undefined,
      }))
      blockRowIndexes.set(metas.length, gapId)
      metas.push(blockRow)
      rowHeights.push(BLOCK_HEIGHT)
    }
  }

  // 推荐列表头角标（FR-23）：加在最深层表头行
  const recCol = inst.highlight?.recommendCol ?? null
  if (recCol !== null) {
    const badgeCell = metas[headerLevels - 1]?.[recCol]
    if (badgeCell && badgeCell.role === 'header') badgeCell.badge = RECOMMEND_BADGE_TEXT
  }

  return { metas, rowHeights, blockRowIndexes }
}

export function remapMerges(
  inst: TemplateInstance,
  blockRowIndexes: Map<number, string>,
): MergeRange[] {
  const gapAfter = gapAfterSet(inst)
  const logicalToVisual = new Map<number, number>()
  let visual = 0
  const gridLen = inst.layout.slotGrid?.length ?? inst.layout.rowCount
  for (let r = 0; r < gridLen; r++) {
    logicalToVisual.set(r, visual)
    visual += 1
    if (gapAfter.has(r)) visual += 1
  }

  const mapRange = (m: MergeRange): MergeRange => ({
    start: [logicalToVisual.get(m.start[0]) ?? m.start[0], m.start[1]],
    end: [logicalToVisual.get(m.end[0]) ?? m.end[0], m.end[1]],
  })

  const merges = [...(inst.layout.merges ?? []), ...(inst.layout.structuralMerges ?? [])]
  const blockMerges: MergeRange[] = []
  for (const [vr] of blockRowIndexes) {
    blockMerges.push({ start: [vr, 0], end: [vr, inst.layout.colCount - 1] })
  }
  return [...merges.map(mapRange), ...blockMerges]
}

function styleForCell(
  cell: CellMeta,
  palette: Palette,
  zebraOn: boolean,
  row: number,
  col: number,
  mode: RenderContext['mode'],
  recommendCol: number | null,
  metrics: TypeMetrics,
): Record<string, unknown> {
  const style: Record<string, unknown> = {
    fontFamily: FONT_STACK,
    fontSize: metrics.fontSize,
    borderColor: palette.border,
    borderLineWidth: 1,
    padding: [metrics.padV, metrics.padH, metrics.padV, metrics.padH],
  }
  if (cell.role === 'header') {
    style.bgColor = palette.primary
    style.color = palette.headerText
    style.fontWeight = 'bold'
  } else if (cell.role === 'leftTag') {
    // R-4 左栏标签块：tag 色底（深浅 2 档，零新增色值 GC-11）——档位常量与渲染单点在此
    style.bgColor = cell.styleTier === 2 ? palette.zebra : palette.tag
    style.color = palette.tagText
    style.fontWeight = 600
  } else if (cell.role === 'block') {
    if (cell.blockType === 'emphFooter') {
      // R-4 强调注脚：纸底小字靠左（与导出 tfoot 同源）
      style.bgColor = palette.paper
      style.color = palette.muted
      style.textAlign = 'left'
      // 字号 2 档（TH-B2）：常规 / 略大
      style.fontSize = metrics.fontSize + (cell.styleTier === 2 ? 2 : 0)
    } else {
      // sectionBar / groupHeader：主色整行
      style.bgColor = palette.primary
      style.color = palette.headerText
      style.fontWeight = 600
      style.textAlign = 'left'
    }
  } else {
    const zebra = zebraOn && row % 2 === 1
    const isRecCol = recommendCol !== null && col === recommendCol
    // 推荐列浅底优先于斑马纹（设计增量 §4.3）
    style.bgColor = isRecCol
      ? semanticColor(palette, 'recommendColBg')
      : zebra
        ? palette.zebra
        : palette.paper
    style.color = '#1a1a1a'
    if (cell.role === 'label' || cell.role === 'readonly') style.fontWeight = 600
  }
  // 语义符号色随主题（✓◐→primary、✗→emphasis）
  if (cell.mark) style.color = semanticColor(palette, cell.mark)
  if (cell.align) style.textAlign = cell.align
  const em = cell.emphasize ?? []
  if (em.includes('bold')) style.fontWeight = 700
  if (em.includes('red')) style.color = palette.emphasis
  if (em.includes('bg')) style.bgColor = palette.emphasisSoft
  if (cell.isPlaceholder && mode === 'preview') {
    style.color = '#9aa3af'
    style.fontStyle = 'italic'
  }
  return style
}

// ── R-3 图片格绘制通道（VTable 自定义绘制，预览与 PNG 导出同源）──
//
// 通道选型（P1 修复）：vtable 1.26.8 的 customRender 回调参数（CustomRenderFunctionArg）
// 实查（node_modules/@visactor/vtable/cjs/ts-types/customElement.d.ts）只有
// row / col / table / value / dataValue / rect 字段，**没有 ctx**——旧实现的
// args.ctx.drawImage 在图片资源命中时必然 undefined（真浏览器必崩，单测 mock ctx 掩盖）。
// 本模块改走 customLayout 函数通道（dealWithCustom 对 rootContainer instanceof VGroup
// 原样采用）：裁剪产物（自持离屏 canvas）直接作为 vrender Image graphic 的 image 属性
// （HTMLCanvasElement → loadImage 同步 success，graphic.js loadImage isObject 分支），
// 首帧同步画出、无异步竞态，导出 exportImg 不可能漏图。

export interface VCellRect {
  left: number
  top: number
  width: number
  height: number
}

/** customLayout / customRender 回调参数的最小结构面（只声明我们消费的字段） */
export interface VCustomRenderArgs {
  row: number
  col: number
  rect: VCellRect
}

/** customLayout 函数通道允许的返回结构（ICustomLayoutObj 的最小面） */
export interface VCustomRenderResult {
  rootContainer: unknown
  expectedWidth: number
  expectedHeight: number
  renderDefault: false
}

/**
 * 格内容组构建器：由渲染通道注入（vrender 依赖必须留在 VTable chunk，见
 * imageDrawVRender.ts / vtableLite.ts）。入参为裁剪好的离屏 canvas 与格宽高。
 */
export type CellGroupFactory = (
  image: HTMLCanvasElement,
  width: number,
  height: number,
) => unknown

let cellGroupFactory: CellGroupFactory | null = null

/** 渲染通道注册（vtableLite 装载时调用一次；传 null 撤销，图片格回退默认绘制） */
export function registerCellGroupFactory(fn: CellGroupFactory | null): void {
  cellGroupFactory = fn
}

/** 离屏裁剪缓存：键 = 尺寸 + 源 data URL（同一图同一格尺寸复用同一画布） */
const cropCanvasCache = new Map<string, HTMLCanvasElement>()

/**
 * cover 裁剪落canvas（coverCrop 唯一实现算裁剪参数，预览 / HTML / PNG 三处同源）：
 * 以格子宽高比为准居中裁源图，画到自持离屏 canvas（宽高 = 格子），返回该画布。
 * 无 DOM（测试环境）/格子尺寸非法 → undefined，调用方回退默认绘制。
 */
export function cropCanvasFor(
  src: string,
  asset: { naturalWidth: number; naturalHeight: number },
  cw: number,
  ch: number,
): HTMLCanvasElement | undefined {
  if (cw <= 0 || ch <= 0) return undefined
  const key = `${cw}x${ch}|${src}`
  const hit = cropCanvasCache.get(key)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const c2d = canvas.getContext('2d')
  if (!c2d) return undefined
  const { sw, sh } = coverCrop(asset.naturalWidth, asset.naturalHeight, cw, ch)
  c2d.drawImage(
    asset as CanvasImageSource,
    (asset.naturalWidth - sw) / 2,
    (asset.naturalHeight - sh) / 2,
    sw,
    sh,
    0,
    0,
    cw,
    ch,
  )
  cropCanvasCache.set(key, canvas)
  return canvas
}

/** 清空离屏裁剪缓存（单测逐用例重建画布 stub 用；生产无调用方） */
export function clearCropCanvasCache(): void {
  cropCanvasCache.clear()
}

/**
 * 图片格绘制：coverCrop 唯一实现算裁剪参数，自持离屏 canvas 裁剪后经
 * 注入的组构建器产出 customLayout rootContainer（同步绘制，无 args.ctx 依赖）。
 * 无图 / 资源未就绪 / 通道未注册 → 返回 undefined 交给 VTable 默认绘制
 * （文字格 style 回调并存）。
 */
export function drawImageCell(
  cell: CellMeta | undefined,
  asset: { naturalWidth: number; naturalHeight: number } | undefined,
  args: VCustomRenderArgs,
): VCustomRenderResult | undefined {
  if (!cell?.image || !asset) return undefined
  const { width, height } = args.rect
  if (!cellGroupFactory) return undefined
  const canvas = cropCanvasFor(cell.image, asset, width, height)
  if (!canvas) return undefined
  return {
    rootContainer: cellGroupFactory(canvas, width, height),
    expectedWidth: width,
    expectedHeight: height,
    renderDefault: false,
  }
}

export function toOption(inst: TemplateInstance, ctx: RenderContext): Record<string, unknown> {
  const { palette, zebraOn } = resolveTheme(inst.themeId, inst.themeTokens)
  const effectiveZebra = inst.zebraOn === false ? false : zebraOn
  const { metas, rowHeights, blockRowIndexes } = buildVisualRows(inst)
  const merges = remapMerges(inst, blockRowIndexes)
  const colCount = inst.layout.colCount
  const recommendCol = inst.highlight?.recommendCol ?? null
  const metrics = typeMetrics(inst.layout.style)

  const records = metas.map((row) => {
    const rec: Record<string, string> = {}
    row.forEach((cell, c) => {
      rec[`c${c}`] = cell.text
    })
    return rec
  })

  // R-3：含图列挂 customLayout（列级，图片格绘制通道）；文字格仍走 style 回调，两机制并存
  const imageCols = new Set<number>()
  metas.forEach((row) => {
    row.forEach((cell, c) => {
      if (cell.image) imageCols.add(c)
    })
  })

  const columns = Array.from({ length: colCount }, (_, c) => {
    const col: Record<string, unknown> = {
      field: `c${c}`,
      title: ' ',
      width: colWidthAt(inst, c),
      style: (args: { row: number; col: number }) => {
        const cell = metas[args.row]?.[args.col]
        if (!cell) return {}
        return styleForCell(cell, palette, effectiveZebra, args.row, args.col, ctx.mode, recommendCol, metrics)
      },
    }
    if (imageCols.has(c)) {
      // P1 修复：customLayout 函数通道（rootContainer 直接采用，见文件头选型说明）；
      // vtable 1.26.8 customRender 参数无 ctx，旧 args.ctx.drawImage 必崩
      col.customLayout = (args: VCustomRenderArgs) => {
        const cell = metas[args.row]?.[args.col]
        const asset = cell?.image ? ctx.images?.get(cell.image) : undefined
        return drawImageCell(cell, asset, args)
      }
    }
    return col
  })

  const theme = toVTableTheme(palette, {
    zebraOn: effectiveZebra,
    transparentUnderlay: ctx.transparentUnderlay,
    metrics,
  })

  const customMergeCell = (col: number, row: number) => {
    for (const m of merges) {
      if (row >= m.start[0] && row <= m.end[0] && col >= m.start[1] && col <= m.end[1]) {
        const text = metas[m.start[0]]?.[m.start[1]]?.text ?? ''
        return {
          text: row === m.start[0] && col === m.start[1] ? text : '',
          range: {
            start: { col: m.start[1], row: m.start[0] },
            end: { col: m.end[1], row: m.end[0] },
          },
        }
      }
    }
    return undefined
  }

  return {
    records,
    columns,
    widthMode: 'standard',
    heightMode: 'standard',
    defaultRowHeight: rowHeightOf(inst.layout.style, false),
    defaultHeaderRowHeight: 0,
    showHeader: false,
    frozenColCount: inst.layout.frozenColCount ?? 0,
    theme,
    rowSeriesNumber: false,
    animationAppear: false,
    customMergeCell,
    __pt: {
      metas,
      rowHeights,
      blockRowIndexes: Object.fromEntries(blockRowIndexes),
      palette,
      font: FONT_STACK,
      contentWidth: Array.from({ length: colCount }, (_, c) => colWidthAt(inst, c)).reduce(
        (a, b) => a + b,
        0,
      ),
      contentHeight: rowHeights.reduce((a, b) => a + b, 0),
      mode: ctx.mode,
      merges,
      recommendCol,
      images: ctx.images ?? null,
    },
  }
}

export function measureContentSize(inst: TemplateInstance): { width: number; height: number } {
  const opt = toOption(inst, { mode: 'export' })
  const pt = opt.__pt as { contentWidth: number; contentHeight: number }
  return { width: pt.contentWidth + 2, height: pt.contentHeight + 2 }
}

export function findSlotAtVisual(
  inst: TemplateInstance,
  visualRow: number,
  col: number,
): { slotId: string | null; isBlockSlot: boolean } {
  const { metas, blockRowIndexes } = buildVisualRows(inst)
  const cell = metas[visualRow]?.[col]
  const blockSlot = blockRowIndexes.get(visualRow)
  return { slotId: cell?.slotId ?? null, isBlockSlot: Boolean(blockSlot) }
}

/** Map a visual body row index back to logical slotGrid row, or null if it is a block row. */
export function visualToLogicalRow(inst: TemplateInstance, visualRow: number): number | null {
  const gapAfter = gapAfterSet(inst)
  let visual = 0
  const gridLen = inst.layout.slotGrid?.length ?? inst.layout.rowCount
  for (let r = 0; r < gridLen; r++) {
    if (visual === visualRow) return r
    visual += 1
    if (gapAfter.has(r)) {
      if (visual === visualRow) return null
      visual += 1
    }
  }
  return null
}
