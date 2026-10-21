import { describe, expect, it } from 'vitest'
import { COMPARE_ALPHA_V1, MATRIX_V1, PRICING_V1 } from '../templates'
import { buildExportModel } from './model'
import { cloneInstance } from '../schema/validate'

function flatten(rows: { tag: string; text: string }[][]): string {
  return rows.flat().map((c) => `${c.tag}:${c.text}`).join('|')
}

describe('buildExportModel（T28 · ExportModel）', () => {
  it('价目：captionSlot 作 caption，表头 th scope=col，首列 th scope=row', () => {
    const m = buildExportModel(cloneInstance(PRICING_V1))
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.value.caption).toBe('装修项目价目表')
    expect(m.value.headRows).toHaveLength(2)
    // R0 表名合并行与 R1 列头都是 th scope=col
    for (const row of m.value.headRows) {
      for (const cell of row) {
        expect(cell.tag).toBe('th')
        expect(cell.scope).toBe('col')
      }
    }
    // 表体首个条目行的「序号」为 th scope=row（bodyRows[0] 是区块行，跳过）
    const seq = m.value.bodyRows.flat().find((c) => c.text === '1')
    expect(seq?.tag).toBe('th')
    expect(seq?.scope).toBe('row')
  })

  it('价目：合计行 C0–C4 合并 → colSpan 5，跳格不重复输出', () => {
    const m = buildExportModel(cloneInstance(PRICING_V1))
    expect(m.ok).toBe(true)
    if (!m.ok) return
    const last = m.value.bodyRows[m.value.bodyRows.length - 1] ?? []
    expect(last).toHaveLength(2) // 合并格 + 合计金额
    expect(last[0]?.colSpan).toBe(5)
    expect(last[0]?.text).toBe('合计')
    expect(last[1]?.text).toBe('¥15,978.00')
  })

  it('矩阵：符号格输出字形 + aria-label，百分比格按比例显示', () => {
    const m = buildExportModel(cloneInstance(MATRIX_V1))
    expect(m.ok).toBe(true)
    if (!m.ok) return
    const flat = flatten(m.value.bodyRows)
    expect(flat).toContain('td:✓')
    expect(flat).toContain('td:✗')
    expect(flat).toContain('td:◐')
    const flatCells = m.value.bodyRows.flat()
    const yes = flatCells.find((c) => c.text === '✓')
    expect(yes?.ariaLabel).toBe('支持')
    const no = flatCells.find((c) => c.text === '✗')
    expect(no?.ariaLabel).toBe('不支持')
    const partial = flatCells.find((c) => c.text === '◐')
    expect(partial?.ariaLabel).toBe('部分支持')
    expect(flatCells.some((c) => c.text === '98%')).toBe(true)
  })

  it('矩阵：「条目」rowspan=2，档位分组 colspan 输出，首列 sticky', () => {
    const m = buildExportModel(cloneInstance(MATRIX_V1))
    expect(m.ok).toBe(true)
    if (!m.ok) return
    const corner = m.value.headRows[0]?.[0]
    expect(corner?.rowSpan).toBe(2)
    expect(corner?.text).toBe('条目')
    const spans = m.value.headRows[0]?.map((c) => c.colSpan) ?? []
    expect(spans).toContain(2)
    expect(spans).toContain(3)
    // 首列格带 sticky（R1 首格因角合并被跳过，检查角落格与首个条目行）
    expect(m.value.headRows[0]?.[0]?.style).toContain('position:sticky;left:0')
    const entryRow = m.value.bodyRows.find((r) => r.length > 1 && r[0]?.scope === 'row')
    expect(entryRow?.[0]?.style).toContain('position:sticky;left:0')
  })

  it('推荐列：最深表头带 badge，列内单元格带主色描边', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.highlight = { recommendCol: 1 }
    const m = buildExportModel(inst)
    expect(m.ok).toBe(true)
    if (!m.ok) return
    const deepest = m.value.headRows[m.value.headRows.length - 1] ?? []
    // 角标挂在可推荐列的表头格上（该行首格因角合并被跳过，输出顺序前移）
    expect(deepest.some((c) => c.badge === '推荐')).toBe(true)
    for (const row of m.value.bodyRows) {
      if (row.length === 1) continue // 区块行整行 colspan，不在推荐列语义内
      expect(row[1]?.style).toContain('border:2px solid')
    }
  })

  it('emphFooter 区块 → tfoot 整行 th colspan', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.blocks.push({
      id: 'foot-1',
      type: 'emphFooter',
      slotId: 'footer-1',
      props: { text: '以上价格含税' },
    })
    const m = buildExportModel(inst)
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.value.footRows).toHaveLength(1)
    expect(m.value.footRows[0]?.[0]?.text).toBe('以上价格含税')
    expect(m.value.footRows[0]?.[0]?.colSpan).toBe(inst.layout.colCount)
    expect(m.value.footRows[0]?.[0]?.tag).toBe('th')
  })

  it('minWidthPx = 首列 96 + 其余列 × 120；空槽导出为空串', () => {
    for (const inst of [PRICING_V1, MATRIX_V1]) {
      const m = buildExportModel(cloneInstance(inst))
      expect(m.ok).toBe(true)
      if (!m.ok) continue
      expect(m.value.minWidthPx).toBe(96 + (inst.layout.colCount - 1) * 120)
      expect(m.value.bodyRows.flat().some((c) => c.text === '填写内容')).toBe(false)
    }
  })
})

