import type { TemplateInstance } from '../types'
import { footerSlot } from './blockSlotHelpers'

/**
 * need_04 · 医疗层级对比（保险模板套件 TP05；内容与结构均为
 * 「增量设计-保险模板套件-2026-11-06」A3-5 转写逐字口径，detail 类范式 compare-alpha-v1）：
 * 4 列 × 9 行（R0 满宽标题 + R1 列头 + 7 数据行），百万医疗/小额医疗/中高端医疗三档六维度对照。
 * 近似口径（A2 / A3-5 已披露，实现不再增删改）：
 * ① 5 处样图局部红（R3 百万/中高端「核心作用」、R7 百万/中高端「适合人群」、R8 中高端「一句话总结」）
 *   均为整格结论/关键短语 → 按 A2-③ 裁量规则整格红近似（emphasize:['red']，色随主题 emphasis）；
 * ② 首列对比维度深蓝底白字 → label 角色白底加粗（c===0 自动 label）；
 * ③ 成品语义表：不设 allowedMerges（用户合并全禁，pricing-v1「不做用户合并」同口径），
 *   不发区块实例（footer 槽空置不占行）。
 */
export const CARE_TIER_COMPARE: TemplateInstance = {
  schemaVersion: '1.2',
  templateId: 'care-tier-compare',
  themeId: 'T-A',
  zebraOn: true,
  slotDefs: {},
  highlight: { recommendCol: null },
  meta: {
    displayName: '医疗层级对比',
    description: '百万医疗/小额医疗/中高端医疗三档六维度对照，关键结论整格红标注',
    templateType: 'detail',
    origin: 'preset',
  },
  slots: {
    'tier.title': '百万医疗 vs 小额医疗 vs 中高端医疗',
    // R1 列头
    'tier.h.dim': '对比维度',
    'tier.h.a': '百万医疗险',
    'tier.h.b': '小额医疗险',
    'tier.h.c': '中高端医疗险',
    // R2–R8 数据行（🔴 5 格 → emphasize:['red'] 整格红，A3-5 逐格登记）
    'tier.r2.dim': '30岁价格',
    'tier.r2.a': '300元左右/年',
    'tier.r2.b': '100-300元/年',
    'tier.r2.c': '3000-几万元/年',
    'tier.r3.dim': '核心作用',
    'tier.r3.a': { text: '报销大病大额医疗费，解决"因病致贫"', emphasize: ['red'] },
    'tier.r3.b': '报销小病小额医疗费，覆盖百万医疗1万免赔额',
    'tier.r3.c': { text: '享受优质医疗服务，解决"看病难、体验差"', emphasize: ['red'] },
    'tier.r4.dim': '免赔额',
    'tier.r4.a': '1万/年',
    'tier.r4.b': '0-100元/年',
    'tier.r4.c': '0-1万/年',
    'tier.r5.dim': '报销范围',
    'tier.r5.a': '社保内+社保外，含外购药',
    'tier.r5.b': '一般仅限社保内，部分含社保外',
    'tier.r5.c': '社保内外全覆盖，含特需/私立/海外就医',
    'tier.r6.dim': '医院范围',
    'tier.r6.a': '二级及以上公立医院普通部',
    'tier.r6.b': '二级及以上公立医院普通部',
    'tier.r6.c': '公立医院特需/国际部、私立医院、海外医院',
    'tier.r7.dim': '适合人群',
    'tier.r7.a': { text: '所有人，人手一份的刚需', emphasize: ['red'] },
    'tier.r7.b': '小孩、老人等经常生小病住院的人群',
    'tier.r7.c': { text: '年收入50万以上，对就医体验有要求的中产家庭', emphasize: ['red'] },
    'tier.r8.dim': '一句话总结',
    'tier.r8.a': '普通人首选，花小钱扛大风险',
    'tier.r8.b': '百万医疗的补充，可买可不买',
    'tier.r8.c': { text: '有钱了再升级，不是刚需', emphasize: ['red'] },
  },
  blocks: [],
  layout: {
    rowCount: 9,
    colCount: 4,
    headerLevels: 2,
    captionSlot: 'tier.title',
    style: { colWidths: [110, 190, 190, 190] },
    merges: [],
    // 骨架合并全部锁定：标题满宽（覆盖格重复标题槽 id，pricing-v1.ts:206 先例）
    structuralMerges: [{ start: [0, 0], end: [0, 3] }],
    // 成品语义表：不设 allowedMerges（缺省 = 用户合并全禁，mergeGuard 拒绝）
    blockSlots: [
      // footer 槽空置不占行（不发 emphFooter 区块实例）；不配 leftTag（A2-①）
      footerSlot(8),
    ],
    slotGrid: [
      // R0 表名（合并锁定、文字可改；覆盖格重复标题槽 id）
      ['tier.title', 'tier.title', 'tier.title', 'tier.title'],
      // R1 列头（全槽位 → migrate detail 回填分支不触发）
      ['tier.h.dim', 'tier.h.a', 'tier.h.b', 'tier.h.c'],
      // R2–R8 数据行
      ['tier.r2.dim', 'tier.r2.a', 'tier.r2.b', 'tier.r2.c'],
      ['tier.r3.dim', 'tier.r3.a', 'tier.r3.b', 'tier.r3.c'],
      ['tier.r4.dim', 'tier.r4.a', 'tier.r4.b', 'tier.r4.c'],
      ['tier.r5.dim', 'tier.r5.a', 'tier.r5.b', 'tier.r5.c'],
      ['tier.r6.dim', 'tier.r6.a', 'tier.r6.b', 'tier.r6.c'],
      ['tier.r7.dim', 'tier.r7.a', 'tier.r7.b', 'tier.r7.c'],
      ['tier.r8.dim', 'tier.r8.a', 'tier.r8.b', 'tier.r8.c'],
    ],
  },
}
