#!/usr/bin/env node
/**
 * T34 构建体积门禁：读取 dist/ 产物，输出体积表并按 D-20 目标判定。
 *
 * 门槛（gzip）：
 *   1. 首屏入口 chunk ≤ 200KB
 *   2. VTable 必须是独立 chunk（不经入口同步加载）
 *   3. 总 JS ≤ 555KB（PoC 基线）
 *
 * 纯 node 实现（node:zlib + node:fs），无 npm-run-all / 第三方依赖，
 * `node scripts/report-bundle.mjs` 独立可跑（沙箱 run-p 包装不可用时照常工作）。
 * 超限 exit 1 并逐条打印超标项。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import process from 'node:process'

const KB = 1024
const LIMIT_ENTRY_GZIP = 200 * KB
const LIMIT_TOTAL_GZIP = 555 * KB

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

function fmtKB(bytes) {
  return (bytes / KB).toFixed(1) + 'KB'
}

function findJsAssets(dir) {
  const out = []
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name)
    if (name.isDirectory()) out.push(...findJsAssets(p))
    else if (name.name.endsWith('.js')) out.push(p)
  }
  return out
}

/** 解析 index.html：入口 chunk = module script；modulepreload = 首屏同步预载链 */
function parseIndexHtml(html) {
  const entry = []
  const preload = []
  const scripts = html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)
  for (const m of scripts) entry.push(basenameOf(m[1]))
  const links = html.matchAll(/<link[^>]+rel="modulepreload"[^>]*href="([^"]+)"|<link[^>]+href="([^"]+)"[^>]*rel="modulepreload"/g)
  for (const m of links) preload.push(basenameOf(m[1] ?? m[2]))
  return { entry, preload }
}

function basenameOf(p) {
  // Windows 路径（\）与 POSIX（/）都要拆
  return p.split(/[\\/]/).pop() ?? p
}

function main() {
  if (!existsSync(distDir)) {
    console.error(`✗ 未找到 ${distDir}，请先执行 pnpm build-only 生成产物。`)
    process.exit(1)
  }
  const indexHtml = join(distDir, 'index.html')
  if (!existsSync(indexHtml)) {
    console.error(`✗ ${indexHtml} 不存在，产物不完整，请重新 build。`)
    process.exit(1)
  }

  const { entry, preload } = parseIndexHtml(readFileSync(indexHtml, 'utf8'))
  const jsFiles = findJsAssets(distDir).map((p) => {
    const buf = readFileSync(p)
    const raw = statSync(p).size
    const gz = gzipSync(buf).length
    const name = basenameOf(p)
    return {
      name,
      path: p,
      raw,
      gzip: gz,
      // VTable 识别标记：vrender/vtable 运行时字符串在压缩后保留（类名/容器类/内部命名空间）
      isVtable: /vtable|vrender/i.test(buf.toString('utf8')),
    }
  })
  if (jsFiles.length === 0) {
    console.error('✗ dist 中没有任何 JS 产物。')
    process.exit(1)
  }

  const cssAssets = []
  collectByExt(distDir, '.css', cssAssets)
  const cssGzip = cssAssets.reduce((a, f) => a + f.gzip, 0)
  const cssRaw = cssAssets.reduce((a, f) => a + f.raw, 0)

  const firstScreen = new Set([...entry, ...preload])
  const totalJsGzip = jsFiles.reduce((a, f) => a + f.gzip, 0)
  const totalJsRaw = jsFiles.reduce((a, f) => a + f.raw, 0)
  const entryFile = jsFiles.find((f) => firstScreen.has(f.name) && f.name.endsWith('.js'))
  // VTable 独立判定：存在非首屏的 VTable 运行时 chunk（壳层里的 vtable 字样不算）
  const vtableChunks = jsFiles.filter((f) => f.isVtable && !firstScreen.has(f.name))
  const vtableSeparate = vtableChunks.length > 0

  console.log('── 产物体积表（dist/）' + '─'.repeat(40))
  console.log(`${'文件'.padEnd(34)}${'原始'.padStart(12)}${'gzip'.padStart(12)}  角色`)
  for (const f of jsFiles) {
    const role = firstScreen.has(f.name)
      ? '首屏（入口/预载）'
      : f.isVtable
        ? 'VTable chunk'
        : '懒加载 chunk'
    console.log(`${f.name.padEnd(34)}${fmtKB(f.raw).padStart(12)}${fmtKB(f.gzip).padStart(12)}  ${role}`)
  }
  for (const f of cssAssets) {
    console.log(`${f.name.padEnd(34)}${fmtKB(f.raw).padStart(12)}${fmtKB(f.gzip).padStart(12)}  CSS`)
  }
  console.log('─'.repeat(76))
  console.log(
    `JS 合计: 原始 ${fmtKB(totalJsRaw)} / gzip ${fmtKB(totalJsGzip)}；` +
      `CSS 合计: 原始 ${fmtKB(cssRaw)} / gzip ${fmtKB(cssGzip)}`,
  )
  console.log('')

  // ── 门禁判定 ──
  const violations = []

  if (!entryFile) {
    violations.push('未能在 index.html 中识别入口 chunk（module script）')
  } else {
    console.log(
      `门禁1 首屏入口 gzip: ${fmtKB(entryFile.gzip)} / 上限 ${fmtKB(LIMIT_ENTRY_GZIP)}` +
        (entryFile.gzip <= LIMIT_ENTRY_GZIP ? ' ✓' : ' ✗ 超限'),
    )
    if (entryFile.gzip > LIMIT_ENTRY_GZIP) {
      violations.push(
        `首屏入口 gzip ${fmtKB(entryFile.gzip)} 超过上限 ${fmtKB(LIMIT_ENTRY_GZIP)}（${entryFile.name}）`,
      )
    }
  }

  console.log(
    `门禁2 VTable 独立 chunk: ${vtableSeparate ? '✓（' + vtableChunks.map((f) => f.name).join(', ') + '）' : '✗ 不存在'}`,
  )
  if (!vtableSeparate) {
    violations.push(
      'VTable 未独立成 chunk：需保持渲染核经 loadRenderCore 动态导入（@visactor/vtable 不得进入口同步加载图）',
    )
  }

  console.log(
    `门禁3 总 JS gzip: ${fmtKB(totalJsGzip)} / 上限 ${fmtKB(LIMIT_TOTAL_GZIP)}` +
      (totalJsGzip <= LIMIT_TOTAL_GZIP ? ' ✓' : ' ✗ 超限'),
  )
  if (totalJsGzip > LIMIT_TOTAL_GZIP) {
    violations.push(
      `总 JS gzip ${fmtKB(totalJsGzip)} 超过上限 ${fmtKB(LIMIT_TOTAL_GZIP)}，超出 ${fmtKB(totalJsGzip - LIMIT_TOTAL_GZIP)}`,
    )
  }

  console.log('')
  if (violations.length > 0) {
    console.error('✗ 体积门禁未通过：')
    for (const v of violations) console.error(`  - ${v}`)
    process.exit(1)
  }
  console.log('✓ 体积门禁全部通过（入口 ≤200KB · VTable 独立 chunk · 总 JS gzip ≤555KB）')
}

/** 收集指定扩展名文件（原始 + gzip 尺寸） */
function collectByExt(dir, ext, out) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name)
    if (name.isDirectory()) collectByExt(p, ext, out)
    else if (name.name.endsWith(ext)) {
      const raw = statSync(p).size
      out.push({ name: basenameOf(p), raw, gzip: gzipSync(readFileSync(p)).length })
    }
  }
}

main()