// ── TC-088 回归：HTML 属性转义（style 属性双引号截断致内联样式全丢）──

describe('renderExportHtml · 属性转义（TC-088）', () => {
  it('style 属性值经 &quot; 转义：FONT_STACK 双引号不截断，其后声明仍留在属性内', () => {
    const m = buildExportModel(cloneInstance(PRICING_V1))
    expect(m.ok).toBe(true)
    if (!m.ok) return
    const html = renderExportHtml(m.value)
    // 字体栈双引号已实体化
    expect(html).toContain('font-family:&quot;PingFang SC&quot;, &quot;Microsoft YaHei&quot;')
    // FONT_STACK 之后的声明未被截断出属性外（同一属性内 font-family 后仍有 font-size/background）
    expect(html).toContain('sans-serif;font-size:')
    // 每个捕获到的 style 属性值里不含裸 `"`（引号只作定界符），且含 font-family 的属性完整起始
    for (const [, v] of html.matchAll(/style="([^"]*)"/g)) {
      const s = v ?? ''
      expect(s).not.toMatch(/(?<!&)quot;/)
      expect(s.startsWith('font-family:&quot;') || !s.includes('font-family:')).toBe(true)
    }
  })

  it('解析往返：真实 DOM 读回的 style 属性完整（背景色/字号/sticky 不丢）', () => {
    const m = buildExportModel(cloneInstance(MATRIX_V1))
    expect(m.ok).toBe(true)
    if (!m.ok) return
    const html = renderExportHtml(m.value)
    const doc = new DOMParser().parseFromString(html, 'text/html')
    // 真实解析视角：属性值不再被截断为 font-family:
    for (const el of doc.querySelectorAll('[style]')) {
      const s = el.getAttribute('style') ?? ''
      expect(s.length).toBeGreaterThan(10)
      expect(s.endsWith('font-family:')).toBe(false)
      expect(s).not.toBe('font-family:')
    }
    // 表体格：字体栈 + 底色声明齐备；首列表头 sticky 保留（FR-26）
    const td = doc.querySelector('tbody td')
    expect(td?.getAttribute('style')).toContain('font-family:"PingFang SC"')
    expect(td?.getAttribute('style')).toContain('background:')
    expect(doc.querySelector('th')?.getAttribute('style')).toContain('position:sticky;left:0')
  })

  it('其余属性输出点核查：scope/rowspan/colspan/aria-label 转义后均可被真实 DOM 完整解析', () => {
    const m = buildExportModel(cloneInstance(MATRIX_V1))
    expect(m.ok).toBe(true)
    if (!m.ok) return
    const html = renderExportHtml(m.value)
    expect(html).toContain('scope="col"')
    expect(html).toContain('rowspan="2"')
    expect(html).toContain('colspan=')
    const doc = new DOMParser().parseFromString(html, 'text/html')
    // aria-label（MARK_LABEL 中文枚举）挂在符号 td 上，解析回读不丢
    expect(doc.querySelector('td[aria-label="支持"]')).not.toBeNull()
    expect(doc.querySelector('td[aria-label="部分支持"]')).not.toBeNull()
    // 数值 span 属性解析回读为数字
    expect(doc.querySelector('th[rowspan="2"]')).not.toBeNull()
  })
})

// ── 自定义格式 T03：档位 px / 自定义色内联 / min-width 求和 / 任意结构（FR-C1/C2/C8）──

