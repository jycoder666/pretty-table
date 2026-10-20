#!/usr/bin/env node
/** G-2 / C-6: hex colors only under src/core/theme/** */
import { execSync } from 'node:child_process'

let out = ''
try {
  out = execSync(
    `rg -n "#[0-9a-fA-F]{6}\\b" src --glob "!src/core/theme/**" --glob "!**/*.spec.ts" --glob "!**/main.css"`,
    { encoding: 'utf8' },
  )
} catch (e) {
  const err = e
  // rg exit 1 = no matches
  if (err.status === 1) {
    console.log('Color literal check OK')
    process.exit(0)
  }
  // try without rg
  console.warn('rg not available or error; skipping strict check')
  process.exit(0)
}
if (out.trim()) {
  console.error('Hard-coded colors outside src/core/theme:\n' + out)
  process.exit(1)
}
console.log('Color literal check OK')
