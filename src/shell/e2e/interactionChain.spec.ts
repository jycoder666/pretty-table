import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  COMPARE_ALPHA_V1,
  DETAIL_ALPHA_V1,
  buildExportModel,
  createBlankInstance,
  listPresetTemplates,
  measureContentSize,
  measurePng,
  migrateInstance,
  renderExportHtml,
  toOption,
  type TemplateInstance,
} from '@/core'
import { useEditorStore } from '../stores/editor'
import { useLibraryStore } from '../stores/library'

/**
 * T05 端到端回归（交互升级批次收尾，spec 层不挂 DOM）：
 * 空白表 → 传图 → 换图 → 撤销 → 矩形合并 2×3 → 删行收缩 → 导出 HTML / PNG 测量
 * → 另存模板 → 读回保真（含图）；
 * 草稿恢复带图；二期区块与既有区块共存导出一致；删行连带 leftTag 收缩提示；
 * 旧模板读回不受影响；IA 数值（2MB / 10 张）注入用例可复现。
 * 存储以内存 Map 模拟（JSON round-trip 等价 IndexedDB 持久化语义）。
 */

const { storeMap, draftBox } = vi.hoisted(() => ({
  storeMap: new Map<string, Record<string, unknown>>(),
  draftBox: { value: null as Record<string, unknown> | null },
}))

vi.mock('../repo/idbTemplateRepo', () => ({
  createIdbTemplateRepo: () => ({
    async list(): Promise<TemplateInstance[]> {
      const out: TemplateInstance[] = []
      for (const [k, v] of storeMap) {
        if (k.startsWith('tpl:')) out.push(JSON.parse(JSON.stringify(v)) as TemplateInstance)
      }
      return out
    },
    async get(templateId: string): Promise<TemplateInstance | null> {
      const v = storeMap.get(`tpl:${templateId}`)
      return v ? (JSON.parse(JSON.stringify(v)) as TemplateInstance) : null
    },
    async save(inst: TemplateInstance): Promise<void> {
      storeMap.set(`tpl:${inst.templateId}`, JSON.parse(JSON.stringify(inst)))
    },
    async remove(templateId: string): Promise<void> {
      storeMap.delete(`tpl:${templateId}`)
    },
  }),
}))

vi.mock('../repo/draftRepo', () => ({
  saveDraft: vi.fn<(inst: TemplateInstance) => Promise<void>>(async (inst: TemplateInstance) => {
    // DraftPayload 形状：{ instance, savedAt }（与真实 draftRepo 一致）
    draftBox.value = { instance: JSON.parse(JSON.stringify(inst)), savedAt: Date.now() }
  }),
  loadDraft: vi.fn<() => Promise<{ instance: TemplateInstance } | null>>(async () =>
    draftBox.value ? (JSON.parse(JSON.stringify(draftBox.value)) as { instance: TemplateInstance }) : null,
  ),
  clearDraft: vi.fn<() => Promise<void>>(async () => {
    draftBox.value = null
  }),
}))

const IMG_A =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
// 另一张合法 PNG（1×1 灰点），用于「换图」
const IMG_B =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function pngFile(dataUrl: string, name = 'a.png'): File {
  const bin = atob(dataUrl.split(',')[1]!)
  const bytes = new Uint8Array([...bin].map((ch) => ch.charCodeAt(0)))
  return new File([bytes], name, { type: 'image/png' })
}

/** 超 2MB 伪 PNG（合法 1×1 头 + 零填充，字节闸先拦） */
function oversizedPngFile(): File {
  const bin = atob(IMG_A.split(',')[1]!)
  const head = new Uint8Array([...bin].map((ch) => ch.charCodeAt(0)))
  const bytes = new Uint8Array(2 * 1024 * 1024 + 1)
  bytes.set(head)
  return new File([bytes], 'big.png', { type: 'image/png' })
}

