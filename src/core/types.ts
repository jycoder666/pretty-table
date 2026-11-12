/** Core types — shell/core contract (G-AR-01). No Vue/Pinia imports. */

export type ThemeId = 'T-A' | 'T-B' | 'T-C'
export type BlockType = 'sectionBar' | 'groupHeader' | 'emphFooter' | 'leftTag' | 'banner'
export type Align = 'left' | 'center' | 'right'
export type Emphasis = 'bold' | 'red' | 'bg'
export type CellCoord = [row: number, col: number]

/** Schema 1.3：格内状态圆点（体检「偏高/正常」）——色随模板数据，文字仍走槽位 text */
export interface DotFormat {
  /** 圆点颜色（hex；缺省 = 主题 emphasis） */
  color?: string
}

/** Schema 1.3：格内甘特条（排期）——from/to 为 0-1 相对整格内容区宽 */
export interface GanttFormat {
  /** 条起点（0-1，钳制） */
  from: number
  /** 条终点（0-1，钳制；>= from） */
  to: number
  /** 条色（hex；缺省 = 主题 primary） */
  color?: string
  /** 里程碑：条终点画菱形 */
  milestone?: boolean
}

export interface MergeRange {
  start: CellCoord
  end: CellCoord
}

/** Schema 1.2 扩展：单元格条形格式（数据格内水平彩色条，宽度 = ratio 百分比） */
export interface BarFormat {
  /** 0～1；越界由核内 clamp 收口 */
  ratio: number
  /** 自定义条色（hex）；缺省 = 主题 primary */
  color?: string
}

export interface TextSlotObject {
  text: string | number
  align?: Align
  emphasize?: Emphasis | Emphasis[]
  /** Schema 1.2 扩展：横条格式（文字/数值格可设） */
  bar?: BarFormat
  /** Schema 1.3：副行小字（主行下方第二行，muted 色） */
  sub?: string
  /** Schema 1.3：主行文字色（hex） */
  color?: string
  /** Schema 1.3：整格底色（hex，含 padding 区） */
  bg?: string
  /** Schema 1.3：主行字号倍率（1 / 1.25 / 1.5，读入钳制到最近档） */
  cellScale?: number
  /** Schema 1.3：星级 0-5（金★ + 灰☆） */
  stars?: number
  /** Schema 1.3：状态圆点 */
  dot?: DotFormat
  /** Schema 1.3：甘特条 */
  gantt?: GanttFormat
  /** Schema 1.3：时间轴节点（格内圆点 + 贯穿竖虚线，行程） */
  node?: boolean
  /** Schema 1.3：点线引导（文字后 dotted leader 填至行尾，菜单） */
  leader?: boolean
  /** Schema 1.3：整格描边盒（菜单供应说明） */
  boxed?: boolean
  /** Schema 1.5：同行尾注小字（如动作名右侧「主项/收尾」灰字） */
  unit?: string
  /** Schema 1.6：行底粗规则线（报价单表头/合计上方粗线；width px 1-6，color 缺省主题 primary） */
  ruleBelow?: { width?: number; color?: string }
  /** Schema 1.6：格内字体覆盖（'serif' 衬线 / 'sans' 无衬线） */
  font?: 'sans' | 'serif'
  /** Schema 1.6：药丸标签（格内圆角小卡：排班班次/库存状态；bg 底色必填） */
  chip?: { bg: string; color?: string }
}

/** Schema 1.1: three-state semantic mark */
export type MarkValue = 'yes' | 'no' | 'partial'

/** Schema 1.1: semantic mark value (never a glyph; glyph comes from FormatTokens) */
export interface MarkSlotObject {
  mark: MarkValue | null
  align?: Align
  emphasize?: Emphasis | Emphasis[]
}

