import type {
  Align,
  BarFormat,
  BlockType,
  CellsSlotObject,
  ChampionSlotObject,
  DotFormat,
  Emphasis,
  GanttFormat,
  MatchSlotObject,
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
import { resolveTheme, readableTextColor, type Palette } from '../theme/palettes'
import { toVTableTheme } from '../theme/vtableTheme'
import { FONT_STACK, FONT_STACK_SERIF, fontStackOf } from '../theme/font'
import { semanticColor } from '../theme/semantic'
import { FONT_SIZE_TIERS, PADDING_TIERS, ROW_HEIGHT_TIERS } from '../theme/layoutScales'
import { MARK_GLYPH, RECOMMEND_BADGE_TEXT, formatNumber } from '../format/formatTokens'
import { coverCrop } from '../image/imageGuard'

const COL_WIDTH = 140
const LABEL_WIDTH = 120
const ROW_HEIGHT = 36
const HEADER_HEIGHT = 36
const BLOCK_HEIGHT = 32
/** Schema 1.3：横幅行高（体检稿顶部结论条） */
export const BANNER_HEIGHT = 46
/** Schema 1.3：副行字号 = 主行 × 0.78（rich 两行格） */
export const SUB_FONT_RATIO = 0.78

/** 字号/内边距档位消费指标（自定义格式 §1.3）：同一常量表，toOption / model 两处消费 */
export interface TypeMetrics {
  fontSize: number
  padV: number
  padH: number
  /** Schema 1.3：生效字体族（layout.style.fontFamily → 衬线/无衬线栈） */
  fontFamily: string
  /** Schema 1.4：药丸表头上下内缩 px（缺省 6；越小药丸越饱满） */
  pillInsetV: number
  /** Schema 1.6：表头字重（plainHeader 时生效；缺省 700） */
  headerWeight: number
}

/** 无 style（或档位缺省）→ 既有默认值；设了档位 → 档位 px（内边距四边统一） */
export function typeMetrics(style: LayoutStyle | undefined): TypeMetrics {
  return {
    fontSize: style?.fontSizeTier !== undefined ? FONT_SIZE_TIERS[style.fontSizeTier - 1]! : 13,
    padV: style?.paddingTier !== undefined ? PADDING_TIERS[style.paddingTier - 1]! : 8,
    padH: style?.paddingTier !== undefined ? PADDING_TIERS[style.paddingTier - 1]! : 10,
    fontFamily: fontStackOf(style?.fontFamily),
    pillInsetV:
      typeof style?.pillInsetV === 'number' && Number.isFinite(style.pillInsetV)
        ? Math.min(20, Math.max(0, style.pillInsetV))
        : 6,
    headerWeight:
      style?.headerWeight === 400 || style?.headerWeight === 600 || style?.headerWeight === 700
        ? style.headerWeight
        : 700,
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
  /** leftTag 格所属区块槽 id（点击选中区块的命中口径，见 findSlotAtVisual） */
  blockSlotId?: string
  /** 区块级底色覆盖（sectionBar / groupHeader；缺省 = 主题 primary） */
  blockColor?: string
  /** Schema 1.2 扩展：单元格横条格式（数据格内水平彩色条） */
  bar?: BarFormat
  /** Schema 1.3：格内装饰扩展（rich 副行 / 逐格色 / 星级 / 圆点 / 甘特 / 时间轴 / 点线 / 描边盒） */
  sub?: string
  /** Schema 1.3：单位小字（num 槽 slotDefs.unit；主值同行渲染，主大单位小） */
  unit?: string
  color?: string
  bg?: string
  cellScale?: number
  stars?: number
  dot?: DotFormat
  gantt?: GanttFormat
  node?: boolean
  /** 时间轴首/末行（竖线在首行从圆点起、末行到圆点止） */
  nodeFirst?: boolean
  nodeLast?: boolean
  leader?: boolean
  boxed?: boolean
  /** banner 区块右侧强调文本 */
  bannerRight?: string
  /** banner 左强调条色（block.props.barColor 覆盖，缺省主题 emphasis） */
  bannerBarColor?: string
  /** banner 文本对齐（block.props.bannerAlign = 'center' 时居中；缺省左） */
  bannerAlign?: Align
  /** Schema 1.5：banner 主文本色覆盖（黑底白字稿） */
  bannerTextColor?: string
  /** Schema 1.5：banner 右侧文本色覆盖 */
  bannerRightColor?: string
  /** Schema 1.6：行底粗规则线 / 格内字体 / 药丸标签 */
  ruleBelow?: { width?: number; color?: string }
  font?: 'sans' | 'serif'
  chip?: { bg: string; color?: string }
  /** Schema 1.5：对阵卡（bracket） */
  match?: MatchSlotObject['match']
  /** Schema 1.5：打卡矩阵 */
  cells?: CellsSlotObject['cells']
  /** Schema 1.5：冠军卡 */
  champion?: ChampionSlotObject['champion']
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
  bar?: BarFormat
  sub?: string
  color?: string
  bg?: string
  cellScale?: number
  stars?: number
  dot?: DotFormat
  gantt?: GanttFormat
  node?: boolean
  leader?: boolean
  boxed?: boolean
  unit?: string
  match?: MatchSlotObject['match']
  cells?: CellsSlotObject['cells']
  champion?: ChampionSlotObject['champion']
  ruleBelow?: { width?: number; color?: string }
  font?: 'sans' | 'serif'
  chip?: { bg: string; color?: string }
} {
  if (v === undefined || v === null) return { text: '' }
  if (typeof v === 'object') {
    if ('image' in v) {
      // 图片槽（R-3）：text 置空，data URL 透传给 CellMeta 消费方
      return { text: '', image: v.image }
    }
    // Schema 1.5：bracket/打卡/冠军槽（装饰通道绘制，text 置空）
    if ('match' in v && v.match && typeof v.match === 'object') {
      return { text: '', match: v.match }
    }
    if ('cells' in v && v.cells && typeof v.cells === 'object') {
      return { text: '', cells: v.cells }
    }
    if ('champion' in v && v.champion && typeof v.champion === 'object') {
      return { text: '', champion: v.champion }
    }
    const rv0 = v as unknown as Record<string, unknown>
    const em = rv0.emphasize
    const style = {
      align: rv0.align as Align | undefined,
      emphasize: Array.isArray(em) ? (em as Emphasis[]) : em ? [em as Emphasis] : undefined,
    }
    const bar = 'bar' in v && v.bar && typeof v.bar === 'object' ? (v.bar as BarFormat) : undefined
    // Schema 1.3：装饰扩展字段透传（Text/Num 槽；mark 槽无这些键，record 读取绕开联合收窄）
    const rv = v as unknown as Record<string, unknown>
    const deco = {
      sub: typeof rv.sub === 'string' && rv.sub !== '' ? rv.sub : undefined,
      color: typeof rv.color === 'string' ? rv.color : undefined,
      bg: typeof rv.bg === 'string' ? rv.bg : undefined,
      cellScale: typeof rv.cellScale === 'number' && rv.cellScale !== 1 ? rv.cellScale : undefined,
      stars: typeof rv.stars === 'number' && rv.stars > 0 ? rv.stars : undefined,
      dot: rv.dot && typeof rv.dot === 'object' ? (rv.dot as DotFormat) : undefined,
      gantt: rv.gantt && typeof rv.gantt === 'object' ? (rv.gantt as GanttFormat) : undefined,
      node: rv.node === true ? true : undefined,
      leader: rv.leader === true ? true : undefined,
      unit: typeof rv.unit === 'string' && rv.unit !== '' ? rv.unit : undefined,
      ruleBelow:
        rv.ruleBelow && typeof rv.ruleBelow === 'object'
          ? (rv.ruleBelow as { width?: number; color?: string })
          : undefined,
      font: rv.font === 'serif' || rv.font === 'sans' ? (rv.font as 'sans' | 'serif') : undefined,
      chip:
        rv.chip && typeof rv.chip === 'object'
          ? (rv.chip as { bg: string; color?: string })
          : undefined,
      boxed: rv.boxed === true ? true : undefined,
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
        ...(bar ? { bar } : {}),
        ...deco,
      }
    }
    return { text: String(rv0.text ?? ''), ...style, ...(bar ? { bar } : {}), ...deco }
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

/** Schema 1.6：before-N 锚点集合（横幅行插在逻辑行 N 之前） */
function gapBeforeSet(inst: TemplateInstance): Set<number> {
  const gapBefore = new Set<number>()
  for (const def of inst.layout.blockSlots) {
    const m = /^before-(\d+)$/.exec(def.rowHint ?? '')
    if (m) gapBefore.add(Number(m[1]))
  }
  return gapBefore
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
  const gapBefore = new Map<number, string>()
  for (const def of inst.layout.blockSlots) {
    const mAfter = /^after-(\d+)$/.exec(def.rowHint ?? '')
    if (mAfter) gapAfter.set(Number(mAfter[1]), def.id)
    const mBefore = /^before-(\d+)$/.exec(def.rowHint ?? '')
    if (mBefore) gapBefore.set(Number(mBefore[1]), def.id)
  }
  // R-4 leftTag：left-N 锚点 → 该逻辑行首列标记（不插行）；blockSlotId 供命中链选中区块
  const leftTagAt = new Map<
    number,
    { text: string; styleTier?: number; blockSlotId: string }
  >()
  for (const def of inst.layout.blockSlots) {
    const m = /^left-(\d+)$/.exec(def.rowHint ?? '')
    if (!m) continue
    const block = inst.blocks.find((b) => b.slotId === def.id)
    if (block) {
      leftTagAt.set(Number(m[1]), {
        text: String(block.props?.text ?? ''),
        styleTier: typeof block.props?.styleTier === 'number' ? block.props.styleTier : undefined,
        blockSlotId: def.id,
      })
    }
  }

  for (let r = 0; r < grid.length; r++) {
    // Schema 1.6：before-N 锚点——横幅行插在逻辑行 r 之前（成绩单姓名条在表头上方）
    const beforeId = gapBefore.get(r)
    if (beforeId) {
      const defB = inst.layout.blockSlots.find((b) => b.id === beforeId)
      const blockB = inst.blocks.find((b) => b.slotId === beforeId)
      const labelB = blockB
        ? blockB.type === 'banner'
          ? String(blockB.props?.text ?? '')
          : String(blockB.props?.text ?? blockB.props?.label ?? '')
        : ''
      const bannerRowB: CellMeta[] = Array.from({ length: colCount }, (_, c) => ({
        slotId: c === 0 ? beforeId : null,
        role: blockB ? 'block' : 'body',
        text: c === 0 ? labelB : '',
        isPlaceholder: !blockB,
        blockType: blockB?.type,
        styleTier: typeof blockB?.props?.styleTier === 'number' ? blockB.props.styleTier : undefined,
        blockColor:
          blockB && typeof blockB.props?.color === 'string' && blockB.props.color
            ? blockB.props.color
            : undefined,
        ...(blockB?.type === 'banner' && typeof blockB?.props?.bannerRight === 'string'
          ? { bannerRight: blockB.props.bannerRight }
          : {}),
        ...(blockB?.type === 'banner' &&
        typeof blockB?.props?.barColor === 'string' &&
        (blockB.props.barColor as string)
          ? { bannerBarColor: blockB.props.barColor as string }
          : {}),
        ...(blockB?.type === 'banner' && typeof blockB?.props?.bannerTextColor === 'string' && blockB.props.bannerTextColor
          ? { bannerTextColor: blockB.props.bannerTextColor as string }
          : {}),
        ...(blockB?.type === 'banner' && typeof blockB?.props?.bannerRightColor === 'string' && blockB.props.bannerRightColor
          ? { bannerRightColor: blockB.props.bannerRightColor as string }
          : {}),
      }))
      blockRowIndexes.set(metas.length, beforeId)
      metas.push(bannerRowB)
      rowHeights.push(blockB?.type === 'banner' ? BANNER_HEIGHT : BLOCK_HEIGHT)
    }
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
      let bar: BarFormat | undefined
      let role: CellMeta['role'] = r < headerLevels ? 'header' : c === 0 ? 'label' : 'body'
      // Schema 1.3：装饰扩展
      let sub: string | undefined
      let color: string | undefined
      let bg: string | undefined
      let cellScale: number | undefined
      let stars: number | undefined
      let dot: DotFormat | undefined
      let gantt: GanttFormat | undefined
      let node: boolean | undefined
      let leader: boolean | undefined
      let boxed: boolean | undefined
      let unit: string | undefined
      let match: MatchSlotObject['match'] | undefined
      let cells: CellsSlotObject['cells'] | undefined
      let champion: ChampionSlotObject['champion'] | undefined
      let ruleBelow: { width?: number; color?: string } | undefined
      let font: 'sans' | 'serif' | undefined
      let chip: { bg: string; color?: string } | undefined

      if (r === 0 && c === 0 && inst.meta?.templateType === 'compare') {
        text = '项目'
        role = 'header'
      } else if (sid) {
        const parts = slotParts(inst.slots[sid], inst.slotDefs?.[sid])
        text = parts.text
        mark = parts.mark
        image = parts.image
        sub = parts.sub
        color = parts.color
        bg = parts.bg
        cellScale = parts.cellScale
        stars = parts.stars
        dot = parts.dot
        gantt = parts.gantt
        node = parts.node
        leader = parts.leader
        boxed = parts.boxed
        unit = parts.unit
        match = parts.match
        cells = parts.cells
        champion = parts.champion
        ruleBelow = parts.ruleBelow
        font = parts.font
        chip = parts.chip
        // Schema 1.3：num 槽单位小字（slotDefs.unit 声明）
        if (parts.num !== undefined && sid) unit = inst.slotDefs?.[sid]?.unit
        // mark 默认居中、num 默认右对齐（设计增量 §4.4）
        if (parts.mark !== undefined) align = parts.align ?? 'center'
        else if (parts.num !== undefined) align = parts.align ?? 'right'
        else align = parts.align
        emphasize = parts.emphasize
        bar = parts.bar
        // 含图格不显示占位（R-3）；空图片槽（已清）照常显示占位；
        // Schema 1.3：bar 格条形即内容，空文字不提示占位（收支账结构列纯条形）
        if (text === '' && !image && !bar) {
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
        metaRow.push({
          slotId: sid,
          role,
          text,
          isPlaceholder,
          blockType: 'leftTag',
          styleTier: tag.styleTier,
          blockSlotId: tag.blockSlotId,
        })
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
        ...(bar ? { bar } : {}),
        ...(sub !== undefined ? { sub } : {}),
        ...(color !== undefined ? { color } : {}),
        ...(bg !== undefined ? { bg } : {}),
        ...(cellScale !== undefined ? { cellScale } : {}),
        ...(stars !== undefined ? { stars } : {}),
        ...(dot ? { dot } : {}),
        ...(gantt ? { gantt } : {}),
        ...(node ? { node } : {}),
        ...(leader ? { leader } : {}),
        ...(boxed ? { boxed } : {}),
        ...(unit ? { unit } : {}),
        ...(match ? { match } : {}),
        ...(cells ? { cells } : {}),
        ...(champion ? { champion } : {}),
        ...(ruleBelow ? { ruleBelow } : {}),
        ...(font ? { font } : {}),
        ...(chip ? { chip } : {}),
      })
    }
    metas.push(metaRow)
    // 行高：含副行（rich 两行格）的行按内容抬高；其余走档位
    const metrics = typeMetrics(inst.layout.style)
    const hasSub = metaRow.some((cell) => cell.sub)
    let rowH = rowHeightOf(inst.layout.style, r < headerLevels)
    if (hasSub) {
      const subFont = metrics.fontSize * SUB_FONT_RATIO
      const richH = metrics.padV * 2 + metrics.fontSize * 1.45 + 3 + subFont * 1.35
      rowH = Math.max(rowH, Math.ceil(richH))
    }
    // Schema 1.5：对阵卡/冠军卡（双卡叠放）行高固定抬到 76；打卡矩阵行高 44（方格 + 上下留白）
    if (metaRow.some((cell) => cell.match || cell.champion)) rowH = Math.max(rowH, 76)
    if (metaRow.some((cell) => cell.cells)) rowH = Math.max(rowH, 44)
    rowHeights.push(rowH)

    const gapId = gapAfter.get(r)
    if (gapId) {
      const def = inst.layout.blockSlots.find((s) => s.id === gapId)
      const isFooter = def?.region === 'footer'
      const block = inst.blocks.find((b) => b.slotId === gapId)
      // footer 槽空置时不预留表底行（预览/导出都不多一行；between-rows 空槽照旧显示占位）
      if (isFooter && !block) continue
      const isBanner = block?.type === 'banner'
      const label = block
        ? block.type === 'sectionBar'
          ? String(block.props?.label ?? '分区')
          : block.type === 'banner'
            ? String(block.props?.text ?? '')
            : String(block.props?.text ?? block.props?.label ?? (isFooter ? '注脚内容' : '分组标题'))
        : '（可拖入分区色条 / 分组标题）'
      const blockRow: CellMeta[] = Array.from({ length: colCount }, (_, c) => ({
        slotId: c === 0 ? gapId : null,
        role: block ? 'block' : 'body',
        text: c === 0 ? label : '',
        isPlaceholder: !block,
        blockType: block?.type,
        styleTier: typeof block?.props?.styleTier === 'number' ? block.props.styleTier : undefined,
        blockColor:
          block && typeof block.props?.color === 'string' && block.props.color
            ? block.props.color
            : undefined,
        ...(isBanner && typeof block?.props?.bannerRight === 'string'
          ? { bannerRight: block.props.bannerRight }
          : {}),
        ...(isBanner &&
        typeof block?.props?.barColor === 'string' &&
        (block.props.barColor as string)
          ? { bannerBarColor: block.props.barColor as string }
          : {}),
        ...(isBanner && block?.props?.bannerAlign === 'center' ? { bannerAlign: 'center' as Align } : {}),
        ...(isBanner && typeof block?.props?.bannerTextColor === 'string' && block.props.bannerTextColor
          ? { bannerTextColor: sanitizeHexLoose(block.props.bannerTextColor as string) }
          : {}),
        ...(isBanner && typeof block?.props?.bannerRightColor === 'string' && block.props.bannerRightColor
          ? { bannerRightColor: sanitizeHexLoose(block.props.bannerRightColor as string) }
          : {}),
      }))
      blockRowIndexes.set(metas.length, gapId)
      metas.push(blockRow)
      rowHeights.push(isBanner ? BANNER_HEIGHT : BLOCK_HEIGHT)
    }
  }

  // Schema 1.3：时间轴首/末行标记（同列相邻 node 格连线；首行线从圆点起、末行到圆点止）
  for (let c = 0; c < colCount; c++) {
    let prev = -1
    for (let r = 0; r <= metas.length; r++) {
      const isNode = r < metas.length && metas[r]![c]?.node === true
      if (isNode) {
        if (prev < 0) metas[r]![c]!.nodeFirst = true
        prev = r
      } else if (prev >= 0) {
        metas[prev]![c]!.nodeLast = true
        prev = -1
      }
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
  const gapBefore = gapBeforeSet(inst)
  const logicalToVisual = new Map<number, number>()
  let visual = 0
  const gridLen = inst.layout.slotGrid?.length ?? inst.layout.rowCount
  for (let r = 0; r < gridLen; r++) {
    if (gapBefore.has(r)) visual += 1
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
  borderScheme: LayoutStyle['borderScheme'],
  headerShape: LayoutStyle['headerShape'],
  plainHeader: boolean,
): Record<string, unknown> {
  const style: Record<string, unknown> = {
    fontFamily: metrics.fontFamily,
    fontSize: metrics.fontSize,
    borderColor: palette.border,
    borderLineWidth: 1,
    padding: [metrics.padV, metrics.padH, metrics.padV, metrics.padH],
  }
  // Schema 1.3：边框方案（rows 仅横线 / cols 仅竖线 / none 无框；数组形式 [上,右,下,左]）
  if (borderScheme === 'rows') {
    style.borderColor = [palette.border, palette.border, palette.border, palette.border]
    style.borderLineWidth = [1, 0, 1, 0]
  } else if (borderScheme === 'cols') {
    style.borderColor = [palette.border, palette.border, palette.border, palette.border]
    style.borderLineWidth = [0, 1, 0, 1]
  } else if (borderScheme === 'none') {
    style.borderLineWidth = 0
  }
  if (cell.role === 'header') {
    if (headerShape === 'pill') {
      // 药丸表头：格底透明化（纸色），圆角色块由 deco pill 通道绘制
      style.bgColor = palette.paper
      style.borderLineWidth = 0
    } else if (plainHeader) {
      // 无底色表头（账本/极简风）：纸底深字（字重可调，Schema 1.6 headerWeight）
      style.bgColor = palette.paper
      style.color = palette.primary
      style.fontWeight = metrics.headerWeight
    } else {
      style.bgColor = palette.primary
      style.color = palette.headerText
      style.fontWeight = 'bold'
    }
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
    } else if (cell.blockType === 'banner') {
      // Schema 1.3 横幅行：柔色底 + 主文本（默认绘制；左条/右文由 deco banner 通道补画）
      style.bgColor = cell.blockColor ?? palette.zebra
      style.color = palette.primary
      style.textAlign = cell.bannerAlign ?? 'left'
      style.fontWeight = 600
    } else {
      // sectionBar / groupHeader：主色整行；区块级自定义底色时文字按亮度自动黑白
      if (cell.blockColor) {
        style.bgColor = cell.blockColor
        style.color = readableTextColor(cell.blockColor)
      } else {
        style.bgColor = palette.primary
        style.color = palette.headerText
      }
      style.fontWeight = 600
      style.textAlign = 'left'
    }
  } else {
    const zebra = zebraOn && row % 2 === 1
    const isRecCol = recommendCol !== null && col === recommendCol
    // 推荐列浅底优先于斑马纹（设计增量 §4.3）；逐格底色最高优先
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
  // Schema 1.3：逐格底色 / 文字色 / 字号倍率（后置覆盖，作者意图优先级最高）
  if (cell.bg) style.bgColor = cell.bg
  if (cell.color) style.color = cell.color
  if (cell.cellScale && cell.cellScale !== 1) {
    style.fontSize = Math.round(metrics.fontSize * cell.cellScale)
  }
  // Schema 1.6：格内字体覆盖 / 行底粗规则线 / 药丸标签底色
  if (cell.font) style.fontFamily = cell.font === 'serif' ? FONT_STACK_SERIF : FONT_STACK
  if (cell.ruleBelow) {
    const w = Math.min(6, Math.max(1, Math.round(cell.ruleBelow.width ?? 2)))
    const c = cell.ruleBelow.color ?? palette.primary
    const colors = Array.isArray(style.borderColor) ? style.borderColor : [c, c, c, c]
    style.borderColor = [colors[0], colors[1], c, colors[3]]
    const widths = Array.isArray(style.borderLineWidth) ? style.borderLineWidth : [1, 1, 1, 1]
    style.borderLineWidth = [widths[0], widths[1], w, widths[3]]
  }
  if (cell.chip) {
    style.bgColor = cell.chip.bg
    if (cell.chip.color) style.color = cell.chip.color
  }
  // Schema 1.3：描边盒（无框方案下的独立描边格，菜单供应说明）
  if (cell.boxed) {
    style.borderColor = [palette.border, palette.border, palette.border, palette.border]
    style.borderLineWidth = [1, 1, 1, 1]
  }
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

// ── Schema 1.2 扩展：单元格条形格式绘制通道（与图片格同走 customLayout，预览 / PNG 同源）──

/** bar 格组构建器：由渲染通道注入（vrender 依赖必须留在 VTable chunk） */
export type BarGroupFactory = (
  bar: { ratio: number; color: string },
  text: string,
  textStyle: {
    fontSize: number
    color: string
    fontWeight?: number
    fontFamily: string
    textAlign: 'left' | 'center' | 'right'
  },
  width: number,
  height: number,
  padH: number,
) => unknown

let barGroupFactory: BarGroupFactory | null = null

/** 渲染通道注册（vtableLite 装载时调用一次；传 null 撤销，bar 格回退默认文字绘制） */
export function registerBarGroupFactory(fn: BarGroupFactory | null): void {
  barGroupFactory = fn
}

/**
 * 条形格绘制：格内水平彩色条（宽 = 内容区宽 × ratio）+ 原文本覆盖其上。
 * 无 bar / 通道未注册 → undefined 交给 VTable 默认文字绘制（style 回调并存）。
 */
export function drawBarCell(
  cell: CellMeta | undefined,
  palette: Palette,
  metrics: TypeMetrics,
  args: VCustomRenderArgs,
): VCustomRenderResult | undefined {
  if (!cell?.bar) return undefined
  if (!barGroupFactory) return undefined
  const { width, height } = args.rect
  const ratio = Math.min(1, Math.max(0, Number(cell.bar.ratio) || 0))
  const color = cell.bar.color || palette.primary
  const em = cell.emphasize ?? []
  return {
    rootContainer: barGroupFactory(
      { ratio, color },
      cell.text,
      {
        fontSize: metrics.fontSize,
        color: em.includes('red') ? palette.emphasis : '#1a1a1a',
        fontWeight: em.includes('bold') ? 700 : undefined,
        fontFamily: FONT_STACK,
        textAlign: cell.align ?? 'right',
      },
      width,
      height,
      metrics.padH,
    ),
    expectedWidth: width,
    expectedHeight: height,
    renderDefault: false,
  }
}

// ── Schema 1.3 扩展：格内装饰绘制通道（星级/圆点/甘特/时间轴/点线/横幅/药丸/rich 双行）──
// 与 image/bar 同一 customLayout 机制；spec 在 toOption 内由 palette 派生组装（逻辑单点），
// vrender 图元工厂在 decoDrawVRender.ts（VTable chunk），预览 / PNG 同源。

/** 装饰格绘制描述（扁平结构；字段按 kind 取用，全部为已解析的具体值） */
export interface DecoSpec {
  kind:
    | 'rich'
    | 'stars'
    | 'dot'
    | 'gantt'
    | 'node'
    | 'leader'
    | 'banner'
    | 'pill'
    | 'headerCard'
    | 'match'
    | 'champion'
    | 'cells'
    | 'chip'
  /** 主行文本（rich/dot/leader/banner/pill） */
  main?: string
  /** 副行文本（rich/pill） */
  sub?: string
  /** banner 右侧强调文本 */
  right?: string
  fontSize?: number
  subFontSize?: number
  color?: string
  subColor?: string
  rightColor?: string
  fontWeight?: number
  fontFamily?: string
  align?: 'left' | 'center' | 'right'
  padH?: number
  /** 单位小字（同行，主值后；字号 = fontSize × 0.62） */
  unit?: string
  /** stars：0-5 */
  stars?: number
  starColor?: string
  starEmptyColor?: string
  /** dot / node / leader */
  dotColor?: string
  lineColor?: string
  /** node：首行（线从圆点起）/ 末行（线到圆点止） */
  nodeFirst?: boolean
  nodeLast?: boolean
  /** gantt：from/to 0-1 相对内容区宽 */
  from?: number
  to?: number
  barColor?: string
  trackColor?: string
  milestone?: boolean
  /** 里程碑菱形色（缺省主题 emphasis 派生传入） */
  milestoneColor?: string
  /** banner / pill 底色与左强调条色 */
  bg?: string
  barLeftColor?: string
  /** pill 上下内缩 px（Schema 1.4，可调药丸高度；缺省 6） */
  insetV?: number
  /** Schema 1.5 对阵卡：上/下卡队名与比分、胜方高亮 */
  sideA?: string
  scoreA?: string
  sideB?: string
  scoreB?: string
  winA?: boolean
  winB?: boolean
  /** 对阵/冠军卡面色与描边色（深底稿） */
  cardBg?: string
  cardBorder?: string
  /** 冠军卡小标/备注色 */
  cardTitleColor?: string
  /** 打卡矩阵：「今天」下标（0 基，红框） */
  today?: number
  /** 打卡矩阵空心格描边色（缺省 subColor） */
  cellEmptyBorder?: string
  /** 对阵卡胜方强调色（金竖条/金色比分） */
  winColor?: string
}

export type DecoGroupFactory = (spec: DecoSpec, width: number, height: number) => unknown

let decoGroupFactory: DecoGroupFactory | null = null

/** 装饰格绘制通道注册（vtableLite 装载时调用一次；传 null 撤销，装饰格回退默认文字绘制） */
export function registerDecoGroupFactory(fn: DecoGroupFactory | null): void {
  decoGroupFactory = fn
}

/** 宽松 hex 清洗（banner 文字色覆盖用；非法返回 undefined 走 palette 兜底） */
function sanitizeHexLoose(v: string): string | undefined {
  const m = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.exec(v.trim())
  return m ? v.trim().toLowerCase() : undefined
}

/** 单格装饰 kind 判定（priority：gantt > stars > dot > node > leader > rich 副行） */
export function decoKindOf(cell: CellMeta): DecoSpec['kind'] | null {
  if (cell.gantt) return 'gantt'
  if (cell.stars !== undefined) return 'stars'
  if (cell.dot) return 'dot'
  if (cell.node) return 'node'
  if (cell.leader) return 'leader'
  if (cell.sub) return 'rich'
  if (cell.chip) return 'chip'
  return null
}

/** 由 CellMeta 组装 DecoSpec（色值 palette 派生，作者 hex 优先；逻辑单点在核内） */
export function decoSpecOf(
  cell: CellMeta,
  palette: Palette,
  metrics: TypeMetrics,
  headerShapeFlat = true,
  plainHeader = false,
): DecoSpec | null {
  // 表头角色优先于装饰分派：表头 sub 是「定位小字」，路由成 pill / headerCard 而非 rich
  if (cell.role === 'header' && !cell.stars && !cell.dot && !cell.gantt && !cell.node && !cell.leader) {
    const headSpec = {
      main: cell.text,
      sub: cell.sub,
      fontSize: metrics.fontSize,
      subFontSize: metrics.fontSize * SUB_FONT_RATIO,
      color: plainHeader ? palette.primary : palette.headerText,
      subColor: plainHeader ? palette.muted : palette.headerText,
      fontWeight: 700,
      fontFamily: metrics.fontFamily,
      bg: plainHeader ? palette.paper : palette.primary,
      padH: metrics.padH,
      align: 'center' as const,
    }
    return headerShapeFlat
      ? { kind: 'headerCard', ...headSpec }
      : { kind: 'pill', ...headSpec, insetV: metrics.pillInsetV }
  }
  const kind = decoKindOf(cell)
  if (kind) {
    const mainColor = cell.color ?? '#1a1a1a'
    const em = cell.emphasize ?? []
    const fontWeight = em.includes('bold') ? 700 : undefined
    const base = {
      fontSize: metrics.fontSize * (cell.cellScale && cell.cellScale !== 1 ? cell.cellScale : 1),
      subFontSize: metrics.fontSize * SUB_FONT_RATIO,
      color: mainColor,
      subColor: palette.muted,
      fontWeight,
      fontFamily: metrics.fontFamily,
      align: cell.align ?? ('left' as Align),
      padH: metrics.padH,
      unit: cell.unit,
    }
    if (kind === 'gantt' && cell.gantt) {
      const g = cell.gantt
      return {
        kind,
        ...base,
        from: Math.min(1, Math.max(0, g.from)),
        to: Math.min(1, Math.max(0, g.to)),
        barColor: g.color || palette.primary,
        trackColor: palette.zebra,
        milestone: g.milestone === true,
        milestoneColor: palette.emphasis,
      }
    }
    if (kind === 'stars') {
      return {
        kind,
        ...base,
        align: cell.align ?? 'left',
        stars: cell.stars,
        starColor: cell.color || palette.emphasis,
        starEmptyColor: palette.zebra,
      }
    }
    if (kind === 'dot') {
      return {
        kind,
        ...base,
        align: cell.align ?? 'left',
        main: cell.text,
        dotColor: cell.dot?.color || palette.emphasis,
      }
    }
    if (kind === 'node') {
      return {
        kind,
        ...base,
        main: cell.text,
        dotColor: cell.color || palette.emphasis,
        lineColor: palette.border,
        nodeFirst: cell.nodeFirst === true,
        nodeLast: cell.nodeLast === true,
      }
    }
    if (kind === 'leader') {
      return {
        kind,
        ...base,
        main: cell.text,
        dotColor: palette.border,
      }
    }
    if (kind === 'chip' && cell.chip) {
      return {
        kind: 'chip',
        ...base,
        main: cell.text,
        bg: cell.chip.bg,
        color: cell.chip.color ?? readableTextColor(cell.chip.bg),
        align: cell.align ?? 'center',
      }
    }
    // rich：主行 + 副行小字
    return { kind: 'rich', ...base, main: cell.text, sub: cell.sub ?? '' }
  }

  if (cell.role === 'block' && cell.blockType === 'banner') {
    return {
      kind: 'banner',
      main: cell.text,
      right: cell.bannerRight,
      fontSize: metrics.fontSize,
      color: cell.bannerTextColor ?? palette.primary,
      rightColor: cell.bannerRightColor ?? palette.emphasis,
      fontWeight: 600,
      fontFamily: metrics.fontFamily,
      bg: cell.blockColor ?? palette.zebra,
      barLeftColor: cell.bannerBarColor ?? palette.emphasis,
      padH: metrics.padH,
      align: cell.bannerAlign ?? 'left',
    }
  }
  if (cell.match) {
    return {
      kind: 'match',
      fontSize: metrics.fontSize,
      subFontSize: metrics.fontSize * SUB_FONT_RATIO,
      color: palette.primary,
      subColor: palette.muted,
      fontFamily: metrics.fontFamily,
      padH: metrics.padH,
      sideA: cell.match.a,
      scoreA: cell.match.sa,
      sideB: cell.match.b,
      scoreB: cell.match.sb,
      winA: cell.match.winA === true,
      winB: cell.match.winB === true,
      winColor: palette.emphasis,
      cardBg: cell.bg ?? 'transparent',
      cardBorder: cell.color,
      align: 'left',
    }
  }
  if (cell.champion) {
    return {
      kind: 'champion',
      main: cell.champion.name,
      sub: cell.champion.title,
      right: cell.champion.note,
      fontSize: metrics.fontSize,
      subFontSize: metrics.fontSize * SUB_FONT_RATIO,
      color: cell.color ?? palette.emphasis,
      subColor: palette.muted,
      fontFamily: metrics.fontFamily,
      padH: metrics.padH,
      align: 'center',
      cardBg: cell.bg,
      cardBorder: cell.color ?? palette.emphasis,
      cardTitleColor: palette.emphasis,
    }
  }
  if (cell.cells) {
    return {
      kind: 'cells',
      main: cell.cells.pattern,
      fontSize: metrics.fontSize,
      color: cell.color ?? palette.primary,
      subColor: palette.border,
      fontFamily: metrics.fontFamily,
      padH: metrics.padH,
      align: 'left',
      today: cell.cells.today,
      cellEmptyBorder: palette.border,
      dotColor: palette.emphasis,
    }
  }
  return null
}

export function toOption(inst: TemplateInstance, ctx: RenderContext): Record<string, unknown> {
  const { palette, zebraOn } = resolveTheme(inst.themeId, inst.themeTokens)
  const effectiveZebra = inst.zebraOn === false ? false : zebraOn
  const built = buildVisualRows(inst)
  // 导出（PNG）占位口径与 HTML 导出同源（model.ts 已按 isPlaceholder 置空串）：
  // 预览保留「填写内容 / 可拖入区块」提示，导出一律置空，不泄占位文案。
  const metas =
    ctx.mode === 'export'
      ? built.metas.map((row) =>
          row.map((cell) => (cell.isPlaceholder ? { ...cell, text: '' } : cell)),
        )
      : built.metas
  const { rowHeights, blockRowIndexes } = built
  const merges = remapMerges(inst, blockRowIndexes)
  const colCount = inst.layout.colCount
  const recommendCol = inst.highlight?.recommendCol ?? null
  const metrics = typeMetrics(inst.layout.style)
  const borderScheme = inst.layout.style?.borderScheme ?? 'full'
  const headerShape = inst.layout.style?.headerShape ?? 'flat'
  const plainHeader = inst.layout.style?.plainHeader === true

  const records = metas.map((row) => {
    const rec: Record<string, string> = {}
    row.forEach((cell, c) => {
      rec[`c${c}`] = cell.text
    })
    return rec
  })

  // R-3：含图列挂 customLayout（列级，图片格绘制通道）；文字格仍走 style 回调，两机制并存
  // Schema 1.2 扩展：含 bar 格的列同样挂 customLayout（图片 / 条形两通道在回调内按格分流）
  // Schema 1.3 扩展：装饰格（星级/圆点/甘特/时间轴/点线/rich 双行）与 banner/药丸表头同通道
  const imageCols = new Set<number>()
  const barCols = new Set<number>()
  const decoCols = new Set<number>()
  const pill = inst.layout.style?.headerShape === 'pill'
  metas.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell.image) imageCols.add(c)
      if (cell.bar) barCols.add(c)
      const isPlainCenterBanner =
        cell.role === 'block' &&
        cell.blockType === 'banner' &&
        cell.bannerAlign === 'center' &&
        !cell.bannerRight
      if (
        decoKindOf(cell) ||
        cell.match ||
        cell.cells ||
        cell.champion ||
        (cell.role === 'block' && cell.blockType === 'banner' && !isPlainCenterBanner)
      ) {
        decoCols.add(c)
      }
      if (pill && cell.role === 'header') decoCols.add(c)
      // 平表头带副行（双层表头「产品名 + 定位小字」）→ headerCard 通道绘制双行
      if (!pill && cell.role === 'header' && cell.sub) decoCols.add(c)
      void r
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
        return styleForCell(
          cell,
          palette,
          effectiveZebra,
          args.row,
          args.col,
          ctx.mode,
          recommendCol,
          metrics,
          borderScheme,
          headerShape,
          plainHeader,
        )
      },
    }
    if (imageCols.has(c) || barCols.has(c) || decoCols.has(c)) {
      // P1 修复：customLayout 函数通道（rootContainer 直接采用，见文件头选型说明）；
      // vtable 1.26.8 customRender 参数无 ctx，旧 args.ctx.drawImage 必崩
      col.customLayout = (args: VCustomRenderArgs) => {
        const cell = metas[args.row]?.[args.col]
        if (cell?.image) {
          const asset = ctx.images?.get(cell.image)
          return drawImageCell(cell, asset, args)
        }
        if (cell?.bar) return drawBarCell(cell, palette, metrics, args)
        if (cell && decoCols.has(args.col)) {
          const spec = decoSpecOf(cell, palette, metrics, headerShape === 'flat', plainHeader)
          if (spec && decoGroupFactory) {
            return {
              rootContainer: decoGroupFactory(spec, args.rect.width, args.rect.height),
              expectedWidth: args.rect.width,
              expectedHeight: args.rect.height,
              renderDefault: false,
            }
          }
        }
        return undefined
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
        // BugFix（合并区文本截断"只显示一半"）：VTable 1.26.8 渲染合并区的机制是
        // **每个影子格各画一份完整内容**——建图后 dealWithMergeCellSize 会把每个
        // cellGroup 的 width 收窄回该列自身宽度（clip 随之收窄），再按列偏移 dx 拼接。
        // 因此合并区内**每个格都必须返回完整 text**：非锚点格若返回 ''，
        // 其影子格不画内容，文本就被裁在锚点列宽内（改对齐只是重排，截断依旧）。
        // 取值统一取锚点格 text，非锚点格仅作为拼接影子存在（编辑读写仍走锚点）。
        const anchor = metas[m.start[0]]?.[m.start[1]]
        const text = anchor?.text ?? ''
        // Schema 1.5：合并格的装饰绘制必须走 customMerge 返回值的 customLayout 字段——
        // VTable 对合并格只消费 getCustomMerge() 的返回（text/style/customLayout），
        // **不读 column.customLayout**（黑底 banner 白字消失的根因）；且此处 rect.width
        // = 全合并区宽，banner 居中/全宽绘制自然正确。
        const wantDeco =
          anchor &&
          (anchor.blockType === 'banner' || Boolean(decoKindOf(anchor)) || anchor.match || anchor.cells || anchor.champion)
        const decoSpec = wantDeco && anchor ? decoSpecOf(anchor, palette, metrics) : null
        return {
          text,
          range: {
            start: { col: m.start[1], row: m.start[0] },
            end: { col: m.end[1], row: m.end[0] },
          },
          ...(decoSpec && decoGroupFactory
            ? {
                customLayout: (args: VCustomRenderArgs) => {
                  const factory = decoGroupFactory
                  return {
                    rootContainer: factory
                      ? factory(decoSpec, args.rect.width, args.rect.height)
                      : null,
                    expectedWidth: args.rect.width,
                    expectedHeight: args.rect.height,
                    renderDefault: false,
                  }
                },
              }
            : {}),
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
    // 行高单点（PX-04 命中与渲染同源）：rowHeights 已喂给壳几何（命中/叠加层）与 PNG 尺寸，
    // 也必须喂给 VTable——否则 VTable 一律按 defaultRowHeight 渲染，区块行（32）与表体（36）
    // 的差异会让应用几何逐区块行漂移 4px：叠加层描边错位、点格底落到下一行、PNG 底部多留空白。
    // 逐行给全量（而非只给区块行），避免 VTable 对未配置行改走内容自适应高度。
    rowHeightConfig: rowHeights.map((height, key) => ({ key, height })),
    showHeader: false,
    frozenColCount: inst.layout.frozenColCount ?? 0,
    // WP4 列宽持久化：表头不可见（showHeader:false）→ 只能选 'all' 才能在表体列边界起拖；
    // 拖拽结束由 resize_column_end 落回模型（coreHost 订阅 → 壳层 setColWidth 批量意图）。
    columnResizeMode: 'all',
    // 双击已是就地编辑（WP3）入口，关掉 VTable 的双击自适应列宽，避免两个手势互抢
    disableDblclickAutoResizeColWidth: true,
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
  // leftTag 格（left-N 锚点，不插行）：命中返回其区块槽 id，点击即可选中区块编辑文字
  if (cell?.role === 'leftTag' && cell.blockSlotId) {
    return { slotId: cell.blockSlotId, isBlockSlot: true }
  }
  return { slotId: cell?.slotId ?? null, isBlockSlot: Boolean(blockSlot) }
}

/** Map a visual body row index back to logical slotGrid row, or null if it is a block row. */
export function visualToLogicalRow(inst: TemplateInstance, visualRow: number): number | null {
  const gapAfter = gapAfterSet(inst)
  const gapBefore = gapBeforeSet(inst)
  let visual = 0
  const gridLen = inst.layout.slotGrid?.length ?? inst.layout.rowCount
  for (let r = 0; r < gridLen; r++) {
    if (gapBefore.has(r)) {
      if (visual === visualRow) return null
      visual += 1
    }
    if (visual === visualRow) return r
    visual += 1
    if (gapAfter.has(r)) {
      if (visual === visualRow) return null
      visual += 1
    }
  }
  return null
}