beforeEach(() => {
  setActivePinia(createPinia())
  storeMap.clear()
  draftBox.value = null
})

describe('T05 · 含图实例全链路（新建 → 传图 → 换图 → 撤销 → 矩形合并 → 删行 → 导出 → 另存读回）', () => {
  it('主链：传图/换图/撤销/2×3 矩形合并/删行收缩/导出/另存/读回保真', async () => {
    const editor = useEditorStore()
    const library = useLibraryStore()

    // 1. 新建空白表
    editor.openTemplate(createBlankInstance({ rows: 6, cols: 4, headerLevels: 1 }))
    const grid0 = editor.current!.layout.slotGrid!
    const imgSlot = grid0[2]![1]!
    editor.selectedSlotId = imgSlot

    // 2. 上传图片（mock File）→ 槽值变 {image}
    expect(await editor.uploadImage(imgSlot, pngFile(IMG_A))).toBe(true)
    expect(editor.current!.slots[imgSlot]).toMatchObject({ image: IMG_A })

    // 3. 替换图片（同入口再设一次）
    expect(await editor.uploadImage(imgSlot, pngFile(IMG_B, 'b.png'))).toBe(true)
    expect(editor.current!.slots[imgSlot]).toMatchObject({ image: IMG_B })

    // 4. 撤销一步 → 回到上一张图（FR-10：一意图一张快照，撤销一步语义）
    editor.undo()
    expect(editor.current!.slots[imgSlot]).toMatchObject({ image: IMG_A })

    // 5. 重新设图（后续链路带图），再做 2×3 矩形合并（逻辑行 3~4 × 列 0~2）
    expect(await editor.uploadImage(imgSlot, pngFile(IMG_A))).toBe(true)
    const merged = editor.apply({ kind: 'merge', range: { start: [3, 0], end: [4, 2] } })
    expect(merged).toBe(true)
    expect(editor.current!.layout.merges).toContainEqual({ start: [3, 0], end: [4, 2] })

    // 6. 删一行（合并区内）→ 矩形收缩 2×3 → 1×3（remap 沿轴收缩）
    const removed = editor.apply({ kind: 'removeRow', row: 4 })
    expect(removed).toBe(true)
    expect(editor.current!.layout.merges).toContainEqual({ start: [3, 0], end: [3, 2] })
    // 图片槽不受删行影响（在合并区外）
    expect(editor.current!.slots[imgSlot]).toMatchObject({ image: IMG_A })

    // 7. 导出 HTML：img 进产物（GC-22 白名单 src + object-fit:cover）
    const model = buildExportModel(editor.current!)
    expect(model.ok).toBe(true)
    if (!model.ok) return
    const html = renderExportHtml(model.value)
    expect(html).toContain(`<img src="${IMG_A}"`)
    expect(html).toContain('object-fit:cover')
    expect(html).not.toContain('rowspan') // 收缩后不再跨行
    expect(html).toContain('colspan="3"')

    // 8. PNG：测量与预览同源（content 尺寸 = 行高/列宽同源求和）；离屏栅格化属真机验收项
    const m = measurePng(editor.current!, 2)
    const content = measureContentSize(editor.current!)
    expect(m.outWidth).toBe((content.width + 32) * 2)
    expect(m.outHeight).toBe((content.height + 32) * 2)
    // PNG 渲染路径与预览共用 toOption：含图列挂 customLayout（P1 自持裁剪通道）、images 可注入
    const images = new Map([[IMG_A, { naturalWidth: 8, naturalHeight: 8 }]])
    const opt = toOption(editor.current!, { mode: 'export', images })
    const cols = opt.columns as { customLayout?: unknown }[]
    expect(cols.some((c) => typeof c.customLayout === 'function')).toBe(true)

    // 9. 另存为我的模板 → 读回（migrate 1.2 路径）→ 图片还在、合并区还在
    const saved = await library.saveAsTemplate(editor.current!, 'T05 含图表')
    expect(storeMap.has(`tpl:${saved.templateId}`)).toBe(true)
    const raw = storeMap.get(`tpl:${saved.templateId}`) as unknown as TemplateInstance
    const mig = migrateInstance(JSON.parse(JSON.stringify(raw)), listPresetTemplates())
    expect(mig.ok && mig.value.schemaVersion).toBe('1.2')
    editor.openTemplate(mig.ok ? mig.value : raw)
    expect(editor.current!.slots[imgSlot]).toMatchObject({ image: IMG_A })
    expect(editor.current!.layout.merges).toContainEqual({ start: [3, 0], end: [3, 2] })
  })

  it('草稿恢复带图：自动保存的草稿含图，tryRestoreDraft 后图片完整', async () => {
    const editor = useEditorStore()
    editor.openTemplate(createBlankInstance({ rows: 5, cols: 4, headerLevels: 1 }))
    const grid = editor.current!.layout.slotGrid!
    const sid = grid[1]![1]!
    editor.selectedSlotId = sid
    expect(await editor.uploadImage(sid, pngFile(IMG_A))).toBe(true)
    // persistDraft 已随 apply 自动触发；模拟刷新：重新 restore
    const restored = await editor.tryRestoreDraft()
    expect(restored).toBe('restored')
    expect(editor.current!.slots[sid]).toMatchObject({ image: IMG_A })
  })
})