/** Schema 1.1: numeric value; display format comes from SlotDef */
export interface NumSlotObject {
  num: number | null
  align?: Align
  emphasize?: Emphasis | Emphasis[]
  /** Schema 1.2 扩展：横条格式（数值格可设，条宽 = ratio 百分比） */
  bar?: BarFormat
  /** Schema 1.3：副行小字 / 逐格颜色 / 字号倍率（与 TextSlotObject 同语义） */
  sub?: string
  color?: string
  bg?: string
  cellScale?: number
  /** Schema 1.6：与 TextSlotObject 同语义的扩展字段（ruleBelow/font/chip） */
  ruleBelow?: { width?: number; color?: string }
  font?: 'sans' | 'serif'
  chip?: { bg: string; color?: string }
}

/** Schema 1.2：图片槽值。image 必须是通过 imageGuard.isImageDataUrl 白名单校验的 data URL */
export interface ImageSlotObject {
  image: string
}

/** Schema 1.5：对阵卡（锦标赛 bracket；一格内上下两张小卡，win 方高亮） */
export interface MatchSlotObject {
  match: {
    /** 上半卡队名 / 比分 */
    a: string
    sa: string
    /** 下半卡队名 / 比分 */
    b: string
    sb: string
    /** 胜方高亮（金色竖条 + 白粗体；缺省都不高亮） */
    winA?: boolean
    winB?: boolean
  }
}

/** Schema 1.5：打卡矩阵（格内一行小方格；'1' 实心完成 / '0' 空心未完成） */
export interface CellsSlotObject {
  cells: {
    /** 逐日串，如 '110101...'；长度 = 格数（上限 31） */
    pattern: string
    /** 「今天」下标（0 基；该格红框加粗） */
    today?: number
  }
}

/** Schema 1.5：冠军卡（金边金底居中三行：小标 / 队名 / 备注） */
export interface ChampionSlotObject {
  champion: {
    title?: string
    name: string
    note?: string
  }
}

export type SlotObject =
  | TextSlotObject
  | MarkSlotObject
  | NumSlotObject
  | ImageSlotObject
  | MatchSlotObject
  | CellsSlotObject
  | ChampionSlotObject

export type SlotValue = string | number | SlotObject

/** Schema 1.1: per-slot declaration of kind and display format (FR-21/22, template-owned) */
export interface SlotDef {
  kind?: 'text' | 'number' | 'mark'
  format?: 'number' | 'percent' | 'currency'
  currency?: 'CNY' | 'USD'
  fractionDigits?: 0 | 1 | 2 | 3 | 4
  unit?: string
  locked?: boolean
}

/** 可自定义的表格角色色（UI 呈现六行；设计增量 §1.2 映射表） */
export type RoleColorKey =
  | 'primary' // 表头底色（表头与分区色条同源，沿用既有语义）
  | 'headerText' // 表头文字色（schema 1.2 新键）
  | 'zebra' // 斑马纹色（开关走既有 zebraOn / setZebra）
  | 'emphasis' // 强调色
  | 'border' // 边框色
  | 'background' // 表底纸色（Palette.paper）

export interface ThemeTokens {
  primary: string
  /** schema 1.2：表头文字色覆盖 */
  headerText?: string
  zebra?: boolean | string
  emphasis?: string
  /** 正向/成功语义色（「正常」青绿点等），validate 白名单与 palettes 消费均在 */
  success?: string
  /** 柔彩底覆盖（'bg' mark 消费） */
  emphasisSoft?: string
  border?: string
  background?: string
  tag?: string
}

