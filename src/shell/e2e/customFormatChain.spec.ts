import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  COMPARE_ALPHA_V1,
  buildExportModel,
  createBlankInstance,
  hasContentInCol,
  isRoleOverridden,
  listPresetTemplates,
  migrateInstance,
  renderExportHtml,
  roleColorOf,
  type TemplateInstance,
} from '@/core'
import { useEditorStore } from '../stores/editor'
import { useLibraryStore } from '../stores/library'

/**
 * T05 端到端回归（spec 层，不挂 DOM）：
 * 新建空白表 → 加 2 行 → 删 1 列（非空）→ 表头 1→2 层 → 合并
 * → 自定义色 + 档位 → 另存为我的模板 → 重新选用（migrate 1.2 读路径）
 * → 粘贴 → 导出 HTML。
 * 存储以内存 Map 模拟（JSON round-trip 等价 IndexedDB 持久化语义），草稿内存化。
 */

const { storeMap } = vi.hoisted(() => ({ storeMap: new Map<string, Record<string, unknown>>() }))

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
  saveDraft: vi.fn<() => Promise<void>>(async () => {}),
  loadDraft: vi.fn<() => Promise<null>>(async () => null),
  clearDraft: vi.fn<() => Promise<void>>(async () => {}),
}))

beforeEach(() => {
  setActivePinia(createPinia())
  storeMap.clear()
})