import { BLANK_V1 } from '../templates'
import { applyStructuralIntent } from '../store/structure'
import { applyEditIntent } from '../store/intent'
import { renderExportHtml } from './model'
import { resolveTheme, PALETTES } from '../theme/palettes'
import { FONT_SIZE_TIERS, PADDING_TIERS } from '../theme/layoutScales'
import type { TemplateInstance } from '../types'

describe('buildExportModel · 排版档位与自定义色（T03）', () => {
  it('档位 px 进内联样式：font-size / padding', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.layout.style = { fontSizeTier: 1, paddingTier: 3 }
    const m = buildExportModel(inst)
    expect(m.ok).toBe(true)
    if (!m.ok) return
    const cell = m.value.bodyRows.flat().find((c) => c.text !== '')
    expect(cell?.style).toContain(`font-size:${FONT_SIZE_TIERS[0]}px`)
    expect(cell?.style).toContain(`padding:${PADDING_TIERS[2]}px`)
  })

  it('自定义色进 HTML 内联与 option 同一色值（Palette 单点合成）', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.themeTokens = { primary: '#112233', emphasis: '#445566' }
    // option 侧（消费同一 Palette）
    const palette = resolveTheme(inst.themeId, inst.themeTokens).palette
    expect(palette.primary).toBe('#112233')
    // model 侧：表头格 background 与强调色均来自同一合成结果
    const m = buildExportModel(inst)
    expect(m.ok).toBe(true)
    if (!m.ok) return
    const headerCell = m.value.headRows.flat().find((c) => c.tag === 'th')
    expect(headerCell?.style).toContain('background:#112233')
    expect(headerCell?.style).toContain(`color:${palette.headerText}`)
    expect(headerCell?.style).toContain(`border:1px solid ${resolveTheme('T-A').palette.border}`)
    // 强调（red）格
    inst.slots['row.3.val.a'] = { text: '加红', emphasize: 'red' }
    const m2 = buildExportModel(inst)
    expect(m2.ok && m2.value.bodyRows.flat().some((c) => c.style.includes('color:#445566'))).toBe(true)
  })

  it('恢复预设（themeTokens 移除）后内联样式与纯预设逐格相等', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.themeTokens = { primary: '#112233' }
    const m1 = buildExportModel(inst)
    delete inst.themeTokens
    const m2 = buildExportModel(inst)
    const m3 = buildExportModel(cloneInstance(COMPARE_ALPHA_V1))
    expect(m1.ok && m2.ok && m3.ok).toBe(true)
    if (!(m1.ok && m2.ok && m3.ok)) return
    const styles = (x: typeof m1.value) => x.headRows.flat().concat(x.bodyRows.flat()).map((c) => c.style)
    expect(JSON.stringify(styles(m2.value))).toBe(JSON.stringify(styles(m3.value)))
    // 纯预设色值即 T-A 色板
    expect(styles(m3.value).some((s) => s.includes(`background:${PALETTES['T-A'].primary}`))).toBe(true)
  })

  it('minWidthPx 按 colWidths 求和；未设列宽沿用窄屏默认', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.layout.style = { colWidths: [200, null, 300, 100] }
    const m = buildExportModel(inst)
    expect(m.ok && m.value.minWidthPx).toBe(200 + 120 + 300 + 100)
    const m2 = buildExportModel(cloneInstance(PRICING_V1))
    expect(m2.ok && m2.value.minWidthPx).toBe(96 + 5 * 120)
  })
})

