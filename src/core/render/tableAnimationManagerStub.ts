/**
 * T-slim · `vtable/es/core/animation.js` 的构建期桩（见 vite.config.ts `pt-vtable-browser-env-only`
 * 的 `'./animation'` 重定向）。
 *
 * 原文件 `TableAnimationManager` 是 vrender-animate（@visactor/vrender-animate，sideEffects:false）
 * 在全 chunk 的唯一 vtable 侧消费者：构造即 `new DefaultTimeline / new DefaultTicker`，并经
 * `../vrender` barrel 取 Animate/ACustomAnimate/DefaultTimeline/DefaultTicker，静态引用无法摇树。
 *
 * 本应用不开动画（toOption 不含 animation 配置、从不调 scrollToRow 带动画、无 react 自定义渲染），
 * 管理器仅被被动持有：BaseTable.js:198 构造、scenegraph.js:110 每帧 `ticker.start()`、
 * BaseTable.js:1039 / scenegraph.js:191 释放期 `clear()` + `ticker.release()`、
 * BaseTable.js:2248-2262 scrollToRow 与 scenegraph 组件层持引用。
 *
 * 桩逐项对齐原签名（no-op 化），禁止任何 @visactor 导入——否则动画链重新进包。
 * 滚动语义不变：table.setScrollLeft/scrollTop 直滚动路径不经过本管理器（原实现也只在
 * scrollToRow 带动画参数时才走 ticker 驱动）；本桩将该路径退化为直接静默 no-op。
 */

/** 原实现 timeline = new DefaultTimeline（持有动画队列）；桩为无队列空壳 */
const stubTimeline = {
  clear: () => {},
}

/**
 * 原实现 ticker = new DefaultTicker(stage)：start/stop/addTimeline/setFPS/release。
 * 运行时必达面：scenegraph.js:110 每帧 start()；BaseTable.js:1039 release()。
 */
const createStubTicker = () => ({
  start: () => {},
  stop: () => {},
  addTimeline: () => {},
  setFPS: () => {},
  release: () => {},
})

/** 与 vtable/es/core/animation.js 的 TableAnimationManager 签名对齐的 no-op 桩 */
export class TableAnimationManager {
  table: unknown
  timeline: { clear: () => void }
  ticker: ReturnType<typeof createStubTicker>
  tempGraphic: undefined

  constructor(table: unknown) {
    this.table = table
    this.timeline = stubTimeline
    this.ticker = createStubTicker()
  }

  /** 原签名 scrollTo(position: { col: number; row: number }, animationOption: boolean | IAnimationOption) */
  scrollTo(_position: { col?: number; row?: number }, _animationOption?: boolean | unknown): void {}

  clear(): void {}
}
