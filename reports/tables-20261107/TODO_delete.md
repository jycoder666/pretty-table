# tables-20261107 临时文件登记（等待用户指令再删，不提交版本库）

以下为本代理（建表执行者：课程表/菜单/排期/行程）产生的过程性临时文件；
成品（4 表的 .png/.html/-editor.png）、可复现构建脚本（build1-4.mjs、lib.mjs）、OCR 工具（ocr.ps1）不属于临时文件，不在删除范围。

## 探路脚本（UI 结构 dump，已完成使命）
- reports/tables-20261107/explore.mjs
- reports/tables-20261107/explore2.mjs
- reports/tables-20261107/explore3.mjs
- reports/tables-20261107/explore4.mjs
- reports/tables-20261107/explore5.mjs
- reports/tables-20261107/explore6.mjs

## 调试脚本（问题定位，已完成使命）
- reports/tables-20261107/debug-slot.mjs
- reports/tables-20261107/debug-block.mjs
- reports/tables-20261107/debug-scroll.mjs
- reports/tables-20261107/debug-store.mjs
- reports/tables-20261107/debug-loss.mjs
- reports/tables-20261107/verify-all.mjs（终验脚本，跨 context 验证模板方案已废弃）

## 调试截图 / OCR 中间产物
- reports/tables-20261107/dbg-canvas.png
- reports/tables-20261107/dbg-scroll.png
- reports/tables-20261107/exp-00-home.png
- reports/tables-20261107/exp-01-editor.png
- reports/tables-20261107/exp-10-editor.png
- reports/tables-20261107/exp-20-cell-selected.png
- reports/tables-20261107/exp-21-library.png
- reports/tables-20261107/exp-22-style.png
- reports/tables-20261107/exp-23-export.png
- reports/tables-20261107/exp-24-save-tpl.png
- reports/tables-20261107/exp-30-placing.png
- reports/tables-20261107/ocr-0.txt
- reports/tables-20261107/ocr-1.txt
- reports/tables-20261107/ocr-2.txt
- reports/tables-20261107/ocr-3.txt
- reports/tables-20261107/ocr-4.txt
- reports/tables-20261107/ocr-5.txt
- reports/tables-20261107/ocr-6.txt
- reports/tables-20261107/ocr-7.txt
- reports/tables-20261107/editor-ocr.txt

注：_work/ 目录与 01-03 号编辑台截图为并行代理（医疗险/手机/收支/体检）产物，不在本清单。

---

# 追加登记（2026-11-07 第二会话：医疗险/手机参数/家庭收支/体检 四表执行者）

以下为本会话产生的过程性临时文件；成品（4 表的 .png/.html、01-04 号编辑台截图、04a 实测截图、05 入库验证截图）与可复用工具（_work/ocr*.ps1、pix.ps1、stars.ps1、helpers.mjs、table1-4.mjs）不属于临时文件，不在删除范围。

## 调试脚本（已完成使命）
- _work/debug1.mjs ~ _work/debug15.mjs
- _work/verify.mjs（跨 context 验证模板方案已废弃，终验改用 verify2.mjs）
- _work/verify2.mjs（终验脚本，如需复查模板入库可保留）

## 调试截图 / OCR 中间产物
- _work/dbg2.png / _work/dbg11.png / _work/dbg12.png / _work/dbg13.png
- _work/img0.txt / img0_s2.txt / img2*.txt / img3*.txt / img4.txt / img6*.txt（OCR 中间结果）

## 特别注意
- _work/pw-profile/ 为 Playwright 持久化浏览器 profile，**「我的模板」中本轮保存的 4 张模板（百万医疗险·横向测评 / 三款机型参数对比 / 十月·家庭收支账 / 年度体检·指标解读）存在该 profile 的 IndexedDB 中**。删除 pw-profile 即丢失这 4 张已入库模板；如需长期复用，请先在应用内基于这些模板另行导出 HTML/PNG，或保留该目录。

---

# 追加登记（2026-11-07 第三会话：建表重排执行者——菜单/行程重建 + 收支/体检改表名）

本轮临时脚本（存于 reports/feat2-20261107/，复用 tables-20261107/lib.mjs 与 _work/helpers.mjs，本轮不新增公共库）：
- reports/feat2-20261107/rebuild-menu.mjs（表1 餐厅秋季菜单重建 v2，levels=2 带标题行；v1 levels=1 方案已被覆盖重写）
- reports/feat2-20261107/rebuild-dali.mjs（表2 大理四天三晚行程重建，levels=1）
- reports/feat2-20261107/recaption-t34.mjs（表3/4 caption 修改+导出，走 _work/pw-profile 持久 profile）
- reports/feat2-20261107/verify-feat2*.mjs / probe-tpl.mjs（前序功能实测脚本，属 feat2 会话产物，一并待删）

本轮产物（成品，不在删除范围）：tables-20261107/ 下 4 表的 .png / .html / -editor.png（2026-11-07 09:52–09:56 覆盖写）。
本轮注意：菜单/行程的「另存为模板」发生在一次性 context（lib.mjs launch 非持久），模板未跨会话持久化；收支/体检模板在 pw-profile 中（同上节注意事项）。
