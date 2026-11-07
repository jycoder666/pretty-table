// tables/ 8 文件逐个校验（2026-11-08，临时脚本登记 TODO_delete.md）
// 断言：① JSON.parse 通过且 schemaVersion/meta.displayName 存在
//       ② 行数口径：HTML <tr> 总数 == layout.rowCount + 区块锚点数（buildVisualRows 可视行同源）
//       ③ 有效表名（captionSlot 文本 || displayName）出现在对应 HTML 里
import fs from 'node:fs'

const DIR = 'F:/pretty-table/tables'
const HTML_DIR = 'F:/pretty-table/reports/tables-20261107'
const TABLES = [
  '百万医疗险·横向测评',
  '三款机型参数对比',
  '十月·家庭收支账',
  '年度体检·指标解读',
  '餐厅秋季菜单',
  '大理四天三晚行程',
  '三年级2班课程表',
  '产品改版排期',
]

function anchorsOf(j) {
  const set = new Set()
  for (const b of j.blocks ?? []) {
    const def = (j.layout?.blockSlots ?? []).find((s) => s.id === b.slotId)
    const m = /^after-(\d+)$/.exec(def?.rowHint ?? '')
    if (m) set.add(Number(m[1]))
  }
  return set
}

function effectiveCaption(j) {
  const sid = j.layout?.captionSlot
  if (sid && j.slots && j.slots[sid] != null) {
    const v = j.slots[sid]
    const t = (typeof v === 'object' ? String(v.text ?? '') : String(v)).trim()
    if (t) return t
  }
  return String(j.meta?.displayName ?? '')
}

let fail = 0
for (const name of TABLES) {
  const p = `${DIR}/${name}.json`
  const bytes = fs.statSync(p).size
  let j
  try {
    j = JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch (e) {
    fail++
    console.log(`[FAIL] ${name}.json ${bytes}B JSON.parse: ${e.message}`)
    continue
  }
  const schemaOk = typeof j.schemaVersion === 'string' && !!j.meta?.displayName
  const anchors = anchorsOf(j)
  const expectTr = j.layout.rowCount + anchors.size

  const html = fs.readFileSync(`${HTML_DIR}/${name}.html`, 'utf8')
  const seg = (re) => {
    const m = re.exec(html)
    return m ? m[1] : ''
  }
  const trHead = (seg(/<thead>([\s\S]*?)<\/thead>/).match(/<tr[\s>]/g) ?? []).length
  const trBody = (seg(/<tbody>([\s\S]*?)<\/tbody>/).match(/<tr[\s>]/g) ?? []).length
  const trFoot = (seg(/<tfoot>([\s\S]*?)<\/tfoot>/).match(/<tr[\s>]/g) ?? []).length
  const trTotal = trHead + trBody + trFoot
  const cap = effectiveCaption(j)
  const capInHtml = html.includes(cap)

  const ok = schemaOk && trTotal === expectTr && capInHtml
  if (!ok) fail++
  console.log(
    `${ok ? '[OK]  ' : '[FAIL]'} ${name}.json ${bytes}B | displayName="${j.meta?.displayName}" | schema=${j.schemaVersion} | rows=${j.layout.rowCount}×${j.layout.colCount} L${j.layout.headerLevels ?? 1} | 锚点${anchors.size} | HTML tr=${trTotal}(head${trHead}+body${trBody}+foot${trFoot}) 期望=${expectTr} | 表名进HTML=${capInHtml ? 'Y' : 'N'}("${cap.slice(0, 30)}")`,
  )
}
console.log(fail === 0 ? 'VERIFY_TABLES_PASS(8/8)' : `VERIFY_TABLES_FAIL(${fail})`)