describe('T05 · 自定义格式全链路（新建空白表 → … → 导出）', () => {
  it('新建空白表 → 加 2 行 → 删 1 列（非空）→ 表头 2 层 → 合并 → 自定义色+档位', () => {
    const editor = useEditorStore()
    // 1. 新建空白表（向导参数直达工厂）
    editor.openTemplate(createBlankInstance({ rows: 5, cols: 4, headerLevels: 1 }))
    expect(editor.current?.meta?.templateType).toBe('blank')

    // 2. 加 2 行：5 → 7
    editor.apply({ kind: 'addRow' })
    editor.apply({ kind: 'addRow' })
    expect(editor.current?.layout.slotGrid).toHaveLength(7)

    // 3. 删 1 列（非空 → 壳层会确认，这里直接走意图核验连带删除）
    const grid0 = editor.current!.layout.slotGrid!
    editor.setSlotText(grid0[1]![1]!, '将被删掉的列')
    editor.setSlotText(grid0[2]![1]!, '同列第二格')
    expect(hasContentInCol(editor.current!, 1)).toBe(true)
    editor.apply({ kind: 'removeCol', col: 1 })
    expect(editor.current?.layout.colCount).toBe(3)
    // 原第 3 列内容被 remap 到第 2 列（删除列的槽位连带清除）
    const grid1 = editor.current!.layout.slotGrid!
    expect(String(editor.current!.slots[grid1[1]![1]!] ?? '')).not.toContain('将被删掉')

    // 4. 表头 1 → 2 层（上调会在顶部插 1 行：7 → 8 行，表体整体下移）
    editor.apply({ kind: 'setHeaderLevel', levels: 2 })
    expect(editor.current?.layout.headerLevels).toBe(2)
    expect(editor.current?.layout.slotGrid).toHaveLength(8)

    // 5. 合并表体同一行相邻两格（合并闸：仅支持同行或同列相邻合并）
    const merged = editor.apply({ kind: 'merge', range: { start: [3, 0], end: [3, 1] } })
    expect(merged).toBe(true)
    expect(editor.current?.layout.merges).toHaveLength(1)
  })

  it('另存 → 重新选用（migrate 1.2 读路径）→ 粘贴 → 导出 HTML，全链路保真', async () => {
    const editor = useEditorStore()
    const library = useLibraryStore()

    // 前置：建表 + 结构与样式定制（先合并同行相邻两格，再上调表头——顶部插行后合并区平移到第 4 行）
    editor.openTemplate(createBlankInstance({ rows: 5, cols: 4, headerLevels: 1 }))
    editor.apply({ kind: 'addRow' }) // 6 行
    expect(
      editor.apply({ kind: 'merge', range: { start: [2, 0], end: [2, 1] } }),
    ).toBe(true)
    editor.apply({ kind: 'setHeaderLevel', levels: 2 }) // 顶部插 1 行 → 7 行，表体从第 3 行起
    editor.apply({ kind: 'setThemeToken', token: 'primary', value: '#123456' })
    editor.apply({ kind: 'setRowHeightTier', tier: 3 })
    editor.apply({ kind: 'setColWidth', col: 0, width: 200 })
    expect(isRoleOverridden(editor.current, 'primary')).toBe(true) // 有自定义色

    // 另存为我的模板（内存 repo）
    const saved = await library.saveAsTemplate(editor.current!, 'E2E 定制空白表')
    expect(storeMap.has(`tpl:${saved.templateId}`)).toBe(true)

    // 重新选用：模拟持久化读回 + migrate 1.2 读路径
    const raw = storeMap.get(`tpl:${saved.templateId}`) as unknown as TemplateInstance
    const m = migrateInstance(JSON.parse(JSON.stringify(raw)), listPresetTemplates())
    expect(m.ok && m.value.schemaVersion).toBe('1.2')
    editor.openTemplate(m.ok ? m.value : raw)
    const cur = editor.current!
    expect(cur.layout.rowCount).toBe(7) // 5 + 加 1 行 + 表头上调插 1 行
    expect(cur.layout.headerLevels).toBe(2)
    expect(cur.layout.merges).toHaveLength(1) // 合并区随存随取（平移后 [3,0]-[3,1]）
    expect(cur.layout.merges![0]).toEqual({ start: [3, 0], end: [3, 1] })
    expect(roleColorOf(cur, 'primary')).toBe('#123456')
    expect(cur.layout.style?.rowHeightTier).toBe(3)
    expect(cur.layout.style?.colWidths?.[0]).toBe(200)

    // 粘贴 2×2（按最新网格；落在未合并的表体区：逻辑行 5~6、列 0~1）
    const grid = cur.layout.slotGrid!
    const anchor = grid[5]![0]!
    editor.selectedSlotId = anchor
    const started = editor.pasteStart({ text: '甲\t乙\n丙\t丁' })
    expect(started).toBe(true)
    expect(editor.pastePending).toBe(true)
    editor.confirmPaste()
    expect(editor.current?.slots[grid[5]![0]!]).toMatchObject({ text: '甲' })
    expect(editor.current?.slots[grid[5]![1]!]).toMatchObject({ text: '乙' })
    expect(editor.current?.slots[grid[6]![0]!]).toMatchObject({ text: '丙' })
    expect(editor.current?.slots[grid[6]![1]!]).toMatchObject({ text: '丁' })

    // 导出 HTML：结构（2 层表头 + 合并）与自定义色/档位都进产物
    const model = buildExportModel(editor.current!)
    expect(model.ok).toBe(true)
    const html = model.ok ? renderExportHtml(model.value) : ''
    expect(html).toContain('#123456') // 自定义表头底色内联
    expect(html).toContain('甲')
    expect(html).toContain('colspan="2"') // 2×2 合并区
  })

  it('旧模板兼容：schema 1.1 预设走 migrate 读路径后渲染/导出全通', () => {
    const editor = useEditorStore()
    const raw = JSON.parse(JSON.stringify(COMPARE_ALPHA_V1)) as TemplateInstance
    expect(raw.schemaVersion).toBe('1.1')
    const m = migrateInstance(raw, listPresetTemplates())
    expect(m.ok && m.value.schemaVersion).toBe('1.2')
    editor.openTemplate(m.ok ? m.value : raw)
    // 原槽位内容与结构都在
    expect(editor.current?.slots['obj.name.a']).toBe('方案 A')
    const model = buildExportModel(editor.current!)
    expect(model.ok).toBe(true)
    const html = model.ok ? renderExportHtml(model.value) : ''
    expect(html).toContain('全国')
  })
})
