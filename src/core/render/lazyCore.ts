/**
 * T34 渲染核动态导入出口：`@visactor/vtable` 只被 coreHost / png 触达，
 * 经本出口的动态导入把 VTable 切成独立 chunk，首屏入口不加载渲染核。
 * 壳层仍只从 `@/core` 导入（C-4），不感知动态导入细节。
 */

import type { Result } from '../errors'
import type {
  CoreHandle,
  CoreOptions,
  PngExportOptions,
  TemplateInstance,
} from '../types'
import { measureContentSize } from '../adapter/toOption'
import { measurePng } from '../export/pngSize'

export interface RenderCore {
  /** 挂载预览表格（创建 ListTable 实例） */
  mount: (el: HTMLElement, options?: CoreOptions) => CoreHandle
  /** 离屏重绘导出 PNG */
  exportPng: (
    inst: TemplateInstance,
    opts?: PngExportOptions,
  ) => Promise<Result<Blob>>
  measurePng: typeof measurePng
  measureContentSize: typeof measureContentSize
}

let cached: Promise<RenderCore> | null = null

/**
 * 加载渲染核（mount / exportPng 所在的 VTable 动态 chunk）。
 * 结果缓存：多次调用共享同一次模块加载。
 */
export function loadRenderCore(): Promise<RenderCore> {
  cached ??= Promise.all([import('./coreHost'), import('../export/png')]).then(
    ([host, png]) => ({
      mount: host.mount,
      exportPng: png.exportPng,
      measurePng,
      measureContentSize,
    }),
  )
  return cached
}
