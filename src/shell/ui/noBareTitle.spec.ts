import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * E4：壳层裸原生 title 属性清理守卫。
 * R-5 十项 tooltip 清单之后，壳层 .vue 源文件不再允许裸 `title` / 动态 `:title`
 * 属性：有信息量的提示统一走 PtTooltip（行为/样式/色检统一），无信息量的直接删。
 * 静态扫描（源码文本级），新文件自动纳入。
 */

const shellDir = join(dirname(fileURLToPath(import.meta.url)), '..')

function collectVueFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    // 粗判目录：readdirSync + 自行递归；测试环境无 isDirectory 依赖问题，用 statSync 也可，
    // 这里以「无扩展名或 .vue 后缀」简化处理不可靠，故用 try readdir 判断
    let isDir = false
    try {
      readdirSync(p)
      isDir = true
    } catch {
      isDir = false
    }
    if (isDir) out.push(...collectVueFiles(p))
    else if (name.endsWith('.vue')) out.push(p)
  }
  return out
}

/** 匹配裸 title 绑定：空白开头 + 可选冒号 + title + = + 引号（aria-label / data-* 不受影响） */
const BARE_TITLE = /\s(?::)?title="/

describe('E4 · 壳层裸 title 属性清理', () => {
  it('src/shell/**/*.vue 中不再出现原生 title 属性（统一走 PtTooltip）', () => {
    const offenders = collectVueFiles(shellDir)
      .map((f) => ({ file: f, line: readFileSync(f, 'utf8').split('\n').findIndex((l) => BARE_TITLE.test(l)) }))
      .filter((x) => x.line >= 0)
      .map((x) => `${x.file}:${x.line + 1}`)
    expect(offenders).toEqual([])
  })
})
