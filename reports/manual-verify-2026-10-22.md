# 真机人工项验证报告（2026-10-22）

- 执行人：ZCode（受用户指派执行落地记录 §11.9「归用户的真机人工清单」）
- 日期：2026-10-22 · Asia/Shanghai
- 被测版本：pretty-table @ `72ab56e`（main）**+ 当日修复工作树**（P1/P2/P3/F4 与 WebKit 兼容，改动清单见 §十二）
- 被测环境：本机 Windows 10.0.17134（1803）· Playwright 1.64 **headed 真实浏览器** · 真实系统剪贴板（Windows CF_HTML / UnicodeText）· 真实磁盘文件上传 · dev server `localhost:5173`
- 与 T30 报告的差别：T30 的 C 类人工项在沙箱里只能「模拟剪贴板 / DOM 断言」；本报告用**真机**（真实浏览器 + 真实 OS 剪贴板 + 真实文件）执行，因此可以出正式结论。
- **本文档含两轮**：第一轮（§一～§十一）为**发现**：真机执行清单并暴露 4 个问题（P1 复制 HTML 缺 `text/html` 风味、P2 抽屉文案与行为不符、P3 `pnpm lint` 在 main 上红、F4 预览画布选中图片格偏色 + 逐区块行几何漂移）；第二轮（§十二）为**修复与复验**：四个问题全部修复，并在真机 + 三门禁上复验通过。结论总表（§一）已按修复后状态更新。
- 执行脚本（新增，独立于 `e2e/` 主套件）：`manual-verify/playwright.manual.config.ts` + `real-machine.spec.ts`（3 例）、`preview-copy.spec.ts`（1 例）、`webkit-spotcheck.spec.ts`（3 例）、`gif-firstframe.spec.ts`（2 例）、`f4-probe.spec.ts`（1 例，F4 断言式回归探针；由早期 f4-geometry/f4-rows 等临时探针合并而成）
- 证据目录：`reports/manual-verify-2026-10-22/`（截图 25 张、剪贴板转储 9 份、JSON 证据 5 份、动图夹具 2 个、F4 探针文本 1 份）

---

## 一、结论总表

| # | 清单项 | 结论 | 一句话依据 |
|---|--------|------|-----------|
| 1 | **TC-PT-086 公众号编辑器粘贴实测** | ✅ **已修复并复验通过** | 首轮发现：抽屉「复制 HTML」在真实系统剪贴板上**只有纯文本、没有 HTML Format**，粘出转义源码（0 个 table）；修复为双风味写入后，真机剪贴板含 `HTML Format`（`<table>`/✓✗◐/`data:image`）+ `UnicodeText` TSV，三条粘贴路径均粘出**真表格**（1 table / 40 格 / 三态齐 / 带图）；见 §二、§十二-1 |
| 2 | 图片功能点验（E1）：上传 → 预览成像 → 导出 PNG 带图 | ✅ 通过 | 预览图片格内 827 个近红像素、导出 2× PNG 内 3,573 个且最红像素精确 `(255,0,0)`；见 §三 |
| 3 | 动图首帧（E2） | ✅ 通过 | 自建 2 帧动图（帧1 红/帧2 蓝）经屏幕取样证实在动；上传后预览三次取样（间隔 1.1s，跨过换帧）恒为帧 1，蓝像素 0；导出 PNG 同为帧 1；见 §四 |
| 4 | 外部看图工具复核 PNG 透明底与尺寸（TC-PT-082/083） | ✅ 通过 | 1×/2×/3× 实测 574×458 / 1148×916 / 1722×1374，与抽屉提示**零偏差**；透明底四角 alpha=0、中心 255；Windows GDI+/WIC 独立解码复核一致；见 §五 |
| 5 | 真机 Safari 抽查 | ✅ 通过（以 WebKit 引擎代） | 本机无 macOS/Safari，以 WebKit 引擎（Playwright 的 Safari 内核）代替：PNG 导出/拖拽/刷新恢复 **3/3 通过**；修复后主套件 webkit 项目亦为 **14 通过 / 0 失败**；见 §六 |
| 6 | F2 firefox/webkit 待真机复测 | ✅ 已处置 | firefox 是**本机 OS 版本阻塞**（1803 缺 `api-ms-win-core-apiquery-l2-1-0.dll`，非应用问题）；webkit 首轮 44 条失败全为 harness 权限项报错，已修复 harness + 补 WebKit 富文本兜底 → **14 通过 / 0 失败 / 2 跳过**（跳过的是 CDP 节流用例）；见 §六 |
| 7 | F3 tc080 并行偶发超时 | ✅ 未复现（另发现他因） | 单跑 6 次全绿；另查明「重负载 + 并行」会造成用例级 flake，与被测产品无关；见 §七 |
| 8 | F4 预览画布图片颜色轻微漂移 | ✅ **已定位并修复** | 成因不是渲染器合成，而是 VTable 1.26.8 内建选区底色兜底 `rgba(0,0,255,0.1)` 蒙在选中格上；关掉后预览最红像素由 `(229,0,26)` 回到精确 `(255,0,0)`，与导出一致；见 §五-4、§十二-4 |
| 9 | TC-PT-051/052 真实 Excel/WPS 来源 | ⏸ 未执行 | 本机无 Excel/WPS 环境，无法出正式结论（T30 模拟通过仍有效） |
| 10 | TC-PT-072/073/079 目视项 | ⚠️ 数值证据已给，肉眼归用户 | 图片已并入随本报告的内嵌对照表；◐ 字形、窄屏钉列滚动等仍需人眼 |
| 11 | F5 60s 延迟 revoke 的 blob 峰值 | ⏸ 未测 | 需批量导出压测，非本次范围 |
| 12 | 新增验证文件对 `pnpm` 门禁的影响 | ✅ **已修复** | 首轮发现 `pnpm lint` 在 main 上因 11 条 oxlint 既有错误 exit 1；已清零，现 `pnpm lint` = **0 error / 4 warning**（warning 为既有 e2e 用例风格项）；见 §九、§十二-3 |

