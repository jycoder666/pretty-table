#!/usr/bin/env node
/** G-2 / C-6: hex colors only under src/core/theme/** */
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

/**
 * 已登记的存量债豁免（主控裁定 2026-10-20：MVP 存量色值本期不修，不扩大修改面）：
 * - src/assets/main.css   —— 主题变量声明本体（下方 glob 排除）
 * - src/App.vue / src/core/adapter/toOption.ts —— 主控点名的存量文件
 * - 其余为各 .vue 里的存量灰阶/回退值（PtButton、LibraryPage、EditorPage、
 *   ExportDrawer、PropertyPanel、BlockLibrary、BlockDraggable、SlotHit）
 * 豁免清单之外的文件出现色值字面量会被拦截。
 */
const EXEMPT_FILES = new Set([
  'src/App.vue',
  'src/core/adapter/toOption.ts',
  'src/shell/ui/PtButton.vue',
  'src/shell/pages/LibraryPage.vue',
  'src/shell/pages/EditorPage.vue',
  'src/shell/export/ExportDrawer.vue',
  'src/shell/editor/PropertyPanel.vue',
  'src/shell/editor/BlockLibrary.vue',
  'src/shell/dnd/BlockDraggable.vue',
  'src/shell/dnd/SlotHit.vue',
])

const RG_ARGS = [
  '-n',
  // Windows 下 rg 默认输出反斜杠路径，与 EXEMPT_FILES 的正斜杠键永不匹配 → 统一为 /
  '--path-separator',
  '/',
  '#[0-9a-fA-F]{6}\\b',
  'src',
  '--glob',
  '!src/core/theme/**',
  '--glob',
  '!**/*.spec.ts',
  '--glob',
  '!**/main.css',
]

/** 直接起 rg 进程（不经 shell）：rg 缺失 → ENOENT；无命中 → status 1，两者可区分 */
function runRg() {
  return execFileSync('rg', RG_ARGS, { encoding: 'utf8' })
}

export function checkColors(rg = runRg) {
  let out = ''
  try {
    out = rg()
  } catch (e) {
    // rg 退出码 1 = 无命中
    if (e && typeof e === 'object' && /** @type {{status?: number}} */ (e).status === 1) {
      return { ok: true, message: 'Color literal check OK' }
    }
    // rg 缺失或执行失败：fail closed，不允许静默跳过（假绿）
    return { ok: false, message: 'rg 不可用，色值检查无法执行（fail closed，不得静默跳过）' }
  }
  const hits = out
    .split('\n')
    .filter(Boolean)
    .filter((line) => !EXEMPT_FILES.has(line.split(':')[0]))
  if (hits.length) {
    return { ok: false, message: 'Hard-coded colors outside src/core/theme:\n' + hits.join('\n') }
  }
  return { ok: true, message: 'Color literal check OK' }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const r = checkColors()
  if (r.ok) {
    console.log(r.message)
    process.exit(0)
  }
  console.error(r.message)
  process.exit(1)
}
