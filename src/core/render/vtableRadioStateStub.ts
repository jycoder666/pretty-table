/**
 * T-slim v2 招5 · vtable `state/radio/radio.js`（radio 单选格状态机，7.3KB raw）的
 * 构建期桩（见 vite.config.ts `pt-vtable-browser-env-only` 的重定向）。
 *
 * 原模块仅被 ListTable.js 一处静态导入（全域探针实查）：`import { getCellRadioState,
 * setCellRadioState } from "./state/radio/radio"`，两个名字只被 ListTable 的同名
 * 公共 API 方法包装转发（ListTable.js:707/722），触发路径 = radio 单元格交互或应用
 * 显式调用 API——本应用全仓（src/**、tables/*.json、模板 schema）零 cellType:'radio'
 * /radio 用法（全域探针实查），路径永不触发；radio.js 其余三个导出
 * （setRadioState/syncRadioState/changeRadioOrder）图内零消费。
 *
 * 桩返回面与原函数在被消费处的用法完全兼容：getCellRadioState 对非 radio 格恒返回
 * !1（原实现同值）、setCellRadioState 为 void no-op。禁止任何 @visactor 导入——
 * 否则 radio 状态机重新进包。
 */

/** ListTable.getCellRadioState 包装目标（原实现对非 radio 格恒返回 !1） */
export function getCellRadioState(_col: number, _row: number, _table: unknown): boolean {
  return false
}

/** ListTable.setCellRadioState 包装目标（仅 radio 格交互触达，应用零 radio 格） */
export function setCellRadioState(_col: number, _row: number, _index: unknown, _table: unknown): void {}