> 内嵌对照表（PNG 透明底三种底色、导出整表与 1:1 裁切、两条粘贴路径截图、动图帧对照）随本报告给出，便于肉眼确认第 2/3/4/10 项。

---

## 二、TC-PT-086 公众号编辑器粘贴实测（**发现缺陷**）

### 1. 执行步骤（按 T30 报告 §四 清单逐步执行）

1. 打开「多列对比表」预设 → 上传一张测试图到图片格 `row.6.val.a`；
2. 导出抽屉 → 点「复制 HTML」（提示「已复制 HTML」）；
3. 用 PowerShell `System.Windows.Forms.Clipboard` 读**真实系统剪贴板**的全部格式与内容；
4. 在一个真实 `contenteditable` 编辑器里按 **Ctrl+V**（真实按键，非事件注入），检查是否出现表格；
5. 另测两条替代路径（导出 HTML 文件、应用内预览层），同法核对。

### 2. 剪贴板形态与粘贴结果对照

| 复制来源 | 剪贴板格式（关键项） | HTML 长度 | 粘后 table | 单元格（带内联样式） | ✓✗◐ | 图片 |
|---|---|---|---|---|---|---|
| ① 抽屉「复制 HTML」 | **无 `HTML Format`**（仅 UnicodeText / Text / OEMText） | 0（纯文本 33,894 字符） | **0** | 0 | 无 | 0 |
| ② 导出 HTML 文件 → 浏览器打开 → Ctrl+A/Ctrl+C | **有 `HTML Format`** | 36,229 字节 | **1** | 40（40） | ✓✗◐ 全在 | 1（`data:` URL） |
| ③ 应用内预览层（键盘定向进 iframe）→ Ctrl+A/Ctrl+C | **有 `HTML Format`** | 13,188 字节 | **1** | 40 | ✓✓◐ | 该次未上传图，未覆盖 |

粘贴结果截图：`paste-1-from-copy-html.png`（①，整片 `&lt;div style=...&gt;` 转义源码）、`paste-2-from-rendered-html.png`（②，标题「多列对比表」+ 边框 + ✓ + 图片的真实表格）。②的 DOM 复核：`caption=多列对比表`、`cellCount=40`、`styledCellCount=40`、`markChars={yes:true,no:true,partial:true}`、`dataImgCount=1`。

### 3. 结论与缺陷定位

**「复制 HTML」当前不可能在公众号编辑器里粘出表格**：`copyText()`（`src/shell/export/clipboard.ts`）只调用 `navigator.clipboard.writeText()` / `execCommand('copy')`，写入的是 **`text/plain`** 单一风味；导出 HTML 的字符串本身是完整正确的（33,894 字符、含 `<table>` 与内联样式、`data:` 图片），但它是以**文本**形态进剪贴板的，任何富文本编辑器收到它都只能当纯文本插入。

- 用户可见后果：按抽屉 tooltip「复制带样式的 HTML，粘贴到支持富文本的编辑器」操作，粘出来是一屏转义源码；抽屉内「以上为复制内容的实际效果示意，与粘贴到富文本编辑器一致」的说明与实际行为**不一致**（预览层渲染的是 HTML 效果，剪贴板给的却是文本）。
- 影响面：TC-PT-086（E-6）由「待人工」变为「人工实测未通过」；公众号（及任何富文本目标）主路径不可用。

### 4. 两条已验证可用的替代路径（可写入用户指引）

- **路径 ②（推荐）**：导出抽屉 →「导出 HTML」→ 下载的 `.html` 用浏览器打开 → `Ctrl+A` / `Ctrl+C` → 粘进公众号编辑器。实测粘贴结果为**真表格**（标题、边框、合并、✓✗◐、内联样式齐全，图片以 `data:` URL 随文携带）。
- **路径 ③**：抽屉 →「预览」→ 在预览层内点击后 `Ctrl+A` / `Ctrl+C`（注意：键盘事件必须落在 iframe 内，首轮实测在 iframe 外按 Ctrl+A 会选中整个应用界面并把 UI 文案复制走）。实测同为真表格。

### 5. 未覆盖的风险（需在真公众号后台确认）

