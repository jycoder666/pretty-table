# AGENTS.md — pretty-table 项目接手守则

给任何 AI agent / 协作者的项目级规则。先读这个，再动代码。

## 0. 两个仓库

- **代码仓**：`D:\other\pretty-table`（本仓库）。只放源码，规格文档不进来。
- **文档仓**：`D:\other\docs\pretty-table\docs`（独立 git 仓，github.com/jycoder666/docs.git）。增量 PRD / 增量设计 / 实现落地记录 / TODO 账本全在那里，按 `01-requirements / 02-design / 03-ux / 06-upgrade / 07-decisions` 目录放，落地后登记 INDEX.md。

## 1. 门禁（改动验收的唯一口径）

八条：`pnpm run type-check` / `test:unit` / `lint` / `test:e2e` / `build` / `check:bundle` / `check:colors` / `check:licenses`。

- **Windows 下无 shell 环境跑 pnpm**（工作流 world.run、脚本）：用 node 直驱 corepack：
  `node "D:\Program Files\nodejs\node_modules\corepack\dist\pnpm.js" run <script>`——pnpm 是 CMD 垫片，直接 spawn 会 ENOENT。
- **check:bundle 三门禁**：首屏入口 gzip ≤200KB；VTable 必须是独立懒加载 chunk；总 JS gzip ≤ 备案上限（`scripts/report-bundle.mjs` 常量）。该脚本**不许擅自改**。备案纪律：再超限必须先做真实瘦身（优先 VTable 按需引入/tree-shaking），不得连续上调；当前历史上的超限（553.6 vs 546）系 schema 1.3 海报层特性本身，用户曾拍板「先不管」，但这不是默认理由。
- **lint autofix 缺陷**（已知、未根治）：eslint-plugin-playwright 每次 `pnpm lint` 都会改坏 `e2e/png-firstframe.spec.ts`（`await Promise.all` 被截断）。跑完 lint 必须 `git diff` 核对并 `git checkout -- e2e/png-firstframe.spec.ts` 还原。

## 2. 测试口径

- e2e **默认无头**（`playwright.config.ts`: `headless: !PW_HEADED`，想看过程设 `PW_HEADED=1`）。不要设有头去打断使用者。
- 双引擎 = chromium + webkit（firefox 不在既定口径）。webkit 有 4 例历史已知失败（见文档仓 TODO 账本 A-1）；全量并发下出现失败先**按 spec 隔离复跑**归因——历史上多起“红灯”是资源竞争 flake，隔离复跑即全绿。修 bug 前先确认失败可稳定复现。
- 端口：vite 约定 `PT_PORT`（默认 5310，strictPort）；`start.bat` 用 5173；playwright webServer 也是 5310（reuseExistingServer）——并发跑 e2e 时注意端口占用。

## 3. 渲染/结构红线（schema 1.3 时代）

- 8 张需求表的 1:1 视觉靠 **schema 1.3 槽位级通道 + 海报/装饰层**：`LayoutStyle.fontFamily`（sans/serif）、`borderScheme`、`headerShape`（flat/pill）、`plainHeader`、每槽 `sub` 副行；海报层文件 `decoDrawVRender / posterDraw / posterStyle / decoDefaults / sanitize13`。改样式先复用这些通道，别另造 mark。
- 模板自带 `merges`/`structuralMerges` **不受**用户合并闸（6 行/8 列/30 处）约束（闸只拦用户操作）；行列上限 **20 行 × 12 列**是硬红线；表头行数 1~3 层；行高档位 4 档 `[32,40,48,80]`（字号/内边距仍 3 档）。
- 白名单闸（allowedMerges）不动，壳层只从 `@/core` barrel 导入，核不依赖 Vue/Pinia。
- UI 彩值只准出现在 `src/core/theme/**`（check:colors 红线）；界面规范遵循 `D:\other\map_video\docs\skills\ui-skills\SKILL.md`（行式布局/焦点环/44px/hover 轻反馈/tabular-nums），token 用本项目 `--pt-*`。用户已把库页板块改叫「**我的表格**」（不是「我的模板」）。

## 4. 启动器三件套

- `start.content.txt` 是**唯一可编辑逻辑稿**；改完用生成器重写：`python C:\Users\Administrator\.agents\skills\windows-chinese-bat\scripts\write_bat_gbk.py start.bat start.content.txt`，再 `verify_bat.py start.bat --source start.content.txt --strict --smoke-args check --expect-exit 0`。
- 严禁 IDE 直接存 `start.bat`（会毁 GBK/CRLF）。中文文案全在 `bat_msg.py`（消息码分发）。
- 端口被占时 start.bat 会询问否结束占用进程（回车=清理）再重启；`PT_KILL=1` 免询问；`check` 自检永不杀进程。清僵尸可直接 `python bat_msg.py port-kill <端口>`。

## 5. 协作纪律

- 提交/推送由用户指示执行；未指示不得 push（本地 commit 用于保护工作进度除外）。
- 回复术语必须附大白话解释（用户明令）。
- 能定位的问题直接修，不先问意见；但不可逆动作（删除数据、覆盖他人成果、公开推送）除外。
- 工作族群的已沉淀教训在记忆库，接手前可让主控调取。