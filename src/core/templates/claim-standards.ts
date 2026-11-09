import type { TemplateInstance } from '../types'
import { footerSlot } from './blockSlotHelpers'

/**
 * 保险模板套件 need_05 · 重疾理赔标准（detail）— schema 1.2
 * 内容转写权威：docs/06-upgrade/增量设计-保险模板套件-2026-11-06.md A3-6（逐字采用）。
 *
 * 3 列 × 12 逻辑行：R0 标题（跨 3 列 captionSlot）+ R1 带1 header 行近似（跨 3 列）+
 * R2–R11 共 10 数据行（28 种病名：标准一 3 种 / 标准二 6 种 / 标准3 19 种，3+6+19=28）；
 * 带2 / 带3 = 区块行 after-2 / after-4（sectionBar），可见行 = 12 + 2 = 14 ≤ 20。
 *
 * 近似披露（A2 / A3-6 / A6-7）：
 * ① 三条跨全宽带：带1 用 header 行近似（表顶锚点不可用，A2-⑤）；带2/带3 用 sectionBar
 *   （props.label，主色整行）——样图三条带同为蓝色，与「区块恒主色」天然一致；
 * ② 「标准3：」为原文用字（中文数字混用），逐字保留、不改写为「标准三」（A6-7）；
 * ③ 末行「严重脑炎后遗症或严重脑膜炎后遗症」横跨 3 列（structuralMerge，覆盖格填 null，
 *   compare-alpha-v1.ts / matrix-v1.ts 先例；标题/带1 覆盖格重复槽 id，pricing-v1.ts:206 先例）。
 * 不设 merges/allowedMerges（B4 通用约定：8 张成品语义表缺省 = 用户合并全禁）；
 * 不配 leftTag 槽（A2-①：首列为数据列，leftTag 会把文字搬进区块 props 遮蔽槽值）；
 * 全部为纯文本槽（无 slotDefs 面）；footerSlot(11) 空置不占行（不发 footer 区块实例）。
 */
export const CLAIM_STANDARDS: TemplateInstance = {
  schemaVersion: '1.2',
  templateId: 'claim-standards',
  themeId: 'T-A',
  zebraOn: true,
  highlight: { recommendCol: null },
  meta: {
    displayName: '重疾理赔标准',
    description: '重疾险 28 种必保重疾理赔标准：确诊即赔 3 种 / 做了某种手术即赔 6 种 / 达到疾病约定的状态即赔 19 种',
    templateType: 'detail',
    origin: 'preset',
  },
  slots: {
    'claim.title': '重疾险28种必保重疾理赔标准',
    // 带1（R1 header 行近似）
    'claim.band1': '标准一：确诊即赔（3种）',
    // ── 标准一：确诊即赔（R2，3 种）──
    'claim.d1': '恶性肿瘤-重度',
    'claim.d2': '严重Ⅲ度烧伤',
    'claim.d3': '多个肢体缺失',
    // ── 标准二：做了某种手术即赔（R3–R4，6 种）──
    'claim.d4': '重大器官移植术或造血干细胞移植术',
    'claim.d5': '严重非恶性颅内肿瘤',
    'claim.d6': '主动脉手术',
    'claim.d7': '冠状动脉搭桥术',
    'claim.d8': '心脏瓣膜手术',
    'claim.d9': '严重溃疡性结肠炎',
    // ── 标准3：达到疾病约定的状态即赔（R5–R11，19 种）──
    'claim.d10': '较重急性心肌梗死',
    'claim.d11': '严重脑中风后遗症',
    'claim.d12': '严重阿尔茨海默病',
    'claim.d13': '严重克雅氏病',
    'claim.d14': '急性重症肝炎或亚急性重症肝炎',
    'claim.d15': '严重原发性帕金森病',
    'claim.d16': '严重慢性肾衰竭',
    'claim.d17': '严重慢性肝衰竭',
    'claim.d18': '严重运动神经元病',
    'claim.d19': '深度昏迷',
    'claim.d20': '瘫痪',
    'claim.d21': '重型再生障碍性贫血',
    'claim.d22': '双耳失聪',
    'claim.d23': '双目失明',
    'claim.d24': '严重脑损伤',
    'claim.d25': '语言能力丧失',
    'claim.d26': '严重慢性呼吸衰竭',
    'claim.d27': '严重原发性肺动脉高压',
    'claim.d28': '严重脑炎后遗症或严重脑膜炎后遗症',
  },
  blocks: [
    {
      // 带2（after-2 区块行）：整行主色，label 消费于 toOption / HTML 导出 th colspan
      id: 'preset-b2',
      type: 'sectionBar',
      slotId: 'gap-b2',
      props: { label: '标准二：做了某种手术即赔（6种）', styleTier: 2 },
    },
    {
      // 带3（after-4 区块行）：「标准3」原文用字逐字保留（A6-7）
      id: 'preset-b3',
      type: 'sectionBar',
      slotId: 'gap-b3',
      props: { label: '标准3：达到疾病约定的状态即赔（19种）', styleTier: 2 },
    },
  ],
  layout: {
    rowCount: 12,
    colCount: 3,
    headerLevels: 2,
    recommendableCols: [],
    captionSlot: 'claim.title',
    // 8 张保险模板全不设 merges/allowedMerges：缺省 = 用户合并全禁（B4，成品语义表）
    structuralMerges: [
      { start: [0, 0], end: [0, 2] }, // R0 标题（覆盖格重复标题槽 id，pricing-v1 先例）
      { start: [1, 0], end: [1, 2] }, // R1 带1
      { start: [11, 0], end: [11, 2] }, // 末行「严重脑炎后遗症或严重脑膜炎后遗症」横跨 3 列
    ],
    blockSlots: [
      {
        id: 'gap-b2',
        accept: ['sectionBar', 'groupHeader'],
        region: 'between-rows',
        mutexGroup: 'b2',
        rowHint: 'after-2',
      },
      {
        id: 'gap-b3',
        accept: ['sectionBar', 'groupHeader'],
        region: 'between-rows',
        mutexGroup: 'b3',
        rowHint: 'after-4',
      },
      // 表底注脚槽（不发 footer 区块实例，空置不占行）；不配 leftTag 槽（披露见头注）
      footerSlot(11),
    ],
    // 列宽 [216,216,216]（A3-6 建议值；钳制 64–360）
    style: {
      colWidths: [216, 216, 216],
    },
    slotGrid: [
      // R0 标题（合并锁定，文字可改；覆盖格重复标题槽 id）
      ['claim.title', 'claim.title', 'claim.title'],
      // R1 带1 header 行近似（合并锁定）
      ['claim.band1', 'claim.band1', 'claim.band1'],
      // R2 标准一（3 种）
      ['claim.d1', 'claim.d2', 'claim.d3'],
      // R3–R4 标准二（6 种）
      ['claim.d4', 'claim.d5', 'claim.d6'],
      ['claim.d7', 'claim.d8', 'claim.d9'],
      // R5–R10 标准3（18 种，末种横跨 R11）
      ['claim.d10', 'claim.d11', 'claim.d12'],
      ['claim.d13', 'claim.d14', 'claim.d15'],
      ['claim.d16', 'claim.d17', 'claim.d18'],
      ['claim.d19', 'claim.d20', 'claim.d21'],
      ['claim.d22', 'claim.d23', 'claim.d24'],
      ['claim.d25', 'claim.d26', 'claim.d27'],
      // R11 末种横跨 3 列（structuralMerge [11,0]-[11,2]，覆盖格填 null）
      ['claim.d28', null, null],
    ],
  },
}
