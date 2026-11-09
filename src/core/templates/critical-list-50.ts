import type { TemplateInstance } from '../types'
import { footerSlot } from './blockSlotHelpers'

/**
 * need_06 · 重疾险产品汇总（保险模板套件 TP07；内容与结构均为
 * 「增量设计-保险模板套件-2026-11-06」A3-7 转写逐字口径，detail 类范式 pricing-v1）：
 * 3 列 × 20 行满载（R0 表头 + 成人重疾险 12 行 + 少儿重疾险 7 行），无标题行；
 * 首列 2 个模板自带纵向大合并：[1,0]-[12,0]（成人重疾险，跨 12 行）、[13,0]-[19,0]（少儿重疾险，跨 7 行）。
 * 近似口径（A2 / A3-7 近似披露，实现不再增删改）：
 * ① 首列深蓝底标签 + 第二列蓝底芯片 → 均为白底加粗（首列 c===0 自动 label 角色、
 *   第二列每格槽值 emphasize:['bold']）；
 * ② 无标题行：20 行满载装不下标题（原「2026年·最新50款重疾险产品汇总」不入表），
 *   标题由库卡 displayName（压缩名）/ description（原名）承载；
 * ③ canAddRow 置灰：20 行已满（LIMITS.maxRows=20，structure.ts doAddRow 在加行前拒），
 *   可加列（3 < 12）；
 * ④ 50 款 → 实展 31 款（成人 12 公司行 22 款 + 少儿 7 公司行 9 款），逐字全保留（压缩版，主控转写口径）；
 * ⑤ 大跨度合并不受 6/8/30 用户闸：canMerge 只闸用户意图（intent.ts / 壳层 useMergeGates），
 *   validate/migrate/openTemplate 均不校验模板 merges（mergeGuard 实读一致）；
 * ⑥ 成品语义表：不设 merges/allowedMerges（用户合并全禁，与 pricing-v1 同口径），
 *   不发区块实例（footer 槽空置不占行，toOption.ts:247 口径）。
 */
