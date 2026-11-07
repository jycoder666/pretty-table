// 表3/表4：改表名 caption 并导出覆盖（2026-11-07 建表重排）
// 用 A组持久 profile（_work/pw-profile，IndexedDB 存「我的模板」），直接复用 _work/helpers.mjs 的
// launchPersistentContext + openTemplate（含草稿恢复/确认弹窗处理）；导出四件套用 tables lib 的 exportAll（产物落 tables-20261107）。
// 表3 十月·家庭收支账：caption 本月收支明细 → 十月 · 家庭收支账（stat 模板带 captionSlot，写槽）
// 表4 年度体检·指标解读：caption 新建空白表 → 年度体检 · 指标解读（无槽 → displayName）
import { launch as launchPersistent, openTemplate } from '../tables-20261107/_work/helpers.mjs'
import { exportAll, assertIncludes } from '../tables-20261107/lib.mjs'
import fs from 'node:fs'

function captionState(page) {
  return page.evaluate(() => {
    const app = document.querySelector('#app')?.__vue_app__
    const st = app?.config.globalProperties?.$pinia?._s?.get('editor')
    const cur = st?.current
    if (!cur) return null
    const sid = cur.layout.captionSlot
    let slotText = null
    if (sid && sid in cur.slots) {
      const v = cur.slots[sid]
      slotText = typeof v === 'object' && v !== null && 'text' in v ? String(v.text ?? '') : String(v ?? '')
    }
    return { captionSlot: sid ?? null, slotText, displayName: cur.meta?.displayName ?? '' }
  })
}

async function recaptionOne(tplName, target, fileName) {
  const { context, page, consoleErrors, pageErrors } = await launchPersistent()
  let ok = false
  try {
    await openTemplate(page, tplName)
    console.log(`[${tplName}] 打开:`, await page.getByTestId('structure-summary').innerText().catch(() => '(无 summary)'))

    const cap = page.getByTestId('caption-input')
    if (!(await cap.isVisible().catch(() => false))) {
      console.log(`[${tplName}] FAIL: caption-input 不可见，如实跳过`)
      return { ok: false }
    }
    const before = await cap.inputValue()
    console.log(`[${tplName}] caption 现值: "${before}" → 目标 "${target}"`)
    if (before === target) {
      console.log(`[${tplName}] 已显示目标名，按任务口径跳过修改，仍执行导出覆盖`)
    } else {
      await cap.fill(target)
      await cap.blur()
      await page.waitForTimeout(400)
    }
    const st = await captionState(page)
    console.log(`[${tplName}] 落库:`, JSON.stringify(st))
    const current = st?.slotText ?? st?.displayName
    if (current !== target) {
      console.log(`[${tplName}] FAIL: caption 未落库（现值 "${current}"），如实上报`)
      return { ok: false }
    }

    const { html, pngPath, htmlPath } = await exportAll(page, fileName)
    const hit = html.includes(target)
    console.log(`[${tplName}] 导出 HTML 含目标表名: ${hit ? 'OK' : 'MISS'}`)
    ok = hit
    console.log(`[${tplName}] 产物: PNG ${fs.statSync(pngPath).size} B | HTML ${fs.statSync(htmlPath).size} B | console error: ${consoleErrors.length} | pageerror: ${pageErrors.length}`)
    if (consoleErrors.length) console.log(`[${tplName}] console 切片:`, JSON.stringify(consoleErrors.slice(0, 5)))
    return { ok, consoleErrors: consoleErrors.length, pageErrors: pageErrors.length, pngPath, htmlPath }
  } finally {
    await context.close()
  }
}

const r3 = await recaptionOne('十月·家庭收支账', '十月 · 家庭收支账', '十月·家庭收支账')
const r4 = await recaptionOne('年度体检·指标解读', '年度体检 · 指标解读', '年度体检·指标解读')
console.log(`T3:${r3.ok ? 'PASS' : 'FAIL'} T4:${r4.ok ? 'PASS' : 'FAIL'}`)
