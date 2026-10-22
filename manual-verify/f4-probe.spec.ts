import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import { clickSlot, openPreset, presetOf, slotVisualPos } from '../e2e/acceptance/helpers'
import { buildVisualRows, colWidthAt } from '../src/core/index'

/**
 * F4 回归探针（真机手动项 §11.9「预览画布图片颜色轻微漂移」）
 *
 * 追因结论（2026-10-22）：vtable 1.26.8 的 selectionStyle 在主题未定义时兜底
 * rgba(0,0,255,0.1)（scenegraph/select/create-select-border.js），把选中格整格蒙一层
 * 纯蓝；图片格必须选中才能上传 → 预览里图片格偏色，导出无选区故不偏。
 * 修复 = 主题显式 selectionStyle transparent（core/theme/vtableTheme.ts）。
 * 伴生缺陷：toOption 未把逐行 rowHeights 交给 VTable → 区块行按 36 渲染（模型 32），
 * 叠加层/命中/PNG 逐区块行漂移 4px。修复 = rowHeightConfig 逐行喂全量（PX-04 同源）。
 *
 * 断言（容差 2px，FR-06「允许 1～2px 抗锯齿差」）：
 *  ① 存图完整：data URL 解出的尺寸与斜线外象限色 = 上传的源图
 *  ② 选中态 vs 移开选区的画布像素逐点一致（选中不再改变格内像素）
 *  ③ 选中态无 10% 纯蓝叠加特征值，且含源图精确色（图片确实画出来了）
 *  ④ 模型每个行累计边界 ±2px 内都有画布颜色变化（行高单点生效）
 *  ⑤ 壳叠加层矩形 = 模型格矩形（±2px）
 */

const OUT = join(process.cwd(), 'reports', 'manual-verify-2026-10-22')
const FIXTURE = join(OUT, 'source-image-480x320.png')
const SLOT = 'row.6.val.a' // 位于两个区块行之下：行高漂移的放大点（修复前偏 8px）
const OTHER = 'row.2.val.a' // 移开选区用（对照采样：图片格不再处于选中态）
const TOL = 2 // FR-06：允许 1～2px 抗锯齿差
/** 源图精确色（System.Drawing 取样见报告「外部看图工具复核」）+ 斜线黑 */
const SOURCE_COLORS = [
  '255,0,0',
  '0,0,255',
  '255,255,0',
  '0,192,0',
  '255,255,255',
  '128,96,128',
  '0,0,0',
]
/**
 * 10% 纯蓝叠加特征：out = 0.898·src + (0,0,26)（vtable 兜底 cellBgColor 的合成结果）。
 * 纯蓝自身叠加后不变（0.898·255+26=255 且 R/G 为 0）→ 排除恒等项，否则把正常蓝色误判为叠加。
 */
const washOf = (c: string) => {
  const [r, g, b] = c.split(',').map(Number) as [number, number, number]
  const w: [number, number, number] = [0.898 * r, 0.898 * g, 0.898 * b + 26]
  return w.every((v, i) => Math.abs(v - [r, g, b][i]!) <= 1) ? null : w
}
const isWashed = (r: number, g: number, b: number) =>
  SOURCE_COLORS.some((c) => {
    const w = washOf(c)
    return Boolean(w) && Math.abs(r - w![0]) <= 1 && Math.abs(g - w![1]) <= 1 && Math.abs(b - w![2]) <= 1
  })

interface Run {
  y0: number
  y1: number
  color: string
}

interface Sample {
  dpr: number
  canvasW: number
  canvasH: number
  /** 格内 4px 网格取样（画布坐标，内缩 3px 避开格边框/抗锯齿） */
  px: number[][]
  /** 扫描列的颜色游程（画布坐标 y）= 渲染出的行色块 */
  runs: Run[]
  /** 壳叠加层矩形（画布坐标） */
  selRect: { left: number; top: number; width: number; height: number } | null
}

/** 区间 [s,e] 内占比最大的游程色 = 该行渲染底色（避开行内文字/图片像素） */
const bgOf = (runs: Run[], s: number, e: number): string => {
  let best = ''
  let bestLen = -1
  for (const r of runs) {
    const len = Math.min(r.y1, e - 2) - Math.max(r.y0, s + 2)
    if (len > bestLen) {
      bestLen = len
      best = r.color
    }
  }
  return best
}

/** 取样点按 8 列排版，便于人工读图 */
const grid = (px: number[][]): string => {
  const out: string[] = []
  for (let i = 0; i < px.length; i += 8) {
    out.push(
      px
        .slice(i, i + 8)
        .map(([r, g, b]) => `${r},${g},${b}`.padStart(11))
        .join(' | '),
    )
  }
  return out.join('\n')
}