describe('buildExportModel · 结构编辑后任意行列数（T03 回归红线）', () => {
  it('1×1 极小表导出模型不炸', () => {
    const inst: TemplateInstance = {
      schemaVersion: '1.2',
      templateId: 'spec-1x1',
      themeId: 'T-A',
      slots: { u1: '唯一格' },
      blocks: [],
      layout: { rowCount: 1, colCount: 1, headerLevels: 1, blockSlots: [], slotGrid: [['u1']] },
    }
    const m = buildExportModel(inst)
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.value.headRows).toHaveLength(1)
    expect(m.value.bodyRows).toHaveLength(0)
    const html = renderExportHtml(m.value)
    expect(html).toContain('>唯一格</th>')
  })

  it('blank 加行加列至 20×12 + 自定义色/档位 → 导出模型与 HTML 不炸', () => {
    let cur = cloneInstance(BLANK_V1)
    for (let i = 0; i < 15; i++) {
      const r = applyStructuralIntent(cur, { kind: 'addRow' })
      if (r.ok) cur = r.value
    }
    for (let i = 0; i < 8; i++) {
      const r = applyStructuralIntent(cur, { kind: 'addCol' })
      if (r.ok) cur = r.value
    }
    expect(cur.layout.rowCount).toBe(20)
    expect(cur.layout.colCount).toBe(12)
    cur.themeTokens = { primary: '#112233' }
    cur.layout.style = { fontSizeTier: 3, rowHeightTier: 3, colWidths: Array(12).fill(80) }
    const m = buildExportModel(cur)
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.value.headRows).toHaveLength(1)
    expect(m.value.bodyRows.length).toBeGreaterThan(15)
    expect(m.value.minWidthPx).toBe(12 * 80)
    const html = renderExportHtml(m.value)
    expect(html).toContain('background:#112233')
    expect(html).toContain(`font-size:${FONT_SIZE_TIERS[2]}px`)
    expect(html).toContain('min-width:960px')
  })

  it('结构编辑（表头上调 + 合并）导出：rowspan/colspan 随收缩后 merges 输出', () => {
    const inst = cloneInstance(BLANK_V1)
    const up = applyStructuralIntent(inst, { kind: 'setHeaderLevel', levels: 2 })
    expect(up.ok).toBe(true)
    if (!up.ok) return
    let cur = up.value
    // 合并顶层表头 [0,1]-[0,3]
    cur.slots[cur.layout.slotGrid![0]![1]!] = '大类'
    const merged = applyEditIntent(cur, { kind: 'merge', range: { start: [0, 1], end: [0, 3] } })
    expect(merged.ok).toBe(true)
    if (!merged.ok) return
    cur = merged.value
    const m = buildExportModel(cur)
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.value.headRows).toHaveLength(2)
    expect(m.value.headRows[0]!.some((c) => c.colSpan === 3 && c.text === '大类')).toBe(true)
  })
})

// ── 交互升级 T03：导出同源（图片格 <img> / emphFooter tfoot 收窄 / leftTag 标签格）──

import { vi } from 'vitest'
import {
  buildVisualRows,
  clearCropCanvasCache,
  colWidthAt,
  drawImageCell,
  registerCellGroupFactory,
  toOption,
} from '../adapter/toOption'
import { coverCrop } from '../image/imageGuard'

/** 记录型画布 stub：createElement('canvas') 返回录参 2d ctx（jsdom 无 canvas 实现） */
function stubRecordingCanvas(): {
  calls: unknown[][]
  restore: () => void
} {
  const calls: unknown[][] = []
  const fakeCtx = { drawImage: (...a: unknown[]) => void calls.push(a) }
  const orig = document.createElement.bind(document)
  const spy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag === 'canvas') {
      return {
        width: 0,
        height: 0,
        getContext: () => fakeCtx,
      } as unknown as HTMLCanvasElement
    }
    return orig(tag) as HTMLElement
  }) as typeof document.createElement)
  return { calls, restore: () => spy.mockRestore() }
}

const T03_IMG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

