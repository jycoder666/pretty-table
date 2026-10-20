import type { RoleColorKey } from '../types'

/**
 * 角色色预设色板（自定义格式设计增量 §1.2）。
 * C-6 合规：源码 hex 字面量只允许出现在 src/core/theme/**，此处是色板常量的集中地。
 * 每角色 8～10 个预设色；用户自取色走 ColorField 的 input[type=color] / hex 输入。
 */

export const ROLE_SWATCHES: Readonly<Record<RoleColorKey, readonly string[]>> = {
  primary: [
    '#2f5b9a',
    '#1f7a8c',
    '#2f6b4f',
    '#4a463f',
    '#6b4f8a',
    '#8a5a2f',
    '#a63d40',
    '#3d5a80',
    '#52616b',
    '#7a6a55',
  ],
  headerText: [
    '#ffffff',
    '#f5f7f4',
    '#faf7f2',
    '#eef2f7',
    '#fff8e7',
    '#e7f6f2',
    '#1a1a1a',
    '#333333',
  ],
  zebra: [
    '#eef2f7',
    '#e8ede8',
    '#f0ebe3',
    '#f5f5f5',
    '#eaf3f8',
    '#f7f0ea',
    '#eef7f0',
    '#f2f0f7',
  ],
  emphasis: [
    '#c0392b',
    '#a65b2a',
    '#8a6a2f',
    '#b3455c',
    '#7a4ba8',
    '#2f6b4f',
    '#1f7a8c',
    '#d35400',
  ],
  border: [
    '#c5d0de',
    '#b7c2b8',
    '#d4cbbc',
    '#d0d4d9',
    '#c9d6df',
    '#d8d3c8',
    '#cfc3d6',
    '#b0bec5',
  ],
  background: [
    '#f7f9fc',
    '#f4f6f3',
    '#faf7f2',
    '#ffffff',
    '#f6f8f6',
    '#fbf6f0',
    '#f4f7fa',
    '#fafafa',
  ],
}