test('F4 回归：选中态不改画布像素 + 格矩形与模型同源', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  expect(existsSync(FIXTURE)).toBe(true)
  await openPreset(page, '多列对比表')
  const inst = presetOf('compare-alpha-v1')
  await clickSlot(page, inst, SLOT)
  await expect(page.getByTestId('image-area')).toBeVisible()
  await page.getByTestId('image-file').setInputFiles(FIXTURE)
  await expect(page.getByTestId('image-thumb')).toBeVisible()
  await page.waitForTimeout(600)

  // 存储侧：缩略图 src = store 里的 data URL，独立解码取样（排除「存储重编码」这条岔路）
  const stored = await page.evaluate(async () => {
    const img = document.querySelector<HTMLImageElement>('[data-testid="image-thumb"]')!
    const src = img.src
    ;(window as unknown as { __src: string }).__src = src
    const bmp = await createImageBitmap(await (await fetch(src)).blob())
    const cv = new OffscreenCanvas(bmp.width, bmp.height)
    const g = cv.getContext('2d')!
    g.drawImage(bmp, 0, 0)
    const at = (x: number, y: number) => {
      const d = g.getImageData(x, y, 1, 1).data
      return `${d[0]},${d[1]},${d[2]}`
    }
    // 取样点避开黑斜线（斜线过 (1.5y, y) 与 (480-1.5y, y)）
    return {
      prefix: src.slice(0, 22),
      bytes: src.length,
      size: `${bmp.width}x${bmp.height}`,
      quads: [at(30, 30), at(450, 30), at(30, 290), at(240, 160)],
    }
  })
  const thumbSrc = await page.evaluate(() => (window as unknown as { __src: string }).__src)

  const { row, col } = slotVisualPos(inst, SLOT)
  const { rowHeights } = buildVisualRows(inst)
  let cellX = 0
  for (let c = 0; c < col; c++) cellX += colWidthAt(inst, c)
  let cellY = 0
  for (let r = 0; r < row; r++) cellY += rowHeights[r] ?? 36
  const cellW = colWidthAt(inst, col)
  const cellH = rowHeights[row] ?? 36
  const scanX = colWidthAt(inst, 0) - 6 // 标签列右缘：无文字、无图片，行边界干净

  const sample = (): Promise<Sample> =>
    page.evaluate(
      ({ x, y, w, h, scanX }) => {
        const cv = document.querySelector('.preview-host canvas') as HTMLCanvasElement
        const cb = cv.getBoundingClientRect()
        const dpr = cv.width / cb.width
        const g = cv.getContext('2d')!
        // ① 格内取样。画布坐标 = 应用命中几何坐标系（locateVisual 用 ev.clientX - canvasRect.left）
        const sx = Math.round((x + 3) * dpr)
        const sy = Math.round((y + 3) * dpr)
        const sw = Math.max(1, Math.round((w - 6) * dpr))
        const sh = Math.max(1, Math.round((h - 6) * dpr))
        const d = g.getImageData(sx, sy, sw, sh).data
        const px: number[][] = []
        for (let yy = 0; yy < sh; yy += 4) {
          for (let xx = 0; xx < sw; xx += 4) {
            const i = (yy * sw + xx) * 4
            px.push([d[i]!, d[i + 1]!, d[i + 2]!])
          }
        }
        // ② 行边界：整列扫描取颜色游程（画布坐标 y）
        const vd = g.getImageData(Math.round(scanX * dpr), 0, 1, cv.height).data
        const key = (i: number) => `${vd[i * 4]},${vd[i * 4 + 1]},${vd[i * 4 + 2]}`
        const runs: { y0: number; y1: number; color: string }[] = []
        let start = 0
        for (let yy = 1; yy < cv.height; yy++) {
          if (key(yy) !== key(yy - 1)) {
            runs.push({ y0: start / dpr, y1: (yy - 1) / dpr, color: key(start) })
            start = yy
          }
        }
        runs.push({ y0: start / dpr, y1: (cv.height - 1) / dpr, color: key(start) })
        // ③ 壳叠加层矩形换算到画布坐标
        const sel = document.querySelector('.selection-cell') as HTMLElement | null
        const sb = sel?.getBoundingClientRect() ?? null
        return {
          dpr,
          canvasW: cv.width,
          canvasH: cv.height,
          px,
          runs,
          selRect: sb
            ? {
                left: (sb.left - cb.left) / dpr,
                top: (sb.top - cb.top) / dpr,
                width: sb.width / dpr,
                height: sb.height / dpr,
              }
            : null,
        }
      },
      { x: cellX, y: cellY, w: cellW, h: cellH, scanX },
    )

  const A = await sample() // 图片格处于选中态（vtable 兜底蓝蒙层若在，就落在这份像素里）
  await clickSlot(page, inst, OTHER) // 移开选区：图片格不再选中
  await page.waitForTimeout(250)
  const B = await sample()

  // 行边界：模型累计边界 vs 画布渲染出的颜色突变（相邻行同色则无从判定，跳过并记账）
  const spans: [number, number][] = []
  let acc = 0
  for (const h of rowHeights) {
    spans.push([acc, acc + h])
    acc += h
  }
  const transitions = B.runs.slice(1).map((r) => r.y0)
  const skipped: number[] = []
  const missed: number[] = []
  for (let i = 1; i < spans.length; i++) {
    const b = spans[i]![0]!
    if (b <= 0 || b >= B.canvasH / B.dpr - 2) continue
    const above = bgOf(B.runs, spans[i - 1]![0]!, spans[i - 1]![1]!)
    const below = bgOf(B.runs, spans[i]![0]!, spans[i]![1]!)
    if (above === below) skipped.push(b)
    else if (!transitions.some((t) => Math.abs(t - b) <= TOL)) missed.push(b)
  }
  const washed = A.px.filter(([r, g, b]) => isWashed(r!, g!, b!))
  const exact = A.px.filter(([r, g, b]) => SOURCE_COLORS.includes(`${r},${g},${b}`))

  writeFileSync(
    join(OUT, 'f4-probe.txt'),
    [
      '== 存储 data URL（右栏缩略图 src）==',
      JSON.stringify(stored, null, 2),
      '',
      '== 图片格内像素（画布 4px 网格，选中态）==',
      `取样点 ${A.px.length} 个（dpr=${A.dpr}，画布 ${A.canvasW}x${A.canvasH}）`,
      `选中态 vs 移开选区逐点一致：${JSON.stringify(A.px) === JSON.stringify(B.px)}`,
      `10% 纯蓝叠加特征像素：${washed.length}`,
      `源图精确色像素：${exact.length}`,
      grid(A.px),
      '',
      '== 行边界（画布坐标 y）==',
      `模型累计：${spans.map(([s]) => s).join(', ')}`,
      `画布渲染变化：${transitions.map((c) => c.toFixed(1)).join(', ')}`,
      `跳过（相邻行同色）：${skipped.join(', ') || '无'}`,
      `未对上（>${TOL}px）：${missed.join(', ') || '无'}`,
      '',
      '== 扫描列颜色游程 ==',
      ...B.runs.map((r) => `  ${r.y0}-${r.y1} (${r.y1 - r.y0 + 1}px): ${r.color}`),
      '',
      '== 壳叠加层矩形 vs 模型格矩形 ==',
      `叠加层 ${JSON.stringify(A.selRect)} / 模型 {left:${cellX},top:${cellY},w:${cellW},h:${cellH}}`,
    ].join('\n'),
    'utf8',
  )
  if (thumbSrc.startsWith('data:')) {
    writeFileSync(join(OUT, 'f4-stored-thumb.png'), Buffer.from(thumbSrc.split(',')[1]!, 'base64'))
  }
  await page.locator('.preview-host').screenshot({
    path: join(OUT, 'f4-preview-cell.png'),
    clip: { x: cellX, y: Math.max(0, cellY - 24), width: cellW, height: cellH + 40 },
  })

  // ① 存图完整（上传 → store 未改像素）
  expect(stored.prefix).toBe('data:image/png;base64,')
  expect(stored.size).toBe('480x320')
  expect(stored.quads).toEqual(['255,0,0', '0,0,255', '255,255,0', '255,255,255'])
  // ② F4 核心：选中不改变格内像素（修复前 A 整格偏蓝、B 正常 → 两份不等）
  expect(A.px).toEqual(B.px)
  // ③ 选中态无叠加特征，且图片确实画出（源色像素占比过半）
  expect(washed).toEqual([])
  expect(exact.length).toBeGreaterThan(A.px.length / 2)
  // ④ 行高单点：模型边界都落在画布颜色突变处（修复前区块行边界整段错位 4px）
  const checked = spans.length - 1 - skipped.length - (spans.filter(([s]) => s >= B.canvasH / B.dpr - 2).length)
  expect(checked).toBeGreaterThanOrEqual(8) // 防空转：确有足够多的边界参与比对
  expect(missed).toEqual([])
  // ⑤ 叠加层 = 模型格矩形（1px 来自宿主 1px 边框，容差内）
  expect(A.selRect).not.toBeNull()
  expect(Math.abs(A.selRect!.left - cellX)).toBeLessThanOrEqual(TOL)
  expect(Math.abs(A.selRect!.top - cellY)).toBeLessThanOrEqual(TOL)
})