export const CRITICAL_LIST_50: TemplateInstance = {
  schemaVersion: '1.2',
  templateId: 'critical-list-50',
  themeId: 'T-A',
  zebraOn: true,
  slotDefs: {},
  highlight: { recommendCol: null },
  meta: {
    displayName: '重疾险产品汇总',
    // 原标题不入表（A3-7 披露②）：压缩名走 displayName，原名逐字落 description 承载
    description: '2026年·最新50款重疾险产品汇总',
    templateType: 'detail',
    origin: 'preset',
  },
  slots: {
    // R0 表头（headerLevels:1，唯一表头行）
    'crit.h.cat': '产品类别',
    'crit.h.co': '保险公司',
    'crit.h.prod': '产品名称',
    // ── 成人重疾险（R1–R12，锚点 R1:C0，跨 12 行；覆盖格 null 无槽）──
    'crit.r1.cat': '成人重疾险',
    'crit.r1.co': { text: '复星联合健康', emphasize: ['bold'] },
    'crit.r1.prod': '达尔文12号、医联联盟、完美人生8号、康乐福、康乐一生2026',
    'crit.r2.co': { text: '君龙人寿', emphasize: ['bold'] },
    'crit.r2.prod': '超级玛丽16号Pro',
    'crit.r3.co': { text: '海保人寿', emphasize: ['bold'] },
    'crit.r3.prod': '哪吒2号',
    'crit.r4.co': { text: '瑞华保险', emphasize: ['bold'] },
    'crit.r4.prod': '达尔文超越版12号、吉祥瑞5.0、华佗1号（康泰版）',
    'crit.r5.co': { text: '信泰人寿', emphasize: ['bold'] },
    'crit.r5.prod': '及时雨2026重大疾病保险',
    'crit.r6.co': { text: '众安保险', emphasize: ['bold'] },
    'crit.r6.prod': '众民保重疾险、尊享e生重疾险',
    'crit.r7.co': { text: '中华保险', emphasize: ['bold'] },
    'crit.r7.prod': '蓝海2号重疾险',
    'crit.r8.co': { text: '平安保险', emphasize: ['bold'] },
    'crit.r8.prod': '安佑福全能、守卫百分百26、爱满分26',
    'crit.r9.co': { text: '太平洋保险', emphasize: ['bold'] },
    'crit.r9.prod': '金生无忧2025、阿基米德2025',
    'crit.r10.co': { text: '新华保险', emphasize: ['bold'] },
    'crit.r10.prod': '健康多倍保庆典版',
    'crit.r11.co': { text: '泰康人寿', emphasize: ['bold'] },
    'crit.r11.prod': '乐享健康2026',
    'crit.r12.co': { text: '太平人寿', emphasize: ['bold'] },
    'crit.r12.prod': '福禄嘉禧',
    // ── 少儿重疾险（R13–R19，锚点 R13:C0，跨 7 行；覆盖格 null 无槽）──
    'crit.r13.cat': '少儿重疾险',
    'crit.r13.co': { text: '复星联合健康', emphasize: ['bold'] },
    'crit.r13.prod': '妈咪保贝爱善B款、妈咪保贝哪吒守护',
    'crit.r14.co': { text: '复星保德信', emphasize: ['bold'] },
    'crit.r14.prod': '大黄蜂16号（旗舰版）',
    'crit.r15.co': { text: '君龙人寿', emphasize: ['bold'] },
    'crit.r15.prod': '小青龙6号D款、完美宝贝8号',
    'crit.r16.co': { text: '招商仁和', emphasize: ['bold'] },
    'crit.r16.prod': '青云卫6号',
    'crit.r17.co': { text: '信美相互', emphasize: ['bold'] },
    'crit.r17.prod': '达尔文宝贝计划15号',
    'crit.r18.co': { text: '人保寿险', emphasize: ['bold'] },
    'crit.r18.prod': '无忧宝贝2.0',
    'crit.r19.co': { text: '华贵人寿', emphasize: ['bold'] },
    'crit.r19.prod': '麦兜兜2026',
  },
  blocks: [],
  layout: {
    rowCount: 20,
    colCount: 3,
    headerLevels: 1,
    style: { colWidths: [110, 150, 220] },
    // 骨架合并全部锁定（mergeGuard 用户不可拆/不可覆盖）；大跨度不受 6/8/30 用户闸（披露⑤）
    structuralMerges: [
      { start: [1, 0], end: [12, 0] },
      { start: [13, 0], end: [19, 0] },
    ],
    // 成品语义表：不设 merges/allowedMerges（缺省 = 用户合并全禁）；全部不配 leftTag（A2-①）
    blockSlots: [
      // footer 槽空置不占行（不发 emphFooter 区块实例）
      footerSlot(19),
    ],
    slotGrid: [
      // R0 表头
      ['crit.h.cat', 'crit.h.co', 'crit.h.prod'],
      // R1–R12 成人重疾险（C0 锚点 R1，覆盖格 null）
      ['crit.r1.cat', 'crit.r1.co', 'crit.r1.prod'],
      [null, 'crit.r2.co', 'crit.r2.prod'],
      [null, 'crit.r3.co', 'crit.r3.prod'],
      [null, 'crit.r4.co', 'crit.r4.prod'],
      [null, 'crit.r5.co', 'crit.r5.prod'],
      [null, 'crit.r6.co', 'crit.r6.prod'],
      [null, 'crit.r7.co', 'crit.r7.prod'],
      [null, 'crit.r8.co', 'crit.r8.prod'],
      [null, 'crit.r9.co', 'crit.r9.prod'],
      [null, 'crit.r10.co', 'crit.r10.prod'],
      [null, 'crit.r11.co', 'crit.r11.prod'],
      [null, 'crit.r12.co', 'crit.r12.prod'],
      // R13–R19 少儿重疾险（C0 锚点 R13，覆盖格 null）
      ['crit.r13.cat', 'crit.r13.co', 'crit.r13.prod'],
      [null, 'crit.r14.co', 'crit.r14.prod'],
      [null, 'crit.r15.co', 'crit.r15.prod'],
      [null, 'crit.r16.co', 'crit.r16.prod'],
      [null, 'crit.r17.co', 'crit.r17.prod'],
      [null, 'crit.r18.co', 'crit.r18.prod'],
      [null, 'crit.r19.co', 'crit.r19.prod'],
    ],
  },
}
