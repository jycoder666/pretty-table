/**
 * T-slim v2 招6 · vtable `event/media-click.js`（link/video/audio 格点击处理 +
 * 媒体预览管理器，12.6K 原始字符）的构建期桩（见 vite.config.ts
 * `pt-vtable-browser-env-only` 的重定向）。
 *
 * 原模块仅被 event/event.js 一处静态导入（全域探针实查）：
 * `import { bindMediaClick } from "./media-click"`，event.js:108 在事件绑定初始化时
 * 调用 `bindMediaClick(this.table)`——原行为 = 挂媒体预览管理器 + 注册 CLICK_CELL
 * 监听（link 格跳转 / video、audio 格播放预览）。本应用全仓（src/**、tables/*.json）
 * 零 linkJump/link/video/audio 格用法（全域探针实查），监听回调永不触达任何分支；
 * 桩为 no-op 即「从不注册该监听」，对零 link/媒体格的表格行为完全等价。
 *
 * tools/media.js（isVideoUrl/isAudioUrl）随本桩离开产物图自然摇树（其余消费方
 * video-cell/audio-cell 早已不在图内）。
 *
 * 桩为纯 no-op，禁止任何 @visactor 导入——否则媒体点击链重新进包。
 */

/** event.js:108 初始化调用（原版挂媒体预览管理器 + CLICK_CELL 监听，应用零触达路径） */
export function bindMediaClick(_table: unknown): void {}
