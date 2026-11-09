/**
 * T-slim · `@visactor/vrender-animate/register` 的构建期桩（见 vite.config.ts
 * `pt-vtable-browser-env-only` 的重定向）。
 *
 * 原模块 registerAnimate() = mixin(Graphic, GraphicStateExtension) + mixin(Graphic, AnimateExtension)，
 * 经 @visactor/vrender/es/entries/bootstrap-common.js:27 被 shared-browser bootstrap
 * （registerStandardPipeline → registerStandardAnimation）静态拉入，是 vrender-animate
 * 在 vrender 引导侧的唯一消费点。本应用无属性动画/状态机用法，注册内容零调用。
 *
 * 桩为纯 no-op，禁止任何 @visactor 导入——否则动画链重新进包。
 */
export function registerAnimate(): void {}