`data:` URL 图片能否被公众号后台保留/上传，本机无公众号账号环境**无法验证**。若后台过滤 `data:` 图片，则路径 ②③ 的表格文字/边框仍会保留、仅图片丢失；建议正式发布前用一条真图文验证。

### 6. 建议修复（未改代码）

把「复制 HTML」改为**双风味**写入，纯文本降级保留：

```ts
const item = new ClipboardItem({
  'text/html': new Blob([html], { type: 'text/html' }),
  'text/plain': new Blob([html], { type: 'text/plain' }), // 或导出的纯文本版
})
await navigator.clipboard.write([item])   // 失败再回落到现有 writeText 分支
```

> 本次任务口径是「验证」而非「修改」，且本项目有 PM/QA/Engineer 的编号流程，故第一轮未直接改代码；是否立项修复请 PM 拍板（建议 P1，因为它是 FR 级主路径）。
> **第二轮已按用户指令修复并复验，见 §十二-1。**

### 7. 修复与复验（第二轮执行结果）

修复：`src/shell/export/clipboard.ts` 的 `copyHtml` 改为**一次写入两种风味**（`text/html` 片段 + `text/plain` TSV），写入被拒时展开手动复制框的既有语义不变（TC-PT-087 仍成立）。

真机复验（`manual-verify/real-machine.spec.ts`，headed + 真实 Windows 剪贴板，3/3 通过）：

| 观测点 | 复验结果 |
|---|---|
| 抽屉 toast | `已复制到剪贴板` |
| 真机剪贴板格式 | `HTML Format` + `UnicodeText` + `Text` + … （首轮**无** `HTML Format`） |
| `HTML Format` 内容 | 含 `<table>`、✓✗◐ 三态、`data:image` |
| `UnicodeText` 内容 | TSV（含制表符、无 `<table>` 源码） |
| ① 复制 HTML 直粘 | 真表格：1 table / 40 格（40 格带内联样式）/ caption「多列对比表」/ ✓✗◐ 齐 / 1 张 data URL 图片 |
| ② 导出 HTML 落盘 → 浏览器打开 → 全选复制 → 粘贴 | 同上（1 table / 40 格 / 三态齐 / 1 图） |
| ③ 应用内预览 iframe → 全选复制 → 粘贴 | 同上（1 table / 40 格 / 三态齐 / 1 图） |

> 路径 ③ 的 harness 口径已在脚本内注明：`sandbox=""` 的 iframe 里，`page.keyboard` 的按键经 CDP 会落到主框架（复制走整页 UI 含 srcdoc 源码），须用 `Frame.press` 把按键定向给 iframe 自身——真机上点击 iframe 后按键本就落在 iframe（实测 `document.hasFocus()=true`），故为等价口径而非绕过产品行为。
>
> 未变的风险：`data:` URL 图片能否被公众号后台保留，仍须真账号环境确认（§八）。

---

## 三、图片功能点验（E1：上传 → 预览成像 → 导出 PNG 带图）

方法：真实磁盘文件（480×320 四象限红/蓝/黄/绿 + 白圆心 + 黑对角 + 半透明品红角）经 `input[type=file]` 上传到 `row.6.val.a`，分别扫描预览画布该格矩形与导出 PNG 全图的像素。

| 观测点 | 近红像素 | 最红像素 RGB | 备注 |
|---|---|---|---|
| 预览画布 · 图片格矩形内 | 827 | 229, 0, 26 → **255, 0, 0**（F4 修复后） | 成像成立（非空白、非占位）；修复后与导出精确一致 |
| 导出 PNG 2× | 3,573 | 255, 0, 0 | 图片确实进入导出产物 |
| 导出 PNG 2× 红区包围盒 | — | — | `(274,610)-(387,645)`，落在图片格内 |

配套截图：`app-preview-with-image.png`、`app-editor-with-image.png`、`exported-2x-with-image.png`、`exported-2x-with-image-transparent.png`。

**结论：通过。** 预览成像与「导出 PNG 带图」均已闭环（T31 前的图片导出修复有效）。

---

## 四、动图首帧（E2）

本机无 ffmpeg/ImageMagick，且 Windows GDI+ 的 GIF 编码器**不支持多帧输出**（实测两次尝试都只落出 1 帧），故按 GIF89a 规范手写字节生成夹具（`fixture-animated-2x2.gif` / `fixture-animated-2frame.gif`：帧 1 纯红、帧 2 纯蓝，各 1s，NETSCAPE 无限循环）。生成过程中修掉两个结构 bug（逻辑屏描述符色表位数写成 2 色、漏写 LZW 最小码长字节），**最终以真实浏览器验证夹具本身有效**：

- 夹具自检（屏幕截图取样 = 肉眼所见，每 ~1s 一次）：`0,0,255 → 255,0,0 → 0,0,255 → 255,0,0`，**两种颜色交替出现 ⇒ 夹具确实在动**（若夹具是静态图，下面的结论就没有意义，故先做这一步）。

应用侧结果（`evidence-gif.json`）：

| 观测点 | 帧 1 红像素 | 帧 2 蓝像素 |
|---|---|---|
| 预览取样 1 / 2 / 3（间隔 1.1s，跨过换帧时刻） | 3588 / 3588 / 3588 | 0 / 0 / 0 |
| 导出 PNG 2× | 20,160 | 0 |

