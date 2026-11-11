// 生成「年度体检 · 指标解读」1:1 复刻实例 JSON v5（视觉复核三轮修正，2026-11-10）
// 相对 v4 的修正（视觉对照员 8 条差距）：
//   ① 数据行渲染实证：verify 截图改视口口径 + 新增 mid 段截图（滚动后行 6-11 实拍；
//      之前全页截图停在滚动 0 位，虚拟滚动窗口外呈空白——伪影而非缺行）
//   ② 注脚两栏近对半：左 [r,0]-[r,1] / 右 [r,2]-[r,4]（46/54，样图 48/52），右栏①②③还原单行
//   ③ 注脚区无横线：gridLines 'rows' 的行线随 zebraRange 限定数据区（通道调整），表底无线
//   ④ 紧凑行高：LayoutStyle.rowHeights 逐行行高（通道新增，与 colWidths 对称）+ paddingTier 2
//   ⑤ 列宽微调 [205,160,160,110,155]（注脚左栏容下②单行）
// 结构（16 个 slotGrid 行）：R0 眉标(合并5) / R1 标题[1,0]-[1,2]+日期[1,3]-[1,4] / R2 汇总带三段 /
//   R3 列头 / R4~R10 七项指标 / R11 两栏标签 / R12~R14 ①②③ / R15 免责[15,0]-[15,3]+页码[15,4]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const seed = JSON.parse(readFileSync(resolve(process.cwd(), 'tables/年度体检·指标解读.json'), 'utf8'))

const COLS = 5
const ROWS = 16
let n = 0
const slots = {}
const S = (text, emphasize, align) => {
  n += 1
  const id = `s${n}`
  slots[id] = { text, ...(align ? { align } : {}), ...(emphasize ? { emphasize } : {}) }
  return id
}

// R0 眉标（合并 5 列，青绿小字；字符间空格模拟字距）
const eyebrowId = S('H E A L T H   C H E C K  ·  K E Y   I N D I C A T O R S', ['green'])
// R1 标题（衬线 26px 加粗，白底深墨绿）+ 右侧日期/编号独立格（\n 双行，弱化灰，右对齐）
const titleId = S('年度体检 · 指标解读', ['serif', 'display', 'bold'])
const dateId = S('检测日期 2026.04.18\n报告编号 HC-2026-0418', ['muted'], 'right')
// R2 汇总带三段（列头之上，对齐样图）：左竖条+深色粗体结论 / 灰色说明 / 青绿粗体右置
const bandLeadId = S('7 项指标中 4 项偏高', ['bar', 'bold', 'bg'])
const bandNoteId = S('均为生活方式相关，未提示器质性异常', ['muted', 'bg'])
const bandTailId = S('建议 3 个月后复查', ['green', 'bold', 'bg'], 'right')
// R3 列头（body 行：常规字重弱化灰 + 下缘重强调线，对齐样图）
const head = ['指标 / ITEM', '本次结果', '参考区间', '状态', '建议'].map((t) => S(t, ['muted', 'rule']))
// R4~R10 七项指标（名称加粗；数值衬线；状态：偏高=琥珀红+粗，正常=青绿）
const DATA = [
  ['血压 BP', '128 / 82 mmHg', '< 120 / 80', '● 偏高', '限盐、每周 3 次有氧', true],
  ['空腹血糖 GLU', '5.9 mmol/L', '3.9 – 6.1', '● 正常', '保持现有饮食结构', false],
  ['总胆固醇 TC', '5.8 mmol/L', '< 5.2', '● 偏高', '减少动物油脂，\n3 个月复查', true],
  ['尿酸 UA', '468 µmol/L', '208 – 428', '● 偏高', '少喝含糖饮料与啤酒', true],
  ['体质指数 BMI', '24.6 kg/m²', '18.5 – 23.9', '● 偏高', '减重 3–5 公斤更稳妥', true],
  ['血红蛋白 HGB', '148 g/L', '130 – 175', '● 正常', '无需干预', false],
  ['谷丙转氨酶 ALT', '32 U/L', '9 – 50', '● 正常', '无需干预', false],
]
const dataRows = DATA.map(([a, b, c, d, e, hot]) => [
  S(a, ['bold']),
  S(b, ['serif']),
  S(c),
  S(d, hot ? ['red', 'bold'] : ['green']),
  S(e),
])
// R11 两栏标签行（需要跟进=琥珀 / 保持项目=青绿，对齐样图）；R12~R14 ①②③ 逐行
const FOLLOW = [
  '需要跟进',
  '① 收缩压与舒张压同时接近上限，先做家庭自测记录。',
  '② 血脂与尿酸偏高的组合，和体重、饮酒频度高度相关。',
  '③ 建议 3 个月后复查血脂、尿酸与肝功能三项。',
]
const KEEP = [
  '保持项目',
  '① 血糖、血红蛋白、转氨酶均在区间内，无需额外用药。',
  '② 睡眠与运动频率是这几项维持的主要因素。',
  '③ 下一次体检沿用同一机构，便于纵向对比数值。',
]
const labelL = S(FOLLOW[0], ['red', 'bold'])
const labelR = S(KEEP[0], ['green', 'bold'])
// 合并锚点对齐：左 [r,0]-[r,1] 锚 0，右 [r,2]-[r,4] 锚 2 —— 槽位排布 [l,l,r,r,r]
const labelRow = [labelL, labelL, labelR, labelR, labelR]
const noteRows = [1, 2, 3].map((k) => {
  const l = S(FOLLOW[k])
  const r = S(KEEP[k])
  return [l, l, r, r, r]
})
// R15 免责声明（\n 双行，弱化灰）+ 右下角页码
const discId = S(
  '参考区间采用常见成人标准区间，不同实验室略有差异。\n示例样张 · 数值仅作样张示意，不构成医学诊断，请以医生意见为准。',
  ['muted'],
)
const pageNoId = S('07 / 08', ['muted'], 'right')