describe('T05 · 二期区块与既有区块共存 / 删行连带收缩', () => {
  it('sectionBar + groupHeader + emphFooter + leftTag 同表共存：预览与导出一致', async () => {
    const editor = useEditorStore()
    // detail 模板自带 sectionBar + groupHeader 两类既有区块
    editor.openTemplate(JSON.parse(JSON.stringify(DETAIL_ALPHA_V1)) as TemplateInstance)
    const typesBefore = editor.current!.blocks.map((b) => b.type)
    expect(typesBefore).toContain('sectionBar')
    expect(typesBefore).toContain('groupHeader')
    // 补两类新区块
    editor.addBlock('emphFooter', 'footer-1')
    editor.addBlock('leftTag', 'left-r2')
    // addBlock 不自动选中 → 手动选中新区块再改文案（与点击选中同链路）
    const footerBlk = editor.current!.blocks.find((b) => b.type === 'emphFooter')!
    editor.selectedBlockId = footerBlk.id
    editor.updateBlockText('以上价格含税')
    const tagBlk = editor.current!.blocks.find((b) => b.type === 'leftTag')!
    editor.selectedBlockId = tagBlk.id
    editor.updateBlockText('推荐')
    const cur = editor.current!
    expect(cur.blocks.map((b) => b.type)).toEqual(
      expect.arrayContaining([...typesBefore, 'emphFooter', 'leftTag']),
    )

    // 预览：注脚行在表底（buildVisualRows），leftTag 占逻辑行 2 首列
    const model = buildExportModel(cur)
    expect(model.ok).toBe(true)
    if (!model.ok) return
    expect(model.value.footRows).toHaveLength(1)
    expect(model.value.footRows[0]![0]!.text).toBe('以上价格含税')
    // 注脚不出现在表体（修双输出红线）
    expect(model.value.bodyRows.flat().some((c) => c.text === '以上价格含税')).toBe(false)
    const tag = model.value.bodyRows.flat().find((c) => c.text === '推荐')
    expect(tag?.tag).toBe('th')
    expect(tag?.scope).toBe('row')
    // 既有区块行仍在表体（colspan 整行）
    expect(model.value.bodyRows.some((r) => r.length === 1 && r[0]?.colSpan === cur.layout.colCount)).toBe(true)
  })

  it('删行连带 leftTag 收缩：锚定行被删 → 区块连带删除 + 白话提示', async () => {
    const editor = useEditorStore()
    editor.openTemplate(JSON.parse(JSON.stringify(COMPARE_ALPHA_V1)) as TemplateInstance)
    editor.addBlock('leftTag', 'left-r2')
    const tagBlk = editor.current!.blocks.find((b) => b.type === 'leftTag')!
    editor.selectedBlockId = tagBlk.id
    editor.updateBlockText('推荐')
    expect(editor.current!.blocks.some((b) => b.type === 'leftTag')).toBe(true)
    const removed = editor.apply({ kind: 'removeRow', row: 2 })
    expect(removed).toBe(true)
    expect(editor.current!.blocks.some((b) => b.type === 'leftTag')).toBe(false)
    // STRUCT_LOSS warn 聚合白话 toast（GC-25）
    expect(editor.toast).toContain('合并或内容')
  })
})