同时确认图片区提示文案「动图按第一帧显示」在 UI 可见（`PropertyPanel.vue`）。

**结论：通过。** 预览与导出都稳定呈现帧 1，不随动画漂移；且三次取样像素数完全相同 ⇒ 渲染路径是**确定性的**（画布绘制天然只取第 0 帧，导出无「抓到哪帧算哪帧」的竞态）。

---

## 五、PNG 透明底与尺寸（TC-PT-082/083 + 外部看图工具复核）

### 1. 尺寸口径（三档 × 三通道）

| 档位 | 抽屉提示文案 | Chromium 实测 | WebKit 实测 | Windows GDI+ 解码 |
|---|---|---|---|---|
| 1× | 约 574 × 458 像素 | 574×458 | 574×458 | 574×458 |
| 2× | 约 1148 × 916 像素 | 1148×916 | 1148×916 | 1148×916 |
| 3× | 约 1722 × 1374 像素 | 1722×1374 | 1722×1374 | 1722×1374 |

宽高比 1:2:3 精确成立，且**抽屉实时提示与实际输出零偏差**（`(内容+32)×倍率` 口径）。

### 2. 透明底（TC-PT-082）

| 采样点 | Chromium | WebKit | Windows GDI+ |
|---|---|---|---|
| 四角 alpha（表格外留白） | 0 / 0 / 0 / 0 | 0 | 0 |
| 中心 alpha（表格内） | 255 | 255 | 255 |
| 像素格式 | — | — | `Format32bppArgb` |

关斑马纹后复测仍成立（`exported-2x-transparent-no-zebra.png` 四角 alpha=0）。

### 3. 外部看图工具复核

用 Windows 自带解码栈（`System.Drawing` = GDI+/WIC）对证据目录 **23 个 PNG 全部逐个解码**，输出见 `os-decoder-check.txt`：全部可正常打开、尺寸与浏览器侧解析逐字节一致、透明底 alpha 值与浏览器 `getImageData` 完全吻合。另落盘深色底 `#111827` / 白底合成图（`composite-2x-transparent-over-dark.png` 等）供人眼复核。

**结论：通过**（TC-PT-082、TC-PT-083 的「透明底 + 尺寸口径」两项可判正式通过）。

### 4. F4 量化与修复：预览画布颜色漂移

| 通道 | 最红像素（修复前） | 最红像素（修复后） |
|---|---|---|
| 预览画布（VTable/vrender 合成） | `(229, 0, 26)` | `(255, 0, 0)` |
| 导出 PNG（离屏 cropCanvas） | `(255, 0, 0)` | `(255, 0, 0)` |

**首轮归因**（登记为「vrender 合成所致」，不阻塞）；**第二轮定因并修复**：

- 真因：VTable 1.26.8 在 `selectionStyle.cellBgColor` 缺省时兜底 `rgba(0,0,255,0.1)`（`scenegraph/select/create-select-border.js`），把**选中格**蒙上一层纯蓝。图片格必须先选中才能上传，故预览里看到偏色；导出链路无选区，所以不偏——这解释了「预览偏、导出不偏」的全部现象。
- 量化吻合：该蒙版的合成式为 `out = 0.898·src + (0, 0, 26)`，代入纯红 `(255,0,0)` 得 `(229,0,26)`，与首轮实测**逐通道相同**；代入纯蓝 `(0,0,255)` 则为恒等（0.898×255+26 = 255），说明首轮「蓝色没偏」的现象同样是该蒙版所致。
- 修复：主题显式关闭内建选区底色（`selectionStyle: { cellBgColor: 'transparent', cellBorderColor: 'transparent' }`，选区高亮由壳层 `.selection-cell` 自绘，R-2）。
- 复验：选中态与未选中态的画布像素**完全相同**（A==B），整幅 272 个采样点中「被蒙版污染」的点数为 0；图片格内最红像素为精确 `(255,0,0)`。

> 同批修复的**伴生几何缺陷**：`toOption` 未把模型逐行 `rowHeights` 喂给 VTable，区块行（模型 32px）在画布上按内容自适应渲染成 36px，导致叠加层矩形/命中测试/导出 PNG 每过一个区块行就漂 4px（第 6 行累计 8px，PNG 还多出一条空白带）。修复后实测所有模型行边界与画布渲染色变位置在 ±2px 内（FR-06 允许 1～2px 抗锯齿差），叠加层矩形与模型矩形精确相等。详见 §十二-4。

---

## 六、跨浏览器（F2）

### 1. firefox：本机 OS 版本阻塞（非应用问题）

firefox 项目 **51 条用例全部无法启动**，报错一致为缺 `api-ms-win-core-apiquery-l2-1-0.dll`。已核实：

- `C:\Windows\System32\api-ms-win-core-apiquery-l2-1-0.dll` **不存在**；
- 该 API 集随 Windows 10 **1809** 引入，本机为 **10.0.17134（1803）**。

⇒ F2 的 firefox 部分**在本机不可测**，且原因在操作系统而非沙箱或应用；换 1809+ 机器即可复测。

