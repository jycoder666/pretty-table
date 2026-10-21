import { describe, expect, it, vi } from 'vitest'
import type { TemplateInstance } from '../types'
import { buildVisualRows, toOption } from './toOption'
import { PALETTES } from '../theme/palettes'
import { COMPARE_ALPHA_V1 } from '../templates'
import { cloneInstance } from '../schema/validate'

function withSlots(patch: (inst: TemplateInstance) => void): TemplateInstance {
  const inst = cloneInstance(COMPARE_ALPHA_V1)
  patch(inst)
  return inst
}

function cellStyle(opt: Record<string, unknown>, row: number, col: number): Record<string, unknown> {
  const cols = opt.columns as { style: (a: { row: number; col: number }) => Record<string, unknown> }[]
  return cols[col]!.style({ row, col })
}

describe('toOption · 语义单元格（FR-21/22）', () => {
  it('{mark:"yes"} 显示 ✓ 居中、色随主题（TC-PT-073）', () => {
    const inst = withSlots((i) => {
      i.slots['row.2.val.a'] = { mark: 'yes' }
    })
    const { metas } = buildVisualRows(inst)
    const cell = metas[3]![1]!
    expect(cell.text).toBe('✓')
    expect(cell.align).toBe('center')

    const opt = toOption(inst, { mode: 'preview' })
    const style = cellStyle(opt, 3, 1)
    expect(style.color).toBe(PALETTES['T-A'].primary)
  })

  it('切 T-B 颜色跟变（TC-PT-074）', () => {
    const inst = withSlots((i) => {
      i.themeId = 'T-B'
      i.slots['row.2.val.a'] = { mark: 'no' }
    })
    const opt = toOption(inst, { mode: 'preview' })
    expect(cellStyle(opt, 3, 1).color).toBe(PALETTES['T-B'].emphasis)
    const inst2 = withSlots((i) => {
      i.themeId = 'T-B'
      i.slots['row.2.val.a'] = { mark: 'yes' }
    })
    expect(cellStyle(toOption(inst2, { mode: 'preview' }), 3, 1).color).toBe(PALETTES['T-B'].primary)
  })

  it('mark 槽存普通文字「面议」→ 按文字显示不套格式', () => {
    const inst = withSlots((i) => {
      i.slots['row.2.val.a'] = '面议'
    })
    const { metas } = buildVisualRows(inst)
    expect(metas[3]![1]!.text).toBe('面议')
    expect(metas[3]![1]!.mark).toBeUndefined()
    const opt = toOption(inst, { mode: 'preview' })
    expect((opt.records as Record<string, string>[])[3]!.c1).toBe('面议')
    expect(cellStyle(opt, 3, 1).color).not.toBe(PALETTES['T-A'].primary)
  })

  it('{num} + percent → 25%；currency → ¥1,200.00（TC-PT-076～079）', () => {
    const inst = withSlots((i) => {
      i.slotDefs = {
        ...i.slotDefs,
        'row.2.val.a': { kind: 'number', format: 'percent' },
      }
      i.slots['row.2.val.a'] = { num: 0.25 }
    })
    const { metas } = buildVisualRows(inst)
    expect(metas[3]![1]!.text).toBe('25%')
    expect(metas[3]![1]!.align).toBe('right')

    const inst2 = withSlots((i) => {
      i.slotDefs = {
        ...i.slotDefs,
        'row.2.val.a': { kind: 'number', format: 'currency', currency: 'CNY' },
      }
      i.slots['row.2.val.a'] = { num: 1200 }
    })
    const metas2 = buildVisualRows(inst2).metas
    expect(metas2[3]![1]!.text).toBe('¥1,200.00')
  })

  it('num 槽存普通文字「100万」→ 按文字显示不套格式', () => {
    const inst = withSlots((i) => {
      i.slots['row.5.val.a'] = '100万'
    })
    const { metas } = buildVisualRows(inst)
    expect(metas[6]![1]!.text).toBe('100万')
  })
})