/** 排版微调档位（全局；px 映射在 core/theme/layoutScales.ts） */
export interface LayoutStyle {
  /** 与列一一对应；null/缺位 = 该列用默认宽 */
  colWidths?: (number | null)[]
  rowHeightTier?: 1 | 2 | 3 | 4 | 5
  fontSizeTier?: 1 | 2 | 3
  paddingTier?: 1 | 2 | 3
  /** Schema 1.3：字体族（sans 无衬线 / serif 衬线；缺省 sans） */
  fontFamily?: 'sans' | 'serif'
  /** Schema 1.3：边框方案（full 全网格 / rows 仅横线 / cols 仅竖线 / none 无框；缺省 full） */
  borderScheme?: 'full' | 'rows' | 'cols' | 'none'
  /** Schema 1.3：表头形状（flat 平色块 / pill 药丸圆角；缺省 flat） */
  headerShape?: 'flat' | 'pill'
  /** Schema 1.3：无底色表头（纸底深字，账本/极简风；缺省 false = 主色底） */
  plainHeader?: boolean
  /** Schema 1.4：药丸表头上下内缩 px（0-20，缺省 6；越小药丸越饱满） */
  pillInsetV?: number
  /** Schema 1.6：表头字重（plainHeader 时生效；缺省 700 = bold） */
  headerWeight?: 400 | 600 | 700
}

export interface BlockDesc {
  id: string
  type: BlockType
  slotId: string
  props?: {
    label?: string
    text?: string
    styleTier?: 1 | 2 | 3
    /** 区块级底色覆盖（仅 sectionBar / groupHeader 消费；hex，缺省 = 跟主题 primary） */
    color?: string
    /** Schema 1.3：横幅行右侧强调文本（仅 banner 消费） */
    bannerRight?: string
    /** Schema 1.5：banner 主文本色覆盖（黑底白字稿；hex） */
    bannerTextColor?: string
    /** Schema 1.5：banner 右侧文本色覆盖（hex） */
    bannerRightColor?: string
    [k: string]: unknown
  }
}

export interface BlockSlotDef {
  id: string
  accept: BlockType[]
  rowHint?: string
  region?: string
  mutexGroup?: string
  occupiedPolicy?: 'replace' | 'reject'
}

export interface LayoutSpec {
  rowCount: number
  colCount: number
  frozenColCount?: number
  merges?: MergeRange[]
  allowedMerges?: MergeRange[]
  structuralMerges?: MergeRange[]
  blockSlots: BlockSlotDef[]
  headerLevels?: 1 | 2 | 3
  /** Logical slot id per cell; null = not a writable slot */
  slotGrid?: (string | null)[][]
  /** Cells that are template-fixed (not editable / not emphasizable) */
  readonlyCells?: CellCoord[]
  /** Schema 1.1: columns eligible for the "recommended" badge; empty/absent = not supported */
  recommendableCols?: number[]
  /** Schema 1.1: slot used as the table caption in HTML export (FR-25) */
  captionSlot?: string
  /** schema 1.2：排版微调档位（缺省 = 全按预设默认） */
  style?: LayoutStyle
}

export type TemplateType = 'compare' | 'detail' | 'pricing' | 'matrix' | 'blank' | 'stat'

/**
 * Schema 1.3：页面海报层（表格外纸面设计：背景纹理 / 标题区 / 注脚 / 页码）。
 * 预览 DOM / PNG 合成 / HTML 导出三方同源消费（几何与内联样式单点在 core/theme/posterStyle.ts）。
 */
export interface PosterSpec {
  /** 纸面背景形态：solid 纯色 / dots 点纹 / ruled 横线 / gradient 渐变（缺省 solid） */
  bg?: 'solid' | 'dots' | 'ruled' | 'gradient'
  /** 纸面基色（hex；缺省 = 主题 paper） */
  bgColor?: string
  /** 纹理 / 渐变第二色（hex；dots/ruled 线色、gradient 终止色） */
  bgAccent?: string
  /** 英文眉标（kicker，字距加宽小字） */
  kicker?: string
  /** 大标题 */
  title?: string
  /** 副标题 */
  subtitle?: string
  /** 右上信息行（逐行） */
  metaLines?: string[]
  /** 底部注脚行（逐行） */
  footerLines?: string[]
  /** 页码徽标（如「01 / 08」，右下角） */
  pageBadge?: string
  /** 强调色（眉标 / 页码 / 标题点缀；hex；缺省 = 主题 emphasis） */
  accent?: string
  /** 标题字体族（sans / serif；缺省 sans） */
  titleFont?: 'sans' | 'serif'
  /** 标题区文字色（hex；缺省 = 主题 primary） */
  textColor?: string
  /** 纸面四周留白（px，缺省 40；钳制 16-80） */
  padding?: number
  /**
   * Schema 1.4：角部颜色洗（非均匀渐变）。在基色/渐变之上、点纹之下，
   * 按相对坐标铺径向渐变色斑（豆包稿典型的右上泛绿/左下泛暖）。上限 6 个。
   */
  bgWashes?: PosterWash[]
  /** Schema 1.5：标题下徽章卡（第 0 个黑底白字，其余白底描边；上限 6 个、每个 24 字） */
  chips?: string[]
  /** Schema 1.5：标题下无边框图例/说明行（muted 小字，如「■ 完成　□ 未完成　□ 今天」） */
  legend?: string
}