### 2. webkit：首轮 44 条失败全为 harness 权限项；第二轮已修复 harness，主套件 webkit 转绿

首轮：webkit 全量跑出 **43/44 条失败，报错文本完全相同**：`browserContext.newPage: Unknown permission: clipboard-write`——harness 在 7 个验收 spec 的文件级 `test.use({ permissions: [...] })` 里无条件声明了 WebKit 不支持的权限项（Playwright 的 WebKit 构建 `grantPermissions` 直接抛 `Unknown permission`），整份用例卡在开页，与产品行为无关。

第二轮修复（三处，均为 harness/兼容性，不改业务语义）：

1. **权限按引擎授予**：`e2e/acceptance/helpers.ts` 新增 `grantClipboardIfChromium(context, browserName)`，7 个 spec 的文件级 `test.use` 改为 `test.beforeEach` 调用它——chromium 行为完全不变，WebKit 不再卡在开页。
2. **WebKit 无 `clipboard-read` 能力**：实测 `navigator.clipboard.read/readText` 恒 `NotAllowedError` 且无法授权，故 6 个「剪贴板读回」类验收 spec（tc051-058 / tc059-069 / tc070-072 / tc073-079 / tc080 / tc085-088）在 webkit 项目里 `testIgnore` 排除（排除的是**读回能力**，不是应用层；应用行为由本目录 `webkit-spotcheck.spec.ts` 抽查覆盖）。
3. **WebKit 无 `OffscreenCanvas`**：`samplePngPixels` 增加普通 `canvas` 回退（原来直接 `ReferenceError`）。

复验（`pnpm exec playwright test --project=webkit`）：**14 通过 / 0 失败 / 2 跳过**（跳过的是 CDP CPU 节流用例，WebKit 无此能力）。覆盖 PNG 导出（尺寸/透明底/含图）、PNG 生成中禁用与失败恢复、PNG 阈值与故障兜底、剪贴板被拒手动复制框、预览画布图片成像、页面基础冒烟。

WebKit 抽查（`webkit-spotcheck.spec.ts`，Safari 引擎真机 headed）**3/3 通过**：

| WebKit 抽查项 | 结果 |
|---|---|
| PNG 导出（含图 + 1×/2×/3× 尺寸 + 透明底） | ✅ 尺寸与 Chromium 完全一致（574×458 / 1148×916 / 1722×1374），透明底 alpha=0/255 |
| 拖拽：组件库「分区色条」拖入表内槽位（真实指针手势） | ✅ 成功（首轮失败原因是用例自身未先关导出抽屉，抽屉遮罩截走了 pointerdown） |
| 刷新恢复：草稿（标记改动 + 图片）跨刷新保留 | ✅ 通过（刷新后标记态与图片像素均在） |

**结论**：webkit 引擎下应用层**未发现任何失败**；且顺带修掉一个真实产品短板——WebKit/Safari 的 async clipboard 不接受 `text/html` 风味，`copyHtml` 现会在异步写入失败后走 `execCommand('copy')` 富文本兜底（选中离屏 DOM → 浏览器把选区序列化成 `text/html`），实测在 WebKit 下能往真实系统剪贴板写入 `HTML Format`（含 `<table>`）；不再直接落到手动复制框。F2 可收窄为「firefox 待 1809+ 真机复测」。

---

## 七、并行 flake 复核（F3）

- **tc080 未复现**：单跑 6 次全绿。
- **另一类 flake 已定性（与产品无关）**：把 CPU 密集的 `png-firstframe` 用例与验收套件**并行**跑时，本机（4 核）每轮会出现 1–2 条位置随机的失败；而两者**单独跑都全绿**（验收 43/43 ×3 轮、`png-firstframe` 4/4）。失败形态是用例等待窗口不够（如 `(60s 无下载无报错)` 分支超时），属**测试健壮性/本机算力**问题，不是产品缺陷。

建议：F3 维持登记；若要收口，方向是给等待类断言加余量或把重负载用例串行化，而非改产品代码。

---

## 八、未执行 / 未覆盖（诚实清单）

| 项 | 原因 | 建议 |
|---|---|---|
| 公众号后台**真编辑器**粘贴 | 本机无公众号账号环境 | 用 §二-4 的路径 ② 在真后台走一遍，并确认 `data:` 图片是否被过滤 |
| 真实 Excel / WPS 来源粘贴（TC-051/052） | 本机无 Excel/WPS | 装任一后按 T30 §四-2 步骤复测 |
| macOS / 真机 Safari | 无 Mac | 用 WebKit 抽查替代（已做）；真机 Safari 仍建议在有 Mac 时抽一次大表 PNG |
| TC-PT-072 窄屏钉列滚动目视 | 需人眼 | 内嵌对照表已给导出整表；窄屏滚动建议用户直接看 |
| TC-PT-073/079 ◐ 字形与 25% 目视 | 需人眼 | 同上 |
| F5 blob 峰值 | 需批量导出压测 | 维持登记 |

---

## 九、质量门禁复核

首轮：新增文件均落在 `manual-verify/`、`reports/` 两处，未触碰 `src/`；逐个门禁实测：

