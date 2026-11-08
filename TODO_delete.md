# pretty-table 临时文件登记（不提交版本库内容物，本清单本身可随仓库跟踪）

> 规则：临时脚本/产物登记于此，等待用户指令再执行删除；成品、备份、被外部引用脚本不属于临时文件。

| 登记日期 | 路径 | 说明 |
|---|---|---|
| 2026-11-07 | reports/feat2-20261107/verify-feat2.mjs | 二轮功能验证脚本 v1（被 v3-v5 取代） |
| 2026-11-07 | reports/feat2-20261107/verify-feat2-v3.mjs | v3（每任务独立 context 版，1/2/6 由 v5 复测） |
| 2026-11-07 | reports/feat2-20261107/verify-feat2-v4.mjs | v4（1/2/6 定向版，被 v5 取代） |
| 2026-11-07 | reports/feat2-20261107/verify-feat2-v5.mjs | v5 最终版：任务1/6 复测 PASS 留档可复跑（建议保留） |
| 2026-11-07 | reports/feat2-20261107/probe-tpl.mjs | 一次性探针（卡片标题/块色 UI） |
| 2026-11-07 | reports/feat-20261106/debug-open.mjs | 一轮功能调试脚本（此前会话遗留登记） |
| 2026-11-07 | reports/tables-20261107/dbg-*.png / debug-*.mjs / exp-*.png | 建表过程调试截图与脚本（成品 PNG/HTML/编辑台截图不在此列） |
| 2026-11-08 | reports/tables-20261107/_work/dump-a.mjs | A组 4 张表 JSON 导出落 tables/（持久 profile 通道，可复跑） |
| 2026-11-08 | reports/tables-20261107/_work/verify-tables.mjs | tables/ 8 文件 JSON.parse+行数+表名 vs HTML 校验（可复跑） |
| 2026-11-08 | reports/feat2-20261107/verify-transfer.mjs | 导出/导入端到端验收脚本（截图 verify-transfer-*.png 同目录，可复跑） |
| 2026-11-08 | reports/feat2-20261107/_transfer-verify-dump.json | 验收脚本导出的中间 JSON（9540B，验收用例可再生成） |
| 2026-11-08 | reports/tables-20261107/*.html.bak-2026-11-08（3 个） | A组旧 HTML caption 改名前残留，同版本新鲜 HTML 覆盖前备份（百万/三款/年度体检） |
| 2026-11-08 | __pycache__/（bat_msg.cpython-312.pyc） | 启动脚本改造时 `python -m py_compile bat_msg.py` 校验产生的字节码缓存，可再生，待用户指令删除 |
| 2026-11-08 | .tmp-smoke/gui-smoke.mjs | 界面验收 Playwright 冒烟脚本（native/bypass 双模式，8 卡+逐张打开+恢复横幅断言） |
| 2026-11-08 | .tmp-smoke/result.json | 冒烟原生模式首轮结果（=result-native.json，留档） |
| 2026-11-08 | .tmp-smoke/result-native.json | 原生模式结果：8 卡全不渲染（播种写库 bug，见验收报告） |
| 2026-11-08 | .tmp-smoke/result-bypass.json | bypass 模式结果：种子数据搬运到正确库后 8 卡全过、恢复横幅出现 |
| 2026-11-08 | .tmp-smoke/library.png | 模板库全景截图（bypass 模式下 8 卡渲染态） |
| 2026-11-08 | .tmp-smoke/edit-01.png | 编辑页截图：三年级2班课程表 |
| 2026-11-08 | .tmp-smoke/edit-05.png | 编辑页截图：大理四天三晚行程 |

## 二轮新功能验证结论（2026-11-07 主代理实测，截图在 reports/feat2-20261107/）

| # | 功能 | 结论 |
|---|---|---|
| 1 | 分组行动态化 | PASS（原生 2 锚点 → 动态插至 4+；约束：不能紧贴表头行下沿插入、紧贴已有分组行下方插入被拒） |
| 2 | 组头柔彩配色 | PASS（预设豆绿 → props.color=#d9ebdc → 导出 HTML 含色） |
| 3 | detail 表头第二行可编辑 | PASS（head.c1 改「本次结果」预览+导出同步，旧硬编码「说明」无残留） |
| 4 | 表名 caption 编辑 | PASS（caption-input → 导出 HTML 同步） |
| 5 | 空槽导出无占位 | PASS（导出 HTML 不含「可拖入」） |
| 6 | leftTag 文字编辑 | PASS（store 选中 → 区块区 textarea 写入 props.text 生效） |
| 2026-11-09 | _quarantine_20261109/tmp-smoke/（seed-smoke.mjs+截图） | 存储韧性轮GUI冒烟临时件已移入隔离目录，待确认后清空；历史.reports调试件维持原登记不动 | 已隔离 |
