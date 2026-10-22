// T34：VTable 经 vtableLite 深入口（plain ListTable + 构造期必需注册），避免 index 全量入口连带图表依赖
import { ListTable } from './vtableLite'
import type {
  BlockDesc,
  CoreHandle,
  CoreOptions,
  PngExportOptions,
  RenderState,
  SlotValue,
  TemplateJSON,
  ThemeTokens,
  ViewportHit,
  ViewportRect,
} from '../types'
import { toOption } from '../adapter/toOption'
import { exportHtml } from '../export/html'
import { collectImageUrls, exportPng, preloadImages } from '../export/png'
import { cloneInstance } from '../schema/validate'
import { isThemeId, DEFAULT_THEME_ID } from '../theme/palettes'
import { COL_WIDTH_RANGE } from '../theme/layoutScales'

export function mount(el: HTMLElement, options?: CoreOptions): CoreHandle {
  let instance = options?.initial ? cloneInstance(options.initial) : null
  let table: ListTable | null = null
  let renderState: RenderState = 'loading'
  // 预览图片资源缓存（键 = data URL）：跨 paint 复用、增量补载；随 paint 剪枝到
  // 当前实例引用的资源，避免换图累积。加载失败的图不入缓存（格回退默认绘制）。
  const imageAssets = new Map<string, HTMLImageElement>()
  // paint 世代号：preloadImages 异步窗口内的过期 paint 直接丢弃，旧结果不覆盖新表
  let paintSeq = 0
  const setState = (s: RenderState) => {
    renderState = s
    options?.onRenderState?.(s)
  }

  // ── PX-04 v2：命中与叠加层几何直接消费渲染器（VTable）的权威坐标 ──
  // 壳层几何（estimateCellRects/locateVisual）是「内容坐标」纯算术，不含滚动与冻结列偏移；
  // VTable 内部滚动（frozenColCount 模板横向滚动）后两者会脱节 → 点选/描边/落点错位。
  // 这里把 VTable 的 relative 系 API（滚动 / 冻结列 / 列宽调整感知）经 CoreHandle 暴露给壳层。
  const viewportListeners = new Set<() => void>()
  const colResizeListeners = new Set<(col: number, widths: number[]) => void>()
  let eventsAttached = false

  const notifyViewport = () => {
    for (const cb of viewportListeners) {
      try {
        cb()
      } catch {
        /* 订阅方异常不影响渲染核 */
      }
    }
  }

  /** 画布相对容器（mount 传入元素）的偏移；VTable 坐标以画布为原点，叠加层以容器为原点 */
  const canvasOffset = (): { dx: number; dy: number } => {
    const canvas = el.querySelector('canvas')
    if (!canvas) return { dx: 0, dy: 0 }
    const c = canvas.getBoundingClientRect()
    const h = el.getBoundingClientRect()
    return { dx: c.left - h.left, dy: c.top - h.top }
  }

  const attachTableEvents = () => {
    if (!table || eventsAttached) return
    eventsAttached = true
    // 订阅生命周期随 table.release()（destroy）一并回收
    table.on('scroll', () => notifyViewport())
    table.on('resize_column', () => notifyViewport())
    table.on('resize_column_end', (args) => {
      notifyViewport()
      for (const cb of colResizeListeners) {
        try {
          cb(args.col, args.colWidths)
        } catch {
          /* 同上 */
        }
      }
    })
    table.on('resize_row_end', () => notifyViewport())
  }

  /**
   * WP4：列宽拖拽实时钳制到模型允许区间（[64,360]），与 setColWidth 的 clampColWidth 同源；
   * 不设限则拖到 600 松手后模型收口，视觉上「弹回」。VTable 在 _moveHeaderPosition（dragOrder）
   * 与重建路径会清空该表，故每次 paint 后重设。
   */
  const applyColWidthLimits = () => {
    if (!table) return
    const limits: Record<number, { min: number; max: number }> = {}
    for (let col = 0; col < table.colCount; col++) {
      limits[col] = { min: COL_WIDTH_RANGE[0], max: COL_WIDTH_RANGE[1] }
    }
    table.colWidthsLimit = limits
  }

  const paint = async () => {
    if (!instance) return
    setState('loading')
    const seq = ++paintSeq
    try {
      // 预览同源注入（types.ts RenderContext 口径）：collectImageUrls / preloadImages
      // 与 PNG 导出共用（同 chunk），customLayout 闭包经 drawImageCell 画出图片格
      const urls = collectImageUrls(instance)
      const missing = urls.filter((u) => !imageAssets.has(u))
      if (missing.length > 0) {
        const loaded = await preloadImages(missing)
        if (seq !== paintSeq) return // 期间已有更新的 paint，过期资源不再落地
        for (const [k, v] of loaded) imageAssets.set(k, v)
      }
      // 迭代中删除自身键是 Map 的既有语义，无需先复制
      for (const k of imageAssets.keys()) {
        if (!urls.includes(k)) imageAssets.delete(k)
      }
      const images = urls.length > 0 ? imageAssets : undefined
      const option = toOption(instance, { mode: 'preview', images }) as ConstructorParameters<
        typeof ListTable
      >[1]
      if (seq !== paintSeq) return
      if (!table) {
        table = new ListTable(el, option)
        attachTableEvents()
      } else {
        table.updateOption(option)
      }
      applyColWidthLimits()
      if (seq === paintSeq) {
        setState('ready')
        // 重绘后几何已变（行列/区块/列宽）：通知壳层重算叠加层与落点
        notifyViewport()
      }
    } catch (e) {
      if (seq !== paintSeq) return
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
    hitTest(x: number, y: number): ViewportHit | null {
      if (!table) return null
      const { dx, dy } = canvasOffset()
      const hit = table.getCellAtRelativePosition(x - dx, y - dy)
      if (!hit || hit.row < 0 || hit.col < 0) return null
      if (hit.row >= table.rowCount || hit.col >= table.colCount) return null
      return { row: hit.row, col: hit.col }
    },
    getCellViewportRect(visualRow: number, col: number): ViewportRect | null {
      if (!table) return null
      if (visualRow < 0 || col < 0 || visualRow >= table.rowCount || col >= table.colCount) return null
      const { dx, dy } = canvasOffset()
      const r = table.getCellRelativeRect(col, visualRow)
      return { left: r.left + dx, top: r.top + dy, width: r.width, height: r.height }
    },
    getCellViewportRects(): ViewportRect[][] | null {
      if (!table) return null
      const { dx, dy } = canvasOffset()
      const rows: ViewportRect[][] = []
      for (let row = 0; row < table.rowCount; row++) {
        const line: ViewportRect[] = []
        for (let col = 0; col < table.colCount; col++) {
          const r = table.getCellRelativeRect(col, row)
          line.push({ left: r.left + dx, top: r.top + dy, width: r.width, height: r.height })
        }
        rows.push(line)
      }
      return rows
    },
    onViewportChange(cb: () => void): () => void {
      viewportListeners.add(cb)
      return () => {
        viewportListeners.delete(cb)
      }
    },
    onColResize(cb: (col: number, widths: number[]) => void): () => void {
      colResizeListeners.add(cb)
      return () => {
        colResizeListeners.delete(cb)
      }
    },
    destroy() {
      try {
        table?.release?.()
      } catch {
        /* ignore */
      }
      table = null
      instance = null
      eventsAttached = false
      viewportListeners.clear()
      colResizeListeners.clear()
    },
  }

  return handle
}