const slotGrid = [
  Array(5).fill(eyebrowId),
  [titleId, titleId, titleId, dateId, dateId],
  [bandLeadId, bandNoteId, bandNoteId, bandNoteId, bandTailId],
  head,
  ...dataRows,
  labelRow,
  ...noteRows,
  [discId, discId, discId, discId, pageNoId],
]
if (slotGrid.length !== ROWS) throw new Error(`slotGrid ${slotGrid.length} != ${ROWS}`)

const inst = {
  ...seed,
  templateId: 'user-1794016568816-u5cjn',
  themeId: seed.themeId,
  zebraOn: true,
  highlight: { recommendCol: null },
  // 白底表头 trick（primary=白）+ 深墨绿表头字；浅临床纸面 + 极浅斑马 + 琥珀/青绿语义色；
  // emphasisSoft = 汇总带浅灰绿底（'bg' mark 消费，v4 补开的 token 覆盖）
  themeTokens: {
    primary: '#ffffff',
    headerText: '#1f3a33',
    background: '#f9fbf9',
    zebra: '#f0f4f1',
    emphasis: '#c9762b',
    success: '#0e9f6e',
    border: '#d9e2dc',
    tag: '#e6efe9',
    emphasisSoft: '#edf1ee',
  },
  meta: {
    displayName: '年度体检 · 指标解读',
    description:
      '样图 1:1 复刻 v4（覆盖种子卡）：眉标/标题两行表头 + 汇总带三段（左竖条，列头之上）+ 列头重强调线 + 横线式无竖线网格 + 数据行斑马 + 跟进/保持两栏 + 免责声明与页码（16 行 5 列）',
    templateType: 'blank',
    origin: 'user',
    sourceTemplateId: seed.meta.sourceTemplateId,
    savedAt: new Date().toISOString(),
  },
  slots,
  blocks: [],
  layout: {
    ...seed.layout,
    rowCount: ROWS,
    colCount: COLS,
    headerLevels: 2,
    merges: [
      { start: [0, 0], end: [0, 4] }, // 眉标
      { start: [1, 0], end: [1, 2] }, // 标题（[1,3]-[1,4] 日期格合并，右对齐双行不折行）
      { start: [1, 3], end: [1, 4] },
      { start: [2, 1], end: [2, 3] }, // 汇总带说明段（结论/右段独立格）
      ...[11, 12, 13, 14].flatMap((r) => [
        { start: [r, 0], end: [r, 1] }, // 左栏（跟进）——列界 46%，样图右栏起点 52% 的最近界
        { start: [r, 2], end: [r, 4] }, // 右栏（保持）——近对半，①②③单行
      ]),
      { start: [15, 0], end: [15, 3] }, // 免责声明（[15,4] 页码独立）
    ],
    structuralMerges: [],
    allowedMerges: [{ start: [0, 0], end: [ROWS - 1, COLS - 1] }],
    blockSlots: [],
    slotGrid,
    // 列宽按样图五列比例（注脚左栏 [0,1] 合并需容下②单行）；gridLines 'rows' = 横线式无竖线
    // 网格且行线限定 zebraRange 数据区；zebraRange [4,10] = 斑马/横线只作用于七行数据行；
    // rowHeights 逐行紧凑行高（样图比例：眉标40/标题84/汇总带52/列头42/数据86/注脚42/免责62）
    style: {
      colWidths: [205, 160, 160, 110, 155],
      rowHeights: [40, 84, 52, 42, 86, 86, 86, 86, 86, 86, 86, 42, 42, 42, 42, 62],
      rowHeightTier: 4,
      fontSizeTier: 2,
      paddingTier: 2,
      gridLines: 'rows',
      zebraRange: [4, 10],
    },
  },
}

const outDir = resolve(process.cwd(), 'reports/hc-replica-20261109')
mkdirSync(outDir, { recursive: true })
const out = resolve(outDir, '年度体检·指标解读-1比1.json')
writeFileSync(out, JSON.stringify(inst, null, 2), 'utf8')
console.log('written:', out, '| slots:', n, '| rows:', ROWS, 'cols:', COLS)
