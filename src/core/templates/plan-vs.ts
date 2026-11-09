import type { TemplateInstance } from '../types'
import { footerSlot } from './blockSlotHelpers'

/**
 * 保险模板套件 need_07 · 方案对比（detail）— schema 1.2
 * 依据：docs/06-upgrade/增量设计-保险模板套件-2026-11-06.md A3-8（内容逐字转写）。
 * detail 类范式 compare-alpha-v1（纵横合并并存）：4 列 × 6 行（R0 满宽标题 + R1 列头
 * + 4 数据行）。templateType 显式 'detail'——compare 型会被 toOption [0,0] 强制渲染
 * 「项目」角头吞掉标题（A1 第二条），且 migrate 词根推断对 'plan-vs' 兜底落 compare，
 * 显式值迁移后不得被改写。
 * 4 条 structuralMerges 全锁定（骨架，用户不可拆/不可覆盖）：
 * ① [0,0]-[0,3] 标题满宽（覆盖格重复标题槽 id，pricing-v1.ts:206 先例）；
 * ② [1,2]-[1,3] 表头「方案二」跨 C2-C3；
 * ③ [4,1]-[5,1] 方案一 保额~保费 纵向 2 行（样图两行文本并入锚点承载）；
 * ④ [5,2]-[5,3] 方案二保费横向跨 C2-C3。②③④ 覆盖格 null（compare-alpha-v1.ts:124 先例）。
 * 语义补全（A6-1 待拍板，默认执行口径；合并格单值）：
 * - 方案一合并锚点 [4,1]：「30万(30岁男，保终身，20年交)，保费7020」单行承载
 *   （两数值逐字保留，「保费」一词取自 C0 行标）；
 * - 方案二保费合并锚点 [5,2]：「4224＋914＝5138」整格红（三数值全保留、5138 红、跨 2 列）。
 * 近似披露（A2-③ / A3-8）：① R3C1 红「身故/全残」为格内尾串 → 整格红；② R4C3 红
 * 「保至70岁」为格内子串 → 整格红（共 4 处整格红）；③ 首列深蓝底白字 → label 角色
 * 白底加粗（c===0 自动）；④ 保费无货币格式 defs（纯文本槽，控增量）。
 * 数据槽按位命名 plan.r{n}.c{c}（C1=方案一，C2/C3=方案二两列；各行列义随行头变化）。
 * 成品语义表：不设 merges/allowedMerges（用户合并全禁，与 pricing-v1 同口径）；
 * 区块槽只配 footerSlot(5)，空置不发区块实例（不占行）；不配 leftTag（A2-①）。
 */
export const PLAN_VS: TemplateInstance = {
  schemaVersion: '1.2',
  templateId: 'plan-vs',
  themeId: 'T-A',
  zebraOn: true,
  // A3-8 披露④：保费为纯文本槽，不开 number/currency defs
  slotDefs: {},
  highlight: { recommendCol: null },
  meta: {
    displayName: '方案对比',
    description: '方案一（纯重疾+身故）与方案二（纯重疾+定期寿险）对比',
    templateType: 'detail',
    origin: 'preset',
  },
  slots: {
    'plan.title': '纯重疾+身故 VS 纯重疾+定期寿险',
    // R1 列头（方案二跨 C2-C3，[1,3] 为合并覆盖格）
    'plan.h.dim': '方案',
    'plan.h.plan1': '方案一：纯重疾+身故',
    'plan.h.plan2': '方案二：纯重疾+定期寿险',
    // R2 产品
    'plan.r2.dim': '产品',
    'plan.r2.c1': '某重疾险',
    'plan.r2.c2': '某重疾险',
    'plan.r2.c3': '某定期寿险',
    // R3 保障内容（C1/C3 整格红：格内尾串红「身故/全残」的整格近似，A3-8 披露①）
    'plan.r3.dim': '保障内容',
    'plan.r3.c1': { text: '重疾+中症+轻症+身故/全残', emphasize: ['red'] },
    'plan.r3.c2': '重疾+中症+轻症',
    'plan.r3.c3': { text: '身故/全残', emphasize: ['red'] },
    // R4 保额（C1 为 [4,1]-[5,1] 纵向合并锚点：保额+保费两行并入单值，A6-1 语义补全；
    // C3 整格红：格内子串红「保至70岁」的整格近似，A3-8 披露②）
    'plan.r4.dim': '保额',
    'plan.r4.c1': '30万(30岁男，保终身，20年交)，保费7020',
    'plan.r4.c2': '30万(30岁男，保终身，20年交)',
    'plan.r4.c3': { text: '30万(30岁男，保至70岁，20年交)', emphasize: ['red'] },
    // R5 保费（C2 为 [5,2]-[5,3] 横向合并锚点，整格红；C1/C3 为覆盖格）
    'plan.r5.dim': '保费',
    'plan.r5.c2': { text: '4224＋914＝5138', emphasize: ['red'] },
  },
  blocks: [],
  layout: {
    rowCount: 6,
    colCount: 4,
    headerLevels: 2,
    captionSlot: 'plan.title',
    recommendableCols: [],
    // 骨架合并全在 structuralMerges（用户不可拆/不可覆盖）；不设 merges/allowedMerges
    //（B4 约定：8 张全部不设，用户合并全禁）
    structuralMerges: [
      { start: [0, 0], end: [0, 3] },
      { start: [1, 2], end: [1, 3] },
      { start: [4, 1], end: [5, 1] },
      { start: [5, 2], end: [5, 3] },
    ],
    blockSlots: [
      // footer 槽空置不占行（不发 emphFooter 区块实例）；不配 leftTag（A2-①）
      footerSlot(5),
    ],
    style: { colWidths: [90, 180, 140, 140] },
    slotGrid: [
      // R0 表名（合并锁定、文字可改；覆盖格重复标题槽 id，pricing-v1.ts:206 先例）
      ['plan.title', 'plan.title', 'plan.title', 'plan.title'],
      // R1 列头（[1,3] 为「方案二」跨列合并覆盖格）
      ['plan.h.dim', 'plan.h.plan1', 'plan.h.plan2', null],
      // R2 产品
      ['plan.r2.dim', 'plan.r2.c1', 'plan.r2.c2', 'plan.r2.c3'],
      // R3 保障内容
      ['plan.r3.dim', 'plan.r3.c1', 'plan.r3.c2', 'plan.r3.c3'],
      // R4 保额（[5,1] 为纵向合并覆盖格）
      ['plan.r4.dim', 'plan.r4.c1', 'plan.r4.c2', 'plan.r4.c3'],
      // R5 保费（[5,1] 被 [4,1]-[5,1] 覆盖、[5,3] 被 [5,2]-[5,3] 覆盖）
      ['plan.r5.dim', null, 'plan.r5.c2', null],
    ],
  },
}