describe('toOption · 推荐列（FR-23）', () => {
  it('推荐列表头加角标文字', () => {
    const inst = withSlots((i) => {
      i.highlight = { recommendCol: 2 }
    })
    const { metas } = buildVisualRows(inst)
    expect(metas[1]![2]!.badge).toBe('推荐')
    expect(metas[1]![1]!.badge).toBeUndefined()
  })

  it('推荐列浅底优先于斑马纹', () => {
    const inst = withSlots((i) => {
      i.highlight = { recommendCol: 1 }
    })
    const opt = toOption(inst, { mode: 'preview' })
    // 第 3 行（visual row 3，奇数）在开启斑马纹时：推荐列 1 用 emphasisSoft，列 2 用斑马色
    expect(cellStyle(opt, 3, 1).bgColor).toBe(PALETTES['T-A'].emphasisSoft)
    expect(cellStyle(opt, 3, 2).bgColor).toBe(PALETTES['T-A'].zebra)
    expect(cellStyle(opt, 3, 1).bgColor).not.toBe(cellStyle(opt, 3, 2).bgColor)
  })

  it('无推荐列时保持斑马纹', () => {
    const opt = toOption(COMPARE_ALPHA_V1, { mode: 'preview' })
    expect(cellStyle(opt, 3, 1).bgColor).toBe(PALETTES['T-A'].zebra)
  })
})

// ── 自定义格式 T03：档位 / colWidths / 自定义色（FR-C1 / FR-C2）──

import { BLANK_V1 } from '../templates'
import { ROW_HEIGHT_TIERS, FONT_SIZE_TIERS, PADDING_TIERS } from '../theme/layoutScales'
import { resolveTheme } from '../theme/palettes'

function ptOf(opt: Record<string, unknown>): {
  rowHeights: number[]
  contentWidth: number
  contentHeight: number
  palette: Record<string, string>
} {
  return opt.__pt as never
}

describe('toOption · 排版档位（FR-C2）', () => {
  it('行高档位：设 tier 3 → 表头/表体行高 48；未设 → 既有 36 不变（区块行仍 32）', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    const base = toOption(inst, { mode: 'preview' })
    expect(ptOf(base).rowHeights.filter((h) => h !== 32).every((h) => h === 36)).toBe(true)
    inst.layout.style = { rowHeightTier: 3 }
    const opt = toOption(inst, { mode: 'preview' })
    expect(opt.defaultRowHeight).toBe(ROW_HEIGHT_TIERS[2])
    expect(ptOf(opt).rowHeights.filter((h) => h !== 32).every((h) => h === ROW_HEIGHT_TIERS[2])).toBe(true)
    expect(ptOf(opt).rowHeights).toContain(32) // 区块行不随档位
  })

  it('字号档位进单元格 style 与 VTable theme（默认 13 不变）', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.layout.style = { fontSizeTier: 1 }
    const opt = toOption(inst, { mode: 'preview' })
    expect(cellStyle(opt, 3, 1).fontSize).toBe(FONT_SIZE_TIERS[0])
    const theme = opt.theme as { defaultStyle: { fontSize: number } }
    expect(theme.defaultStyle.fontSize).toBe(FONT_SIZE_TIERS[0])
    // 未设 → 13
    const base = toOption(cloneInstance(COMPARE_ALPHA_V1), { mode: 'preview' })
    expect(cellStyle(base, 3, 1).fontSize).toBe(13)
  })

  it('内边距档位：tier 3 → 四边 14；未设 → [8,10,8,10] 不变', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.layout.style = { paddingTier: 3 }
    const opt = toOption(inst, { mode: 'preview' })
    expect(cellStyle(opt, 3, 1).padding).toEqual([
      PADDING_TIERS[2],
      PADDING_TIERS[2],
      PADDING_TIERS[2],
      PADDING_TIERS[2],
    ])
    const base = toOption(cloneInstance(COMPARE_ALPHA_V1), { mode: 'preview' })
    expect(cellStyle(base, 3, 1).padding).toEqual([8, 10, 8, 10])
  })

  it('colWidths：数值列宽进 columns.width，null 回默认（首列 120、其余 140）；contentWidth 按生效宽求和', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1) // 4 列
    inst.layout.style = { colWidths: [200, null, 300, 100] }
    const opt = toOption(inst, { mode: 'preview' })
    const widths = (opt.columns as { width: number }[]).map((c) => c.width)
    expect(widths).toEqual([200, 140, 300, 100])
    expect(ptOf(opt).contentWidth).toBe(200 + 140 + 300 + 100)
  })

  it('headerLevels=3：前三行 role=header、行高按表头档', () => {
    const inst = cloneInstance(BLANK_V1)
    inst.layout.headerLevels = 3
    inst.layout.style = { rowHeightTier: 1 }
    const { metas, rowHeights } = buildVisualRows(inst)
    expect(metas[0]![0]!.role).toBe('header')
    expect(metas[2]![0]!.role).toBe('header')
    expect(metas[3]![1]!.role).toBe('body') // 表体首格起为 body（首列 label）
    expect(metas[3]![0]!.role).toBe('label')
    expect(rowHeights[0]).toBe(ROW_HEIGHT_TIERS[0])
    expect(rowHeights[3]).toBe(ROW_HEIGHT_TIERS[0])
  })
})

