// T34：VTable 深入口（ListTable-simple），与 png.ts 同口径，避免 index 全量入口连带图表依赖
import { ListTableSimple as ListTable } from '@visactor/vtable/es/ListTable-simple'
import type {
  BlockDesc,
  CoreHandle,
  CoreOptions,
  PngExportOptions,
  RenderState,
  SlotValue,
  TemplateJSON,
  ThemeTokens,
} from '../types'
import { toOption } from '../adapter/toOption'
import { exportHtml } from '../export/html'
import { exportPng } from '../export/png'
import { cloneInstance } from '../schema/validate'
import { isThemeId, DEFAULT_THEME_ID } from '../theme/palettes'

export function mount(el: HTMLElement, options?: CoreOptions): CoreHandle {
  let instance = options?.initial ? cloneInstance(options.initial) : null
  let table: ListTable | null = null
  let renderState: RenderState = 'loading'
  const setState = (s: RenderState) => {
    renderState = s
    options?.onRenderState?.(s)
  }

  const paint = () => {
    if (!instance) return
    setState('loading')
    try {
      const option = toOption(instance, { mode: 'preview' }) as ConstructorParameters<
        typeof ListTable
      >[1]
      if (!table) {
        table = new ListTable(el, option)
      } else {
        table.updateOption(option)
      }
      setState('ready')
    } catch (e) {
      setState('error')
      options?.onError?.({
        code: 'RENDER_FAIL',
        message: e instanceof Error ? e.message : '渲染失败',
      })
    }
  }

  if (instance) paint()

  const handle: CoreHandle = {
    loadTemplate(json: TemplateJSON) {
      instance = cloneInstance(json)
      paint()
    },
    applyTheme(themeId: string | ThemeTokens) {
      if (!instance) return
      if (typeof themeId === 'string') {
        instance.themeId = isThemeId(themeId) ? themeId : DEFAULT_THEME_ID
      } else {
        instance.themeTokens = themeId
      }
      paint()
    },
    setSlot(slotId: string, value: SlotValue) {
      if (!instance) return
      instance.slots[slotId] = value
      paint()
    },
    addBlock(block: BlockDesc) {
      if (!instance) return
      instance.blocks = instance.blocks.filter((b) => b.slotId !== block.slotId)
      instance.blocks.push(block)
      paint()
    },
    removeBlock(blockId: string) {
      if (!instance) return
      instance.blocks = instance.blocks.filter((b) => b.id !== blockId)
      paint()
    },
    async exportHtml() {
      if (!instance) throw { code: 'EXPORT_HTML_FAIL', message: '无实例' }
      if (renderState !== 'ready') throw { code: 'EXPORT_BLOCKED_RENDERING', message: '请等待表格渲染完成' }
      const r = exportHtml(instance)
      if (!r.ok) throw r.error
      return r.value
    },
    async exportPng(opts?: PngExportOptions) {
      if (!instance) throw { code: 'EXPORT_PNG_FAIL', message: '无实例' }
      if (renderState !== 'ready') throw { code: 'EXPORT_BLOCKED_RENDERING', message: '请等待表格渲染完成' }
      const r = await exportPng(instance, opts)
      if (!r.ok) throw r.error
      return r.value
    },
    getPreviewEl() {
      return el
    },
    destroy() {
      try {
        table?.release?.()
      } catch {
        /* ignore */
      }
      table = null
      instance = null
    },
  }

  return handle
}
