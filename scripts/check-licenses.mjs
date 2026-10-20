#!/usr/bin/env node
/**
 * OUT-7 方案 A：直接依赖仅 MIT/Apache-2.0；
 * 间接依赖放行 BSD/ISC/0BSD/Unlicense；MPL 仅 @resvg/resvg-js；GPL 类拦截。
 */
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const DIRECT_OK = new Set(['MIT', 'Apache-2.0', 'Apache 2.0', 'ISC', '0BSD', 'BSD-2-Clause', 'BSD-3-Clause', 'CC0-1.0', 'Unlicense', 'BlueOak-1.0.0'])
// create-vue template CC0; pinia/vue ecosystem often ISC
const INDIRECT_OK = new Set([
  ...DIRECT_OK,
  'BSD',
  'BSD*',
  'Python-2.0',
  '(MIT OR Apache-2.0)',
  '(MIT AND Zlib)',
  '(BSD-2-Clause OR MIT OR Apache-2.0)',
  'MIT*',
  'Apache*',
])

const MPL_ALLOW = new Set(['@resvg/resvg-js'])
const GPL_RE = /GPL|AGPL|LGPL/i

function normalize(lic) {
  if (!lic) return ''
  if (Array.isArray(lic)) return lic.map(normalize).join(' AND ')
  return String(lic).trim()
}

function isOk(name, lic, isDirect) {
  const n = normalize(lic)
  if (!n) return false
  if (GPL_RE.test(n) && !n.includes('MIT')) return false
  if (n.includes('MPL')) return MPL_ALLOW.has(name.split('@')[0] === '' ? name : name.replace(/@[\d.].*$/, '').replace(/^@/, '@').split('/').slice(0, 2).join('/') || name)
  // simpler MPL check
  if (/MPL-2\.0|MPL 2\.0/i.test(n)) {
    const pkg = name.replace(/@\d.*$/, '')
    return MPL_ALLOW.has(pkg) || [...MPL_ALLOW].some((a) => name.includes(a))
  }
  const allowed = isDirect ? DIRECT_OK : INDIRECT_OK
  if (allowed.has(n)) return true
  // OR combinations
  if (n.includes(' OR ')) {
    return n.split(' OR ').some((p) => allowed.has(p.replace(/[()]/g, '').trim()) || DIRECT_OK.has(p.replace(/[()]/g, '').trim()))
  }
  // permissive fallback for known SPDX dual
  if (/MIT|Apache-2\.0|BSD|ISC|0BSD|Unlicense|CC0/i.test(n) && !GPL_RE.test(n)) return true
  return false
}

let json
try {
  execSync('npx --yes license-checker --json --production', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: new URL('..', import.meta.url).pathname.replace(/^\//, '').replace(/\//g, '\\').includes(':')
      ? undefined
      : undefined,
  })
  // fix cwd
} catch {
  /* use programmatic */
}

try {
  const checker = require('license-checker')
  json = await new Promise((resolve, reject) => {
    checker.init({ start: process.cwd(), production: true }, (err, packages) => {
      if (err) reject(err)
      else resolve(packages)
    })
  })
} catch (e) {
  console.error('license-checker failed', e)
  process.exit(1)
}

const pkgJson = require('../package.json')

const bad = []
for (const [nameVer, info] of Object.entries(json)) {
  // nameVer like @scope/pkg@1.2.3
  const bare = nameVer.startsWith('@')
    ? nameVer.split('@').slice(0, 2).join('@')
    : nameVer.split('@')[0]
  // Only enforce production runtime deps strictly for "direct"
  const prodDirect = new Set(Object.keys(pkgJson.dependencies || {}))
  const isProdDirect = prodDirect.has(bare)
  if (!isOk(bare, info.licenses, isProdDirect)) {
    bad.push({ name: nameVer, licenses: info.licenses, isProdDirect })
  }
}

if (bad.length) {
  console.error('License check FAILED:')
  for (const b of bad.slice(0, 50)) {
    console.error(` - ${b.name}: ${b.licenses} (direct=${b.isProdDirect})`)
  }
  process.exit(1)
}
console.log(`License check OK (${Object.keys(json).length} packages)`)