describe('toOption · 自定义角色色（FR-C1，单点合成消费）', () => {
  it('themeTokens 覆盖进 option：表头底色/表头文字/斑马/边框/强调/纸色', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.themeTokens = {
      primary: '#112233',
      headerText: '#abcdef',
      zebra: '#223344',
      border: '#334455',
      emphasis: '#445566',
      background: '#556677',
    }
    const opt = toOption(inst, { mode: 'preview' })
    expect(ptOf(opt).palette.primary).toBe('#112233')
    expect(ptOf(opt).palette.headerText).toBe('#abcdef')
    const header = cellStyle(opt, 0, 1)
    expect(header.bgColor).toBe('#112233')
    expect(header.color).toBe('#abcdef')
    expect(cellStyle(opt, 3, 2).bgColor).toBe('#223344') // 斑马行
    expect(cellStyle(opt, 3, 1).borderColor).toBe('#334455')
    expect(cellStyle(opt, 0, 1).borderColor).toBe('#334455')
  })

  it('恢复预设（themeTokens 移除）与纯预设 option 快照相等', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.themeTokens = { primary: '#112233', emphasis: '#445566' }
    const custom = toOption(inst, { mode: 'preview' })
    expect(ptOf(custom).palette.primary).toBe('#112233')
    delete inst.themeTokens
    const restored = toOption(inst, { mode: 'preview' })
    const pure = toOption(cloneInstance(COMPARE_ALPHA_V1), { mode: 'preview' })
    // JSON 快照相等（函数字段序列化两侧一致丢弃）
    expect(JSON.stringify(restored.__pt)).toBe(JSON.stringify(pure.__pt))
    expect(JSON.stringify(restored.theme)).toBe(JSON.stringify(pure.theme))
    expect(JSON.stringify(restored.records)).toBe(JSON.stringify(pure.records))
    // 与 resolveTheme 合成结果深相等（Palette 单点）
    expect(restored.__pt && (restored.__pt as { palette: unknown }).palette).toEqual(
      resolveTheme('T-A').palette,
    )
  })
})

// ── 交互升级 T02：图片格渲染（R-3）+ 二期区块渲染（R-4）────────

describe('toOption · 图片格（R-3）', () => {
  const IMG = (() => {
    const bytes = [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0,
    ]
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    return `data:image/png;base64,${btoa(bin)}`
  })()

  function imageInst(): TemplateInstance {
    return withSlots((i) => {
      i.slots['row.3.val.a'] = { image: IMG }
    })
  }

  it('图片槽 → CellMeta.image 有值、text 空、无「填写内容」占位', () => {
    const { metas } = buildVisualRows(imageInst())
    const cell = metas[4]![1]! // 逻辑行 3 → 可视行 4（after-1 gap 行占 1 行）
    expect(cell.image).toBe(IMG)
    expect(cell.text).toBe('')
    expect(cell.isPlaceholder).toBe(false)
  })

  it('含图列带 customRender；coverCrop 裁剪参数正确（资源经 ctx.images 注入）', () => {
    const inst = imageInst()
    const asset = { naturalWidth: 1000, naturalHeight: 500 }
    const opt = toOption(inst, { mode: 'preview', images: new Map([[IMG, asset]]) })
    const col = (opt.columns as { customRender?: (a: unknown) => unknown }[])[1]!
    expect(typeof col.customRender).toBe('function')
    const drawImage = vi.fn<(...a: unknown[]) => void>()
    const args = {
      row: 4,
      col: 1,
      rect: { left: 10, top: 20, width: 100, height: 100 },
      ctx: { drawImage },
    }
    const ret = col.customRender!(args)
    // coverCrop(1000,500,100,100) → sw=500 sh=500，居中偏移 (250, 0)
    expect(drawImage).toHaveBeenCalledWith(asset, 250, 0, 500, 500, 10, 20, 100, 100)
    expect(ret).toEqual({ elements: [] })
  })

  it('无图格走默认绘制（customRender 返回 undefined，文字格 style 回调并存）', () => {
    const inst = imageInst()
    const opt = toOption(inst, { mode: 'preview' })
    const col = (opt.columns as { customRender?: (a: unknown) => unknown }[])[1]!
    expect(col.customRender?.({ row: 0, col: 1, rect: { left: 0, top: 0, width: 100, height: 36 } })).toBeUndefined()
    expect(col.customRender?.({ row: 4, col: 1, rect: { left: 0, top: 0, width: 100, height: 36 } })).toBeUndefined() // 资源未注入
    // style 回调仍然在（列级并存）
    expect(typeof (opt.columns as { style?: unknown }[])[1]!.style).toBe('function')
  })

  it('无图列不挂 customRender', () => {
    const opt = toOption(cloneInstance(COMPARE_ALPHA_V1), { mode: 'preview' })
    for (const col of opt.columns as { customRender?: unknown }[]) {
      expect(col.customRender).toBeUndefined()
    }
  })
})