describe('buildExportModel · 导出同源（交互升级 T03）', () => {
  it('图片格 → ExportCell.image 白名单透传，heightPx 与预览行高同源', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.slots['row.2.val.a'] = { image: T03_IMG }
    const m = buildExportModel(inst)
    expect(m.ok).toBe(true)
    if (!m.ok) return
    const cell = m.value.bodyRows.flat().find((c) => c.image === T03_IMG)
    expect(cell).toBeDefined()
    expect(cell?.text).toBe('')
    expect(cell?.tag).toBe('td')
    // td 行高 px 与预览 rowHeights 同一数据源（逻辑行 3 → 可视行 4，after-1 gap 占 1 行）
    const { rowHeights } = buildVisualRows(inst)
    expect(cell?.heightPx).toBe(rowHeights[4])
  })

  it('GC-22：非白名单 image 值按空格处理，不进导出模型', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.slots['row.2.val.a'] = { image: '"><script>alert(1)</script>' }
    const m = buildExportModel(inst)
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.value.bodyRows.flat().every((c) => c.image === undefined)).toBe(true)
    expect(m.value.bodyRows.flat().every((c) => !c.text.includes('script'))).toBe(true)
  })

  it('emphFooter 只进 tfoot（footer 槽行不再双输出到 bodyRows）', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.blocks.push({
      id: 'foot-1',
      type: 'emphFooter',
      slotId: 'footer-1',
      props: { text: '以上价格含税' },
    })
    const m = buildExportModel(inst)
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.value.footRows).toHaveLength(1)
    expect(m.value.footRows[0]![0]!.text).toBe('以上价格含税')
    expect(m.value.footRows[0]![0]!.tag).toBe('th')
    expect(m.value.footRows[0]![0]!.colSpan).toBe(inst.layout.colCount)
    // 修双输出：注脚行不出现在 bodyRows
    expect(m.value.bodyRows.flat().some((c) => c.text === '以上价格含税')).toBe(false)
    // 注脚样式与预览同源：纸底 + 次要灰 + 靠左小字（零新增色值 GC-11）
    const pa = PALETTES['T-A']
    expect(m.value.footRows[0]![0]!.style).toContain(`background:${pa.paper}`)
    expect(m.value.footRows[0]![0]!.style).toContain(`color:${pa.muted}`)
    expect(m.value.footRows[0]![0]!.style).toContain('text-align:left')
  })

  it('emphFooter styleTier=2 → 注脚字号略大（与预览档位同源，13+2）', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.blocks.push({
      id: 'foot-1',
      type: 'emphFooter',
      slotId: 'footer-1',
      props: { text: '注脚', styleTier: 2 },
    })
    const m = buildExportModel(inst)
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.value.footRows[0]![0]!.style).toContain('font-size:15px')
  })

  it('leftTag → th scope=row + tag 底色（与预览 styleForCell 同源）', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.blocks.push({ id: 'tag-1', type: 'leftTag', slotId: 'left-r2', props: { text: '推荐' } })
    const m = buildExportModel(inst)
    expect(m.ok).toBe(true)
    if (!m.ok) return
    const cell = m.value.bodyRows.flat().find((c) => c.text === '推荐')
    expect(cell?.tag).toBe('th')
    expect(cell?.scope).toBe('row')
    const pa = PALETTES['T-A']
    expect(cell?.style).toContain(`background:${pa.tag}`)
    expect(cell?.style).toContain(`color:${pa.tagText}`)
  })

  it('三处一致：预览 customLayout / drawImageCell（PNG 同源）/ 导出模型 cover 参数', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.slots['row.3.val.a'] = { image: T03_IMG }
    const asset = { naturalWidth: 1000, naturalHeight: 500 }
    const images = new Map([[T03_IMG, asset]])
    const { metas, rowHeights } = buildVisualRows(inst)
    const rect = { left: 0, top: 0, width: colWidthAt(inst, 1), height: rowHeights[4]! }
    clearCropCanvasCache()
    const { calls, restore } = stubRecordingCanvas()
    registerCellGroupFactory((img, w, h) => ({ marker: 'group', img, w, h }))
    try {
      // ① 预览：toOption customLayout 闭包 → drawImageCell → 离屏裁剪（录参）
      const opt = toOption(inst, { mode: 'export', images })
      const col = (opt.columns as { customLayout?: (a: unknown) => unknown }[])[1]!
      const ret1 = col.customLayout?.({ row: 4, col: 1, rect })
      expect(ret1).toBeDefined()
      expect(calls).toHaveLength(1)
      // ② PNG 同源：png.ts 注入 images 后走同一 customLayout 闭包 → drawImageCell 直调结果一致
      const ret2 = drawImageCell(metas[4]![1], asset, { row: 4, col: 1, rect })
      expect(ret2).toEqual(ret1)
      expect(calls).toHaveLength(1) // 同图同尺寸命中裁剪缓存，不重复裁
      // ③ 导出：img 格 heightPx 与 rect.height 一致；coverCrop 单点复算与绘制参数一致
      const m = buildExportModel(inst)
      expect(m.ok).toBe(true)
      if (!m.ok) return
      const cell = m.value.bodyRows.flat().find((c) => c.image === T03_IMG)
      expect(cell?.heightPx).toBe(rect.height)
      const { sw, sh } = coverCrop(asset.naturalWidth, asset.naturalHeight, rect.width, rect.height)
      expect(calls[0]).toEqual([
        asset,
        (asset.naturalWidth - sw) / 2,
        (asset.naturalHeight - sh) / 2,
        sw,
        sh,
        0,
        0,
        rect.width,
        rect.height,
      ])
    } finally {
      restore()
      registerCellGroupFactory(null)
      clearCropCanvasCache()
    }
  })
})