| 门禁 | 命令 | 首轮结果 | 说明 |
|---|---|---|---|
| 类型检查 | `vue-tsc --build` | ✅ exit 0 | `tsconfig.app.json` 只 include `env.d.ts` + `src/**/*`，`tsconfig.node.json` 只 include 配置文件，`manual-verify/**` 不在检查范围（与既有 `e2e/**` 一致） |
| ESLint | `eslint . --no-cache` | ✅ 0 error / 5 warning | 5 条 warning 全在既有 `e2e/png-*.spec.ts`；`manual-verify/` 零问题 |
| oxlint | `oxlint .` | ❌ exit 1 / 11 error | **全部为既有已提交文件的历史问题，与本次新增无关**（见下） |

oxlint 11 条错误的分布（首轮时 `git diff` 为空，均为已提交代码）：

- `src/shell/export/export-download-revoke.spec.ts` 7 条、`src/shell/export/ExportDrawer.spec.ts` 2 条：`vitest/require-mock-type-parameters`（`vi.fn()` 缺类型参数）
- `scripts/check-licenses.mjs:108` 1 条：`no-unused-vars`（`mkdirSync` 引入未使用，来自 T31 提交）
- `src/core/render/coreHost.ts:47` 1 条：`unicorn/no-useless-spread`

`pnpm lint` 的第一段 `oxlint . --fix` 因此会以 exit 1 中断（`run-s` 不会继续跑 eslint）。

**第二轮：已修复，门禁转绿。**

| 门禁 | 命令 | 修复后结果 |
|---|---|---|
| 单元测试 | `pnpm test:unit` | ✅ 58 文件 / **545** 通过（含本轮新增的 clipboard 4 例、vtableTheme 2 例、toOption 行高守卫 1 例） |
| 类型检查 | `pnpm type-check` | ✅ exit 0 |
| 静态检查 | `pnpm lint` | ✅ **0 error / 4 warning**（4 条 warning 为既有 e2e 用例的 `waitForTimeout`/`skip` 风格项，非阻断） |
| e2e（主引擎） | `pnpm exec playwright test --project=chromium` | ✅ **54 / 54 通过** |
| e2e（Safari 引擎） | `pnpm exec playwright test --project=webkit` | ✅ **14 通过 / 0 失败 / 2 跳过** |
| e2e（firefox） | — | ⛔ 本机 OS 阻塞（缺 DLL），非应用问题（§六-1） |
| 许可证 | `pnpm check:licenses` | ✅ OK（10 包，产物 `dist/THIRD-PARTY-LICENSES.txt`） |
| 颜色字面量 | `pnpm check:colors` | ✅ OK |

首轮运行本 harness 时 `manual-verify/real-machine.spec.ts` 内有 2 处 `no-eval`（把 base64 编码函数以字符串传入页面再 `eval`），已改为在 `page.evaluate` 体内联实现；`manual-verify/` 现 oxlint/eslint 均零问题。早期为 F4 定位写的 3 个临时探针（`f4-geometry.spec.ts` / `f4-geometry2.spec.ts` / `f4-rows.spec.ts`）已合并为断言式 `f4-probe.spec.ts` 并删除，其 JSON 产物保留为历史证据。

---

## 十、产物清单

- 新增 harness（未提交）：`manual-verify/playwright.manual.config.ts`、`real-machine.spec.ts`、`preview-copy.spec.ts`、`webkit-spotcheck.spec.ts`、`gif-firstframe.spec.ts`、`drag-debug.spec.ts`（诊断用，可删）
- 证据目录：`reports/manual-verify-2026-10-22/`
  - JSON：`evidence.json`（图片链路 + 透明底尺寸 + 剪贴板 + 粘贴）、`evidence-webkit.json`、`preview-iframe-copy.json`、`evidence-gif.json`、`evidence-gif-fixture.json`
  - 剪贴板转储：`clipboard-*-htmlformat.txt` / `-text.txt`（7 份）+ 读取脚本 `read-clipboard-*.ps1`（4 份）
  - 截图 25 张（含 `paste-1/2/3-*.png`、`exported-*-*.png`、`composite-*.png`、`webkit-*.png`、`app-preview-gif.png`、`exported-2x-gif.png`）
  - 夹具：`fixture-animated-2frame.gif`、`fixture-animated-2x2.gif`（自建 2 帧动图）
  - 复核：`os-decoder-check.txt`（Windows GDI+ 逐个解码 23 张 PNG）
  - 接触表素材：`contact/`（12 张裁切/合成图）+ 生成脚本 `make-contact-assets.ps1`（GDI+ 裁切与缩放）
  - F4 探针（第二轮）：`f4-probe.txt`（272 个采样点：选中/未选中像素比对、蒙版污染计数、行边界对照、叠加层矩形）
  - 剪贴板转储（第二轮新增）：`clipboard-after-copy-iframe-*.txt`（预览 iframe 复制源，现已正确解码为 UTF-8）
- 本报告：`reports/manual-verify-2026-10-22.md`

## 十一、建议的下一步（给 PM/QA）

第一轮列出的 5 条，第二轮处置如下：

1. ~~**P1**：修复「复制 HTML」为双风味写入~~ → **已修复并复验**（§二-7、§十二-1）。剩一项仍需真账号环境：在真公众号后台走一遍，确认 `data:` 图片是否被过滤。
2. ~~**P2**：抽屉文案与行为不符~~ → **已修复**（§十二-2）：文案改为与实现一致（复制的是「双风味剪贴板内容」，预览小窗即其渲染效果），并把「复制 HTML」的成功提示统一为「已复制到剪贴板」。
3. ~~F2 收窄为 firefox 待 1809+ 复测；webkit 侧可结案~~ → webkit **已结案**（主套件 14 通过 / 0 失败，见 §六-2）；firefox 仍待 1809+ 机器复测（OS 缺 DLL，非应用问题）。
4. F3/F5 维持登记（F4 已修复结案）：F3 的收口方向是给等待类断言加余量或把重负载用例串行化；F5 需批量导出压测。
5. ~~**P3**：`pnpm lint` 在 main 上红~~ → **已修复**：`pnpm lint` 现为 0 error / 4 warning（§九、§十二-3）。

仍归人工/外部环境的项（未变）：真公众号后台粘贴、真实 Excel/WPS 粘贴（TC-PT-051/052）、macOS 真机 Safari、TC-PT-072/073/079 目视项。

---

## 十二、修复批次（第二轮：把发现的问题全部修掉并复验）

改动前工作树 = `72ab56e`；下列改动**均未提交**（等 PM/QA 过目后一并入库）。每条都附「改了什么 / 为什么 / 怎么验」。

### 1. P1 · 「复制 HTML」缺 `text/html` 风味（产品缺陷，主路径）

| 项 | 内容 |
|---|---|
| 改动 | `src/shell/export/clipboard.ts`：`copyHtml(html, plain)` 一次写入 `text/html` + `text/plain`（TSV）两种风味；写入被拒仍抛出，由壳展开手动复制框（TC-PT-087 语义不变）。`src/shell/export/ExportDrawer.vue`：调用点传入 TSV，成功文案统一为「已复制到剪贴板」 |
| 为什么 | 首轮真机实测：剪贴板只有纯文本，公众号粘出转义源码（§二） |
| 单测 | `src/shell/export/clipboard.spec.ts`（4 例）：双风味内容与类型、无 `ClipboardItem` + 兜底失败 → 抛、写入被拒 → `execCommand` 兜底成功、两者皆失败 → 抛；`ExportDrawer.spec.ts`：成功文案与 TSV 断言 |
| e2e | 新增 `TC-PT-086 前置 · 「复制 HTML」双风味`（读同一次写入的两种风味）；`helpers.ts` 的 `exportedHtml` 改读 `text/html` 风味 |
| 真机 | `manual-verify/real-machine.spec.ts`：真机剪贴板含 `HTML Format`（`<table>`/✓✗◐/`data:image`）+ `UnicodeText` TSV；三条粘贴路径均得真表格（§二-7） |

### 2. P2 · 抽屉文案与实际行为不一致

| 项 | 内容 |
|---|---|
| 改动 | 预览小窗说明与按钮 tooltip 改为与实现一致；成功提示统一「已复制到剪贴板」 |
| 为什么 | 首轮指出：说明称「与粘贴到富文本编辑器一致」，而当时剪贴板给的是纯文本（§二-3） |
| 复验 | `ExportDrawer.spec.ts` 文案断言 + chromium e2e 中所有读取该 toast 的用例（29 处历史断言随文案一并更新） |

### 3. P3 · `pnpm lint` 在 main 上红（11 条既有 oxlint 错误）

| 项 | 内容 |
|---|---|
| 改动 | 8 处 `vi.fn()` 补类型参数（`export-download-revoke.spec.ts`、`ExportDrawer.spec.ts`）、`scripts/check-licenses.mjs` 删未用 import、`src/core/render/coreHost.ts` 去多余 spread |
| 为什么 | `oxlint . --fix` exit 1 会让 `run-s` 直接跳过 eslint 段，门禁整体失效（§九） |
| 复验 | `pnpm lint` = 0 error / 4 warning；`pnpm check:licenses` 仍 OK |

### 4. F4 · 预览画布选中图片格偏色 + 逐区块行几何漂移（两个伴生缺陷）

| 项 | 内容 |
|---|---|
| 改动① | `src/core/theme/vtableTheme.ts`：显式 `selectionStyle: { cellBgColor: 'transparent', cellBorderColor: 'transparent' }`，关掉 VTable 内建选区底色（选区高亮由壳层自绘，R-2） |
| 为什么① | VTable 1.26.8 缺省兜底 `rgba(0,0,255,0.1)` 蒙在选中格上；合成式 `out = 0.898·src + (0,0,26)` 与首轮实测 `(229,0,26)` 逐通道吻合（§五-4） |
| 改动② | `src/core/adapter/toOption.ts`：把模型逐行 `rowHeights` 以 `rowHeightConfig` 喂给 VTable（不喂则区块行按内容自适应，模型 32px → 画布 36px） |
| 为什么② | 叠加层/命中测试/导出 PNG 都按模型几何走（PX-04「命中与渲染同源」），行高不同源就每过一个区块行漂 4px（第 6 行累计 8px，PNG 多一条空白带） |
| 单测 | `src/core/theme/vtableTheme.spec.ts`（2 例，选区底色守卫）、`toOption.spec.ts` 新增「rowHeightConfig 逐行钉住模型行高」1 例 |
| 真机 | `manual-verify/f4-probe.spec.ts`（断言式，5 组）：① 存值图片 480×320 四象限色精确；② 选中/未选中画布像素完全相同（272 点，被蒙版污染 0 点）；③ 图片格最红像素精确 `(255,0,0)`；④ 所有模型行边界与画布渲染色变位置 ±2px 内；⑤ 叠加层矩形 == 模型矩形 |

### 5. WebKit 兼容（F2 顺带修复）

| 项 | 内容 |
|---|---|
| 改动① | `copyHtml`：异步写入失败后走 `execCommand('copy')` 富文本兜底（离屏 DOM → 选区 → 序列化成 `text/html`）。WebKit 实测：`clipboard.write` 带 `text/html` 抛 `NotAllowedError`，仅 `text/plain` 可写 |
| 改动② | `e2e/acceptance/helpers.ts`：`grantClipboardIfChromium` 按引擎授予剪贴板权限（7 个 spec 的文件级 `test.use` 改为 `beforeEach` 调用）；`samplePngPixels` 增加无 `OffscreenCanvas` 时的普通 `canvas` 回退 |
| 改动③ | `playwright.config.ts`：webkit 项目 `testIgnore` 6 个「剪贴板读回」类验收 spec（WebKit 无 `clipboard-read` 能力，无法授权），排除的是读回能力而非应用层 |
| 复验 | webkit 主套件 **14 通过 / 0 失败 / 2 跳过**；`webkit-spotcheck.spec.ts` **3/3**；真机 `execCommand` 兜底产出 `HTML Format`（含 `<table>`） |
| 单测 | `clipboard.spec.ts` 覆盖兜底成功与兜底失败两条分支 |

### 6. 测试文件修复（既有 flake，非产品）

| 项 | 内容 |
|---|---|
| `e2e/png-firstframe.spec.ts` | 并发导出的 4 个 session 未真正并发（`const outcomes = Promise` 后立即关上下文）、以及把 `expect().toHaveCount` 用在数组上——两处修正为 `await Promise.all(sessions.map(...))` + `expect(outcomes).length` |
| `e2e/png-firstframe.spec.ts` toast 竞态 | 成功 toast 数秒后自动消失，原实现读完产物像素再读 toast 必然落空 → 改为**下载事件到达时即读 toast**，再核对产物像素 |
| `e2e/acceptance/tc081-084-087-png.spec.ts` | 手动复制框兜底文案随 P2 更新 |

> **环境备注（复验期间实测）**：本机另一 AI 会话（WorkBuddy，常驻进程）会周期性改写 `e2e/png-firstframe.spec.ts` 为缺陷版（`const outcomes = Promise`，7214 字节）。本次复验期间发生过一次：chromium 首轮 53/54（`TypeError: outcomes is not iterable`）。恢复正确版后复跑 54/54，且复验前后该文件哈希均为 `38ce54f8…`（正确版，7259 字节）。若该会话仍活跃，入库前请确认此文件未被再次覆盖。

### 7. 复验总表（第二轮最终状态）

| 门禁 / 验证 | 命令 | 结果 |
|---|---|---|
| 单元测试 | `pnpm test:unit` | ✅ 58 文件 / 545 例通过 |
| 类型检查 | `pnpm type-check` | ✅ exit 0 |
| 静态检查 | `pnpm lint` | ✅ 0 error / 4 warning |
| e2e chromium | `pnpm exec playwright test --project=chromium` | ✅ 54 / 54 |
| e2e webkit | `pnpm exec playwright test --project=webkit` | ✅ 14 通过 / 0 失败 / 2 跳过 |
| 真机人工项 | `pnpm exec playwright test --config manual-verify/playwright.manual.config.ts` | ✅ 3 / 3（图片链路、PNG 透明底尺寸、剪贴板与三条粘贴路径） |
| F4 回归探针 | 同上（`f4-probe.spec.ts`） | ✅ 选中态不改像素、矩形同源、行边界 ±2px |
| 预览色值探针 | 同上（`preview-color.spec.ts`） | ✅ 1:1 与 2× 采样下均出现精确纯红 |
| 动图首帧 | 同上（`gif-firstframe.spec.ts`） | ✅ 2 / 2 |
| WebKit 抽查 | 同上（`webkit-spotcheck.spec.ts`） | ✅ 3 / 3 |
| 预览 iframe 复制源 | 同上（`preview-copy.spec.ts`） | ✅ 1 / 1（剪贴板 `HTML Format` 含 `<table>`，粘出真表格） |
| 许可证 / 颜色字面量 | `pnpm check:licenses` / `pnpm check:colors` | ✅ OK |

> 环境说明（非应用问题，未变）：firefox 项目在本机 10.0.17134 缺 `api-ms-win-core-apiquery-l2-1-0.dll`（1809 才有）无法启动；WebKit 构建不支持 `clipboard-read` 授权。两者均已在本报告中归因并给出复测条件。
