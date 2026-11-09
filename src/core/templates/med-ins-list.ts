import type { TemplateInstance } from '../types'
import { footerSlot } from './blockSlotHelpers'

/**
 * 保险模板套件 need_01 · 百万医疗险热门清单（detail）— schema 1.2
 * 依据：docs/06-upgrade/增量设计-保险模板套件-2026-11-06.md A3-2（内容逐字转写）。
 * 2 列 × 17 行：R0 标题跨 2 列（captionSlot + structural 锁定合并，文字可改）+
 * R1 列头（保险公司/产品名称）+ 15 行产品清单。斑马为主视觉；首列走 c===0 自动
 * label 角色（白底加粗）。不设 merges/allowedMerges（成品语义表，用户合并全禁，
 * 与 pricing-v1 同口径）；区块槽只配 footerSlot(16)，不发 footer 区块实例、不配
 * leftTag（A2-① 统一近似口径）。
 * 近似披露：① 样图首列深蓝底白字 → 白底加粗（label 角色）；② 「·」分隔为转写
 * 「保险公司·产品名」拆列后的自然形态，原文案逐字保留在两列中。
 */
export const MED_INS_LIST: TemplateInstance = {
  schemaVersion: '1.2',
  templateId: 'med-ins-list',
  themeId: 'T-A',
  zebraOn: true,
  // 全部为纯文本槽（B4 slotDefs 省用口径：清单无 mark/number 需求，不开 defs 控增量）
  slotDefs: {},
  highlight: { recommendCol: null },
  meta: {
    displayName: '百万医疗险热门清单',
    description: '2026最新15款百万医疗险热门清单，保险公司与产品名称两列',
    templateType: 'detail',
    origin: 'preset',
  },
  slots: {
    'med.title': '2026最新15款百万医疗险热门清单',
    'med.h.company': '保险公司',
    'med.h.product': '产品名称',
    // ── 15 款产品（R2–R16，A3-2 转写逐字）──
    'med.r2.company': '太平洋健康险',
    'med.r2.product': '蓝医保（好医好药0免赔）',
    'med.r3.company': '太平洋健康险',
    'med.r3.product': '蓝医保（好医好药版）',
    'med.r4.company': '太平洋健康险',
    'med.r4.product': '蓝医保长期医疗险',
    'med.r5.company': '人保寿险',
    'med.r5.product': '金医保3号',
    'med.r6.company': '复星联合健康',
    'med.r6.product': '星相守2号',
    'med.r7.company': '复星联合健康',
    'med.r7.product': '超越保（长久版）',
    'med.r8.company': '平安健康',
    'med.r8.product': '长相安2号',
    'med.r9.company': '人保健康',
    'med.r9.product': '好医保长期医疗险（旗舰版2026）',
    'med.r10.company': '人保财险',
    'med.r10.product': '长相安5号（免健告）',
    'med.r11.company': '太平洋健康险',
    'med.r11.product': '微医保·长期医疗险',
    'med.r12.company': '泰康在线',
    'med.r12.product': '微医保·百万医疗险（1年期）',
    'med.r13.company': '泰康在线',
    'med.r13.product': '微医保·百万医疗险（普惠版）',
    'med.r14.company': '众安在线财险',
    'med.r14.product': '众民保·百万医疗险2026',
    'med.r15.company': '众安在线财险',
    'med.r15.product': '尊享e生2026',
    'med.r16.company': '中国人寿财险',
    'med.r16.product': '惠享保（免健告）',
  },
  blocks: [],
  layout: {
    rowCount: 17,
    colCount: 2,
    headerLevels: 2,
    captionSlot: 'med.title',
    // 标题行锁定合并（structural：用户不可拆/不可覆盖，mergeGuard 语义）；
    // 不设 merges / allowedMerges（B4 约定：8 张全部不设，用户合并全禁）
    structuralMerges: [{ start: [0, 0], end: [0, 1] }],
    blockSlots: [
      // footer 槽空置不发区块实例（不占行）；不配 leftTag（A2-①）
      footerSlot(16),
    ],
    style: { colWidths: [150, 210] },
    slotGrid: [
      // R0 标题（合并锁定，覆盖格重复标题槽 id，pricing-v1.ts:206 模式）
      ['med.title', 'med.title'],
      // R1 列头
      ['med.h.company', 'med.h.product'],
      // R2–R16 15 款产品
      ['med.r2.company', 'med.r2.product'],
      ['med.r3.company', 'med.r3.product'],
      ['med.r4.company', 'med.r4.product'],
      ['med.r5.company', 'med.r5.product'],
      ['med.r6.company', 'med.r6.product'],
      ['med.r7.company', 'med.r7.product'],
      ['med.r8.company', 'med.r8.product'],
      ['med.r9.company', 'med.r9.product'],
      ['med.r10.company', 'med.r10.product'],
      ['med.r11.company', 'med.r11.product'],
      ['med.r12.company', 'med.r12.product'],
      ['med.r13.company', 'med.r13.product'],
      ['med.r14.company', 'med.r14.product'],
      ['med.r15.company', 'med.r15.product'],
      ['med.r16.company', 'med.r16.product'],
    ],
  },
}