describe('T05 · 既有链回归（无图实例不受批次影响）', () => {
  it('纯文本粘贴链路保持；无图实例导出 HTML 字节级一致（模板存取 round-trip）', async () => {
    const editor = useEditorStore()
    const library = useLibraryStore()
    editor.openTemplate(JSON.parse(JSON.stringify(COMPARE_ALPHA_V1)) as TemplateInstance)

    // 粘贴文本 1×1（S9 直写）→ 可撤销
    editor.selectedSlotId = 'row.3.val.a'
    expect(editor.pasteStart({ text: '新值' })).toBe(true)
    expect(editor.current!.slots['row.3.val.a']).toEqual({ text: '新值' })
    editor.undo()
    expect(editor.current!.slots['row.3.val.a']).toBe('1 个工作日')

    // 无图实例导出 HTML 在「另存 → 读回」前后字节级一致
    const m1 = buildExportModel(editor.current!)
    expect(m1.ok).toBe(true)
    const htmlBefore = m1.ok ? renderExportHtml(m1.value) : ''
    // 用当前 displayName 另存，保证 caption 不变（只验证 round-trip 保真）
    const saved = await library.saveAsTemplate(
      editor.current!,
      editor.current!.meta?.displayName ?? '多列对比表',
    )
    const raw = storeMap.get(`tpl:${saved.templateId}`) as unknown as TemplateInstance
    const mig = migrateInstance(JSON.parse(JSON.stringify(raw)), listPresetTemplates())
    expect(mig.ok).toBe(true)
    editor.openTemplate(mig.ok ? mig.value : raw)
    const model2 = buildExportModel(editor.current!)
    expect(model2.ok).toBe(true)
    if (!model2.ok) return
    const htmlAfter = renderExportHtml(model2.value)
    expect(htmlAfter).toBe(htmlBefore)
  })
})

describe('T05 · IA 数值注入用例（2MB 单图 / 10 张上限）', () => {
  it('单图超 2MB → 拒收；第 11 张 → 数量上限拒收（白话文案）', async () => {
    const editor = useEditorStore()
    editor.openTemplate(createBlankInstance({ rows: 8, cols: 4, headerLevels: 1 }))
    const grid = editor.current!.layout.slotGrid!
    const sid = grid[1]![1]!
    editor.selectedSlotId = sid
    // 单图超 2MB
    expect(await editor.uploadImage(sid, oversizedPngFile())).toBe(false)
    expect(editor.toast).toContain('图片太大')
    // 填满 10 张
    let filled = 0
    outer: for (let r = 1; r < grid.length; r++) {
      for (let c = 0; c < grid[r]!.length; c++) {
        const s = grid[r]![c]
        if (!s) continue
        if (await editor.uploadImage(s, pngFile(IMG_A))) filled++
        if (filled === 10) break outer
      }
    }
    expect(filled).toBe(10)
    // 第 11 张（替换也放不下的新槽）→ IMAGE_BUDGET_EXCEEDED 白话
    const extra = grid[7]![3]!
    editor.selectedSlotId = extra
    expect(await editor.uploadImage(extra, pngFile(IMG_B, 'c.png'))).toBe(false)
    expect(editor.toast).toContain('上限')
  })
})