/** 径向颜色洗：x/y 为相对画布位置（0-1），r 为相对对角线半径（0-1，缺省 0.35） */
export interface PosterWash {
  /** 洗色（hex） */
  color: string
  /** 圆心 x（0-1） */
  x: number
  /** 圆心 y（0-1） */
  y: number
  /** 半径（0-1 相对对角线；缺省 0.35） */
  r?: number
}

/** Schema 1.2 扩展：表外 KPI 统计卡（hero 区一排等宽卡片，上限 6 张） */
export interface KpiCard {
  id: string
  label: string
  value: string | number
  unit?: string
  /** 强调卡：数值/边框走主题 emphasis 色、底色 emphasisSoft */
  accent?: boolean
  /** Schema 1.5：独立数值色（hex；strip 竖条/plain 数字/cards 数值同用） */
  color?: string
}

export interface TemplateMeta {
  displayName?: string
  description?: string
  templateType?: TemplateType
  origin?: 'preset' | 'user'
  sourceTemplateId?: string | null
  savedAt?: string | null
  /** Schema 1.5：模板封面图（导出 PNG 时自动生成的缩略 dataURL；库页卡片展示） */
  cover?: string
}

export interface TemplateInstance {
  schemaVersion: string
  templateId: string
  themeId: ThemeId | string
  themeTokens?: ThemeTokens
  slots: Record<string, SlotValue>
  blocks: BlockDesc[]
  layout: LayoutSpec
  meta?: TemplateMeta
  /** Schema 1.1: slot kind/format declarations; absent = all slots are plain text */
  slotDefs?: Record<string, SlotDef>
  /** Schema 1.1: at most one recommended column */
  highlight?: { recommendCol: number | null }
  /** Schema 1.2 扩展: 表外 KPI 统计卡（缺省/空数组 = 无卡片区，导出零占位） */
  kpiCards?: KpiCard[]
  /** Schema 1.3/1.5：统计卡形态（cards 卡片 / strip 细分隔条 / plain 无框大数字；缺省 cards） */
  kpiStyle?: 'cards' | 'strip' | 'plain'
  /** Schema 1.6：统计卡位置（top 表格上方 / bottom 表格下方；缺省 top） */
  kpiPosition?: 'top' | 'bottom'
  /** Schema 1.3：页面海报层（背景纹理 / 标题区 / 注脚 / 页码；缺省 = 无海报层，行为同 1.2） */
  poster?: PosterSpec
  /** Runtime: zebra on/off; defaults true when unset */
  zebraOn?: boolean
}

export type TemplateDefinition = TemplateInstance
export type TemplateJSON = TemplateInstance