describe('toOption · 二期区块渲染（R-4）', () => {
  it('leftTag：首列 role=leftTag / tag 色底 / 不插整行（metas 行数不变）', () => {
    const inst = withSlots((i) => {
      i.layout.blockSlots.push({ id: 'left-3', accept: ['leftTag'], region: 'left-tag', rowHint: 'left-3' })
      i.blocks.push({ id: 'tag-1', type: 'leftTag', slotId: 'left-3', props: { text: '核心' } })
    })
    const before = buildVisualRows(cloneInstance(COMPARE_ALPHA_V1)).metas.length
    const { metas } = buildVisualRows(inst)
    expect(metas.length).toBe(before) // 不插行
    const cell = metas[4]![0]! // 逻辑行 3 → 可视行 4
    expect(cell.role).toBe('leftTag')
    expect(cell.text).toBe('核心')
    expect(cell.blockType).toBe('leftTag')
    const opt = toOption(inst, { mode: 'preview' })
    expect(cellStyle(opt, 4, 0).bgColor).toBe(PALETTES['T-A'].tag)
    expect(cellStyle(opt, 4, 0).color).toBe(PALETTES['T-A'].tagText)
  })

  it('leftTag 槽无区块时首列保持原样（不显示占位、不染色）', () => {
    const inst = withSlots((i) => {
      i.layout.blockSlots.push({ id: 'left-3', accept: ['leftTag'], region: 'left-tag', rowHint: 'left-3' })
    })
    const { metas } = buildVisualRows(inst)
    expect(metas[4]![0]!.role).toBe('label')
    expect(metas[4]![0]!.text).toBe('响应时效')
  })

  it('emphFooter：表底 gap 行渲染注脚（纸底、小字、靠左），导出同源 tfoot 位置', () => {
    const inst = withSlots((i) => {
      i.blocks.push({ id: 'foot-1', type: 'emphFooter', slotId: 'footer-1', props: { text: '以上价格含税' } })
    })
    const { metas, rowHeights, blockRowIndexes } = buildVisualRows(inst)
    const footerVisual = blockRowIndexes.get(metas.length - 1)
    expect(footerVisual).toBe('footer-1') // 挂在最后一行之后的 gap 行（表底）
    const footRow = metas[metas.length - 1]!
    expect(footRow[0]!.text).toBe('以上价格含税')
    expect(footRow[0]!.blockType).toBe('emphFooter')
    const opt = toOption(inst, { mode: 'preview' })
    const st = cellStyle(opt, metas.length - 1, 0)
    expect(st.bgColor).toBe(PALETTES['T-A'].paper)
    expect(st.color).toBe(PALETTES['T-A'].muted)
    expect(st.textAlign).toBe('left')
    expect(rowHeights[metas.length - 1]).toBe(32) // 区块行高不变
  })

  it('footer 槽空置时不预留表底行（预览/导出不多一行）', () => {
    const inst = withSlots((i) => {
      i.layout.blockSlots.push({ id: 'left-3', accept: ['leftTag'], region: 'left-tag', rowHint: 'left-3' })
      i.blocks.push({ id: 'tag-x', type: 'leftTag', slotId: 'left-3', props: { text: 'x' } })
    })
    const { metas, blockRowIndexes } = buildVisualRows(inst)
    // compare 默认无 footer 区块 → footer-1 槽空置：不出现 gap 行，最后一行是逻辑行 9
    expect([...blockRowIndexes.values()]).not.toContain('footer-1')
    expect(metas[metas.length - 1]![0]!.text).toBe('合同期限')
  })
})
