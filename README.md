# pretty-table

网页精美表格工具。给自用内容作者一条短路径：从模板库选底稿，填字、换主题、在允许区内做轻量版式调整，把结果另存成自己的模板，再复制 HTML 或导出 PNG。

行业不限。首发只上架「多列对比」和「单主体明细」两类系统模板，样例文案用通用商务。不做成 Excel，也不做自由画布。

规格文档不进本仓库，只放源码。产品规格见外部文档仓 `Documents/grok/pretty-table/docs`。

## 开发

```bash
pnpm install
pnpm dev
```

默认地址 `http://127.0.0.1:5310/`（避开本机 nginx:80、phpstudy 9000-9004、其它项目 Vite:5173 等常驻端口）。

端口规则：

- 开发端口固定 5310，`strictPort` 为 true——端口被占用时 Vite **直接报错退出**，不会静默换端口导致访问到别的服务
- 换端口：`pnpm dev --port 5320`，或 `set PT_PORT=5320` 后运行
- Windows 双击 `启动开发服务.bat` 可一键启动：默认 5310，被占用时中文提示并自动顺延到下一个可用端口，打印地址与实际监听一致；`启动开发服务.bat check` 只检测端口不启动；脚本由 `python scripts/write_start_bat.py` 生成（GBK+CRLF，勿直接编辑 .bat）

```bash
pnpm test:unit
pnpm type-check
pnpm build
pnpm check:licenses
```

- Node：见 `.nvmrc`（≥22.18 或 ≥24.12）
- 包管理：pnpm
- 调试：`pnpm dev` 后打开 `/?pt-debug=1`；故障注入 `/?pt-fault=EXPORT_PNG_FAIL`

## 架构

| 目录 | 职责 |
| --- | --- |
| `src/core` | 渲染核：类型、主题色板、store 意图、`toOption`、VTable 挂载、HTML/PNG 导出；不依赖 Vue/Pinia |
| `src/shell` | 应用壳：模板库、编辑台、拖拽/属性、IndexedDB 存储、导出编排 |

调用方向：**壳 → store → 核**。壳只从 `@/core` 导入。

## 首发功能（Fill MVP）

| 功能 | 做什么 |
| --- | --- |
| 模板库 | 系统预设对比表 + 明细表；「我的模板」分区（IndexedDB） |
| 槽位填空 | 改文案预览同步；空槽预览占位，导出不含占位句 |
| 轻编辑 | 三套主题 T-A/T-B/T-C；斑马纹；允许区合并/拆分；对齐；强调（红字/加粗/底色） |
| 表内区块 | 分区色条、分组标题行：指针拖入槽位或键盘「待放置」放入；注脚/左栏标签可见但不可用 |
| 另存为模板 | 只新增不覆盖；成功留在编辑台 |
| 导出 | 复制 HTML（内联样式）；导出 2× PNG（离屏同源重绘） |
| 模板 JSON 导出/导入 | 编辑台导出 `.pretty-table.json`，模板库导入还原进「我的模板」（同 id 覆盖，跨设备同步） |
| 离开与恢复 | 未保存离开确认；`draft:current` 自动恢复 |
| 撤销 | 只撤一步 |

## 明确不做（本期）

增删行列、列宽拖、公式/筛选/排序/冻结/填充柄、Excel 导出、自由画布、自定义 hex、账号协作。增强期 FR-16～27 未实现。