export type EditIntent =
  | { kind: 'setSlot'; slotId: string; value: SlotValue }
  | { kind: 'setTheme'; themeId: ThemeId }
  | { kind: 'setZebra'; on: boolean }
  | { kind: 'merge'; range: MergeRange }
  | { kind: 'split'; range: MergeRange }
  /** WP3：清空选区内容（跳过只读格；与合并/拆分同为一步撤销） */
  | { kind: 'clearSlots'; range: MergeRange }
  | { kind: 'setAlign'; slotId: string; align: Align }
  | { kind: 'setEmphasis'; slotId: string; emphasize: Emphasis[] }
  | { kind: 'addBlock'; block: BlockDesc }
  | { kind: 'removeBlock'; blockId: string }
  | { kind: 'updateBlock'; blockId: string; props: Partial<NonNullable<BlockDesc['props']>> }
  /** WP4：表内区块换位（目标槽空 → 移动；已占用 → 两区块互换，双侧 accept 都要允许） */
  | { kind: 'moveBlock'; blockId: string; toSlotId: string }
  /** 增强期 FR-23：最多一列推荐；设新列即替换旧值，null 取消 */
  | { kind: 'setRecommendCol'; col: number | null }
  /** FR-C1 颜色覆盖：value=null 清除该角色覆盖（回到预设） */
  | { kind: 'setThemeToken'; token: RoleColorKey; value: string | null }
  | { kind: 'resetThemeTokens' }
  /** FR-C2 排版档位（width=null 恢复默认宽） */
  | { kind: 'setColWidth'; col: number; width: number | null }
  | { kind: 'setRowHeightTier'; tier: 1 | 2 | 3 | 4 }
  | { kind: 'setFontSizeTier'; tier: 1 | 2 | 3 }
  | { kind: 'setPaddingTier'; tier: 1 | 2 | 3 }
  /** FR-C3 结构编辑（全部按钮式；一次意图 = 一张撤销快照 = 一套 remap） */
  | { kind: 'addRow'; afterRow?: number }
  | { kind: 'removeRow'; row: number }
  | { kind: 'addCol'; afterCol?: number }
  | { kind: 'removeCol'; col: number }
  | { kind: 'setHeaderLevel'; levels: 1 | 2 | 3 }
  /** WP4：整行/整列换位（内容与合并区、只读格一起走；区块锚点按位置不动） */
  | { kind: 'moveRow'; from: number; to: number }
  | { kind: 'moveCol'; from: number; to: number }
  /** 灵活操作升级 T01：整块换位（区间一次置换一次校验，不拆单行拼批） */
  | { kind: 'moveRowBlock'; from: number; count: number; to: number }
  | { kind: 'moveColBlock'; from: number; count: number; to: number }
  /** Schema 1.2 扩展：KPI 统计卡（一次意图 = 一张撤销快照；上限 6 张） */
  | { kind: 'addKpiCard'; card: KpiCard }
  | { kind: 'updateKpiCard'; cardId: string; patch: Partial<Omit<KpiCard, 'id'>> }
  | { kind: 'removeKpiCard'; cardId: string }
  /** dir=-1 上移 / +1 下移（与相邻卡互换；越界拒绝） */
  | { kind: 'moveKpiCard'; cardId: string; dir: -1 | 1 }
  /** Schema 1.2 扩展：单元格条形格式（bar=null 清除，恢复纯文本格） */
  | { kind: 'setSlotBar'; slotId: string; bar: BarFormat | null }
  /** 分组行动态化：在 aboveRow 逻辑行上方插入一条分组/分区行（新槽位 + 区块，一次意图一张快照） */
  | { kind: 'addBlockRow'; aboveRow: number; type: 'sectionBar' | 'groupHeader'; text?: string }
  /** 分组行动态化：连槽位一起删除（仅 between-rows 槽；与 removeBlock 只删区块区分） */
  | { kind: 'removeBlockRow'; blockId: string }
  /** 分组行动态化：分组行上移/下移一格（改锚点；与相邻行间空位无冲突才允许） */
  | { kind: 'moveBlockRow'; blockId: string; dir: -1 | 1 }
  /** 表名编辑：有 captionSlot 写槽（预览行同步），否则写 meta.displayName（导出用） */
  | { kind: 'setCaption'; text: string }
  /** Schema 1.5：整包更新海报层（面板海报组逐字段编辑，一次意图一张撤销快照） */
  | { kind: 'setPoster'; poster: PosterSpec }
  /** Schema 1.5：表格形态部分合并（字体族/边框方案/表头形状/药丸内缩等；一次意图一张快照） */
  | { kind: 'setStylePatch'; patch: Partial<LayoutStyle> }
  /** Schema 1.6：统计卡位置（top 表格上方 / bottom 表格下方） */
  | { kind: 'setKpiPosition'; position: 'top' | 'bottom' }

/** E3 多次撤销：撤销/重做栈深上限（入栈超限裁掉最旧一条，恒定内存上界） */
export const UNDO_LIMITS = { maxDepth: 50 } as const

export interface EditorState {
  current: TemplateInstance
  /** E3：撤销快照栈（栈顶 = 最近一步操作前状态）；每次新意图 push，coalesce 会话内不 push */
  undoStack: TemplateInstance[]
  /** E3：重做快照栈（栈顶 = 最近一次被撤销的状态）；新操作即清空 */
  redoStack: TemplateInstance[]
  dirty: boolean
  version: number
  /** 粘贴预览期间为 true：合并/拆分/对齐/强调/区块等编辑意图一律被拒（FR-17） */
  pastePending?: boolean
}

export type RenderState = 'loading' | 'ready' | 'error'
/** 预加载后的可绘制图片资源（data URL → 资源表）；由壳层 CoreHost 与 PNG 导出各自注入 */
export interface ImageAsset {
  naturalWidth: number
  naturalHeight: number
}
export type RenderContext = {
  mode: 'preview' | 'export'
  transparentUnderlay?: boolean
  /** 图片资源表（键 = data URL）；缺省时含图格走默认绘制（资源未就绪） */
  images?: Map<string, ImageAsset>
}

export interface PngExportOptions {
  /** P4：倍率放宽为连续区间 0.5–4（原 1/2/3 三档） */
  scale?: number
  transparent?: boolean
  maxPixels?: number
}

export interface CoreOptions {
  initial?: TemplateJSON
  blockSlotPolicy?: 'replace' | 'reject'
  onError?: (err: import('./errors').CoreError) => void
  onRenderState?: (s: RenderState) => void
}

/** 可视格矩形（相对预览容器左上角；已含滚动与冻结列补偿） */
export interface ViewportRect {
  left: number
  top: number
  width: number
  height: number
}

/** 命中结果：可视行列（列 = 列号，行 = 可视行，与 buildVisualRows 的 metas 同索引） */
export interface ViewportHit {
  row: number
  col: number
}

export interface CoreHandle {
  loadTemplate(json: TemplateJSON): void
  applyTheme(themeId: string | ThemeTokens): void
  setSlot(slotId: string, value: SlotValue): void
  addBlock(block: BlockDesc): void
  removeBlock(blockId: string): void
  exportHtml(): Promise<string>
  exportPng(opts?: PngExportOptions): Promise<Blob>
  getPreviewEl(): HTMLElement | null
  /**
   * PX-04 v2「命中直接问渲染器」：(x, y) 相对预览容器左上角，内部换算到画布坐标后交给
   * VTable 命中（滚动 / 冻结列 / 列宽调整感知）。未挂载或落在表外返回 null。
   */
  hitTest(x: number, y: number): ViewportHit | null
  /** 单格可视矩形（相对预览容器左上角）；未挂载返回 null */
  getCellViewportRect(visualRow: number, col: number): ViewportRect | null
  /** 整表可视格矩形（相对预览容器左上角；行 = 可视行，与 metas 同索引）；未挂载返回 null */
  getCellViewportRects(): ViewportRect[][] | null
  /** 视口变化（滚动 / 列宽调整 / 重绘完成）订阅；返回退订函数 */
  onViewportChange(cb: () => void): () => void
  /** 列宽拖拽结束（widths = 全量列宽，画布内调整、未落模型）；返回退订函数 */
  onColResize(cb: (col: number, widths: number[]) => void): () => void
  destroy(): void
}
