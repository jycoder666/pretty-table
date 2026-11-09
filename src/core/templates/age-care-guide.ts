import type { TemplateInstance } from '../types'
import { footerSlot } from './blockSlotHelpers'

/**
 * need_00 · 各年龄段保障配置（保险模板套件 TP01；内容与结构均为
 * 「增量设计-保险模板套件-2026-11-06」A3-1 转写逐字口径，detail 类范式 compare-alpha-v1）：
 * 4 列 × 10 行（R0 满宽标题 + R1 列头 + 8 数据行），首列 4 组人群标签纵向合并（各跨 2 行）。
 * 近似口径（A2 / A3-1 已披露，实现不再增删改）：
 * ① 7 处清单内单项红标注（R3「①少儿医保」、R4「①大学生医保」、R7「必备保障：/根据预算考虑：」
 *   前缀、R8/R9「③防癌险」等）全部放弃红字——整格红会把并列项一起染红；
 * ② 清单多行 → 单行空格串接（①②③④ 用空格串接）；
 * ③ 首列深蓝底白字 → label 角色白底加粗（c===0 自动 label）；
 * ④ 副题「深蓝保 专注保险评测」无表内通道 → 移 meta.description；
 * ⑤ 成品语义表：不设 allowedMerges（用户合并全禁），不发区块实例（footer 槽空置不占行）。
 */
export const AGE_CARE_GUIDE: TemplateInstance = {
  schemaVersion: '1.2',
  templateId: 'age-care-guide',
  themeId: 'T-A',
  zebraOn: true,
  slotDefs: {},
  highlight: { recommendCol: null },
  meta: {
    displayName: '各年龄段保障配置',
    description: '深蓝保 专注保险评测',
    templateType: 'detail',
    origin: 'preset',
  },
  slots: {
    'age.title': '0岁小孩-80岁各年龄段保障配置方案',
    // R1 列头
    'age.h.audience': '人群',
    'age.h.stage': '年龄段',
    'age.h.risk': '主要防范风险',
    'age.h.plan': '配置方案建议',
    // R2–R9 数据行（首列组标签只在组首行锚点，覆盖格 null 无槽）
    'age.r2.audience': '未成年人',
    'age.r2.stage': '0~5岁 新生儿、婴幼儿',
    'age.r2.risk': '小病小痛、重大疾病',
    'age.r2.plan': '①少儿医保 ②少儿重疾险 ③小额医疗险 ④百万医疗险',
    'age.r3.stage': '6~17岁 青少年、学生群体',
    'age.r3.risk': '小病小痛、重大疾病、意外伤害',
    'age.r3.plan': '①少儿医保 ②少儿重疾险 ③百万医疗险 ④学平险或小额医疗险 ⑤少儿意外险',
    'age.r4.audience': '青年阶段',
    'age.r4.stage': '18~25岁 大学生群体、初入社会',
    'age.r4.risk': '重大疾病、意外伤害',
    'age.r4.plan': '①大学生医保 ②一年期/短期重疾险（过渡） ③百万医疗险 ④成人综合意外险',
    'age.r5.stage': '26~35岁 新晋家庭顶梁柱 成家立业',
    'age.r5.risk': '重大疾病、意外伤害、早逝',
    'age.r5.plan': '①保长期/终身重疾险 ②百万医疗险 ③成人综合意外险 ④定期寿险',
    'age.r6.audience': '中年阶段',
    'age.r6.stage': '36~50岁 家庭稳定、事业成熟期',
    'age.r6.risk': '重大疾病、意外伤害、早逝、养老风险',
    'age.r6.plan': '①保长期/终身重疾险 ②长期百万医疗险 ③成人综合意外险 ④高额额定寿 ⑤增额终身寿、或养老年金',
    'age.r7.stage': '51~60岁 中老年疾病高发期 健康隐患增多',
    'age.r7.risk': '重大疾病、意外事故、死亡、养老风险',
    'age.r7.plan':
      '必备保障：①保证续保的长期医疗险 百万医疗险、或防癌医疗险 ②成人综合意外险 根据预算考虑：③防癌险 ④定期寿险',
    'age.r8.audience': '老年阶段',
    'age.r8.stage': '61~70岁 退休养老、卸去家庭责任重担',
    'age.r8.risk': '意外伤害、重大疾病',
    'age.r8.plan': '①百万医疗险/防癌医疗险/惠民保，视情况选择 ②老人意外险 根据预算考虑：③防癌险',
    'age.r9.stage': '71~80岁 高龄老人',
    'age.r9.risk': '意外伤害、重大疾病',
    'age.r9.plan': '①惠民保 ②老人意外险 根据预算考虑：③防癌险',
  },
  blocks: [],
  layout: {
    rowCount: 10,
    colCount: 4,
    headerLevels: 2,
    captionSlot: 'age.title',
    style: { colWidths: [96, 150, 170, 330] },
    merges: [],
    // 骨架合并全部锁定：标题满宽 + 4 组人群标签各跨 2 行（覆盖格 null）
    structuralMerges: [
      { start: [0, 0], end: [0, 3] },
      { start: [2, 0], end: [3, 0] },
      { start: [4, 0], end: [5, 0] },
      { start: [6, 0], end: [7, 0] },
      { start: [8, 0], end: [9, 0] },
    ],
    // 成品语义表：不设 allowedMerges（用户合并全禁，与 pricing-v1「不做用户合并」同口径）
    blockSlots: [
      // footer 槽空置不占行（不发 emphFooter 区块实例）；全部不配 leftTag（A2-①）
      footerSlot(9),
    ],
    slotGrid: [
      // R0 表名（合并锁定、文字可改；覆盖格重复标题槽 id，pricing-v1.ts:206 先例）
      ['age.title', 'age.title', 'age.title', 'age.title'],
      // R1 列头
      ['age.h.audience', 'age.h.stage', 'age.h.risk', 'age.h.plan'],
      // R2–R3 未成年人
      ['age.r2.audience', 'age.r2.stage', 'age.r2.risk', 'age.r2.plan'],
      [null, 'age.r3.stage', 'age.r3.risk', 'age.r3.plan'],
      // R4–R5 青年阶段
      ['age.r4.audience', 'age.r4.stage', 'age.r4.risk', 'age.r4.plan'],
      [null, 'age.r5.stage', 'age.r5.risk', 'age.r5.plan'],
      // R6–R7 中年阶段
      ['age.r6.audience', 'age.r6.stage', 'age.r6.risk', 'age.r6.plan'],
      [null, 'age.r7.stage', 'age.r7.risk', 'age.r7.plan'],
      // R8–R9 老年阶段
      ['age.r8.audience', 'age.r8.stage', 'age.r8.risk', 'age.r8.plan'],
      [null, 'age.r9.stage', 'age.r9.risk', 'age.r9.plan'],
    ],
  },
}
