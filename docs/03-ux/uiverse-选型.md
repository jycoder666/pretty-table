# Uiverse 选型清单 · Reka UI 与 Uiverse 分工

> 项目：pretty-table · UX · 作者：交互设计师 · 日期：2026-10-20（Asia/Shanghai）  
> 状态：**v2 · 分工、取用规则与具体片段文件（UV-1/2）均已定 · 仍不开码**  
> 前提（已拍板）：Vue 3 + Pinia（Q4）、Reka UI（Q5）、原生 CSS 变量不引入 Tailwind（Q2）、色板单一来源 G-2（[脚手架选型](../research/脚手架选型-2026-10-20.md) §7）  
> 来源：[Uiverse Galaxy](https://github.com/uiverse-io/galaxy)（Uiverse.io 开源归档，MIT）  
> 对齐：[U-2 主题色板](./U-2-主题色板-草案.md) · [页面流](./页面流-模板库编辑台导出.md) · [编辑台操作体验深化](./编辑台操作体验深化.md) · [增强期稿](./增强期-粘贴填槽与导出选项.md)

---

## 0. 一句话分工

**Reka UI 管「怎么动、谁能用」，Uiverse 只管「长什么样」，颜色只从 U-2 来。**

| 层 | 负责 | 不负责 |
|---|---|---|
| **Reka UI**（无样式组件） | 交互行为与无障碍：打开/关闭、焦点进出与回收、键盘操作、读屏属性、层级与遮罩 | 任何视觉（颜色、圆角、阴影、动效） |
| **Uiverse 片段**（仅视觉参考） | 外观质感：按钮按压感、开关滑块形态、空态小插画式动效、加载点 | 任何行为与状态逻辑；不得带自己的 JS |
| **U-2 色板 / G-2** | 全部颜色：`paper / primary / headerText / zebra / emphasis / border / tag` | — |
| **项目自有 SFC** | 把上面三者拼成组件：Reka 原件 + 改写后的样式 + 色板变量 | — |

冲突时的优先级：**无障碍 > U-2 色板 > 页面流文案与动效上限 > Uiverse 原片段外观**。

---

## 1. 组件逐项分工

| 界面元素 | 出现位置 | 行为来源 | 视觉来源 | 说明 |
|---|---|---|---|---|
| 导出抽屉 | P2 右侧 | Reka `Dialog`（抽屉形态） | 自写，不取 Uiverse | 焦点回收、Esc 关闭靠 Reka；外观朴素即可 |
| 另存为模板弹窗 | P2 | Reka `Dialog` | 自写 | 同上 |
| toast | 全局 | Reka `Toast` | 自写，不取 Uiverse | 读屏播报靠 Reka；文案见页面流 §3.3 / 增强期稿 §1.3 |
| 主题切换 | P2 顶栏 | Reka `RadioGroup` / `ToggleGroup` | 自写色块 | 色块即 T-A/B/C 的 `primary` 实色 |
| 对齐三钮、符号三钮（✓✗◐） | P2 右栏 | Reka `ToggleGroup` | 自写 | 必须键盘可切换 |
| 「设为推荐」开关、斑马纹开关 | P2 右栏 | Reka `Switch` | **Uiverse · 开关类**（见 §2 U-02） | 只取滑块形态 |
| PNG 倍率、透明底选项 | 导出抽屉 | Reka `RadioGroup` / `Checkbox` | **Uiverse · 单选/复选类**（U-03） | 只取勾选形态 |
| 模板库分类 Chip | P1 顶部 | Reka `ToggleGroup` | 自写 | — |
| 主按钮（使用此模板 / 导出 / 复制 HTML） | P1 / P2 / 抽屉 | 原生 `<button>` | **Uiverse · 按钮类**（U-01） | 只取按压感 |
| 工具提示（禁用按钮说明） | P2 | Reka `Tooltip` | **Uiverse · 提示类**（U-05，可不用） | 文案仍按页面流 |
| 生成中 / 复制中加载点 | 导出抽屉内局部 | 无（纯视觉） | **Uiverse · 加载类**（U-04） | 只限按钮内或抽屉内小块；禁止整页 loading |
| 空态小动效 | P1「我的模板」空、筛选无结果 | 无（纯视觉） | **不启用**（U-06，见 §5） | 只用文字加操作按钮 |
| 表格本身、拖拽槽位、区块 | P2 画布区 | VTable + @dnd-kit | U-2 + 自写 | **禁止**取任何 Uiverse 片段 |

---

## 2. Uiverse 取用条目（类别；具体文件见 §5）

> 每条的具体片段文件见 §5（v2 已定）。**前端只实现 §5 点名的条目。**

| # | 用途 | 来源（仓库相对路径） | 采用理由 | 禁止照搬 | 落地 token 提示 |
|---|---|---|---|---|---|
| U-01 | 主按钮按压感 | [`Buttons/`](https://github.com/uiverse-io/galaxy/tree/main/Buttons) | 给「导出 / 使用此模板」一点实体按压反馈，比纯色块更像工具 | 渐变底、霓虹描边、发光阴影、悬停放大 > 1.03、文字特效 | 底 `primary`、字 `headerText`；圆角 6px；按下下沉 1px + 阴影收；时长 ≤120ms |
| U-02 | 开关滑块 | [`Toggle-switches/`](https://github.com/uiverse-io/galaxy/tree/main/Toggle-switches) | 「设为推荐」「斑马纹」需要一眼看出开关状态 | 日夜切换图标、弹跳、拟物 3D、彩色轨道 | 开 `primary`、关 `border`；滑块 `paper`；≤150ms 线性滑动 |
| U-03 | 单选 / 复选 | [`Radio-buttons/`](https://github.com/uiverse-io/galaxy/tree/main/Radio-buttons) · [`Checkboxes/`](https://github.com/uiverse-io/galaxy/tree/main/Checkboxes) | 倍率与透明底选项要清楚、点击区域大 | 勾选爆炸/粒子、描边绘制动画 > 200ms | 选中 `primary`；边 `border`；圆角 4px（复选）/ 圆（单选） |
| U-04 | 局部加载点 | [`loaders/`](https://github.com/uiverse-io/galaxy/tree/main/loaders) | PNG 3x 生成可能要等一两秒，需要局部「在做」的提示 | 全屏遮罩、彩虹色、超过 3 个元素的复杂造型 | 色 `primary` 60% 不透明；尺寸 ≤16px；只在按钮内或抽屉内 |
| U-05 | 工具提示外观（可选） | [`Tooltips/`](https://github.com/uiverse-io/galaxy/tree/main/Tooltips) | 禁用按钮的白话原因要好读 | 弹跳出现、箭头动画、玻璃拟态 | 底 `primary` 或深灰，字 `headerText`；圆角 4px；淡入 ≤150ms |
| U-06 | 空态小图案（v2：不启用） | [`Patterns/`](https://github.com/uiverse-io/galaxy/tree/main/Patterns) · [`Cards/`](https://github.com/uiverse-io/galaxy/tree/main/Cards) | 让空态不至于一片白 | 大插画、卡通形象、渐变背景、循环动画 | `zebra` / `tag` 浅色线稿；静态优先，若动 ≤300ms 且只动一次 |

**本期不取：** `Forms/`、`Inputs/`、`Notifications/`（表单与通知分别由自写和 Reka `Toast` 负责，避免一套界面两种语气）。

---

## 3. 前端取用规则（照 Galaxy 取用约定，本项目补充）

1. **只实现本清单点名的条目**；缺条目先回流交互补清单，**禁止**自己去 Galaxy 挑。
2. 片段统一改写成 **Vue SFC + scoped CSS**，颜色只用 U-2 变量（由 G-2 色板数据生成）；**禁止**写死色值，**禁止**保留片段里的 Tailwind 类名。
3. Uiverse 片段里的行为（JS、`:checked` 驱动的状态逻辑）一律丢掉，行为交给 Reka 原件或原生元素。
4. **动效上限**：单次 ≤300ms（页面流 F3）；禁止弹跳、粒子、循环动画、整页 loading。
5. **系统「减少动态效果」**：`prefers-reduced-motion: reduce` 时，所有 Uiverse 动效降为即时切换（只留颜色变化）。
6. 每条改写件保留来源注释：`/* 来源：uiverse-io/galaxy <路径>，MIT */`。
7. **禁止**改 `node_modules`，禁止把 Galaxy 整包装进依赖。
8. 导出产物（HTML / PNG）里**不出现**任何 Uiverse 片段，导出只有表格本身。

---

## 4. 验收（交互）

| 项 | 判据 |
|---|---|
| 同源意图 | 改写件看得出对应条目的形态，但颜色全是 U-2 token |
| 贴合现 UI | 三套主题切换后，所有取用件跟着换色，没有残留原片段颜色 |
| 过炫降级 | 触到 §2「禁止照搬」任一项 → 按本清单 token 提示降级重做 |
| 无障碍 | 键盘可达、焦点可见、读屏能读出状态（由 Reka 保障，交互抽查） |
| 减少动态效果 | 打开系统设置后，没有任何位移或缩放动画 |

---

## 5. 片段点名（UV-1 / UV-2，v2 已定）

前端**只实现本表点名的条目**；主选不合适时可换备选，二者都不合适就回流交互补，不得自行到 Galaxy 另挑。路径均已在仓库内核对存在（克隆于 2026-10-20）。

| # | 组件 | 主选 | 备选 | 采用理由 | 必须改写 / 禁止照搬 | token 映射 |
|---|---|---|---|---|---|---|
| U-01 | 主按钮 | [`Buttons/Yaya12085_fast-goose-7.html`](https://github.com/uiverse-io/galaxy/blob/main/Buttons/Yaya12085_fast-goose-7.html) | [`Buttons/danilppzz_loud-badger-4.html`](https://github.com/uiverse-io/galaxy/blob/main/Buttons/danilppzz_loud-badger-4.html)（次按钮 / 描边按钮） | 主选底部加厚边做按压感，按下边变薄，像实体键，不靠渐变；备选只有描边加悬停换色，适合「取消」「另存」 | 原文是 Tailwind 类，须改写成 CSS 变量；去掉 `shadow-lg` 彩色投影；绿色换主题色 | 底 `primary`，加厚边 `primary` 加深 15%，字 `headerText`；圆角 6px；按下 ≤120ms |
| U-02 | 开关 | [`Toggle-switches/alexruix_unlucky-pug-99.html`](https://github.com/uiverse-io/galaxy/blob/main/Toggle-switches/alexruix_unlucky-pug-99.html) | [`Toggle-switches/nikk7007_smooth-fox-6.html`](https://github.com/uiverse-io/galaxy/blob/main/Toggle-switches/nikk7007_smooth-fox-6.html) | 主选是细轨道加圆滑块的 Material 式，安静；备选是方块滑块，适合偏硬朗的主题 | 主选：Tailwind 改 CSS 变量，去掉选中时内点缩小的效果；备选：去掉红绿两色，关闭态不用红色 | 开 `primary`，关 `border`，滑块 `paper`；≤150ms 线性 |
| U-03a | 复选（透明底等） | [`Checkboxes/G4b413l_smooth-duck-62.html`](https://github.com/uiverse-io/galaxy/blob/main/Checkboxes/G4b413l_smooth-duck-62.html) | [`Checkboxes/Shubh0408_silly-parrot-64.html`](https://github.com/uiverse-io/galaxy/blob/main/Checkboxes/Shubh0408_silly-parrot-64.html) | 主选是方框变对勾，状态一眼可辨；备选是方框内实心小方块，更克制 | 主选 `transition: all 0.375s` 改为 ≤200ms，只过渡边框和形状；`transform: scale(0)` 藏原生框的做法丢掉，交给 Reka `Checkbox`；绿色换主题色 | 选中 `primary`，边 `border`；圆角 4px |
| U-03b | 单选（PNG 倍率等） | [`Radio-buttons/Yaya12085_rude-mouse-79.html`](https://github.com/uiverse-io/galaxy/blob/main/Radio-buttons/Yaya12085_rude-mouse-79.html) | [`Radio-buttons/spj2401Dev_lucky-moth-60.html`](https://github.com/uiverse-io/galaxy/blob/main/Radio-buttons/spj2401Dev_lucky-moth-60.html) | 主选是分段选择条（1x / 2x / 3x 并排），比圆点单选更像工具，点击区大；备选是独立药丸按钮 | 写死的 `width: 300px` 改为自适应；备选的 `box-shadow: 0 0 50px` 大投影去掉；`display:none` 藏 input 交给 Reka `RadioGroup` | 槽底 `zebra`，选中块 `paper` + 字重 600，字用界面默认文字色（非主题 token）；圆角 6px；≤150ms |
| U-04 | 局部加载点 | [`loaders/Javierrocadev_new-sloth-45.html`](https://github.com/uiverse-io/galaxy/blob/main/loaders/Javierrocadev_new-sloth-45.html) | [`loaders/AqFox_silent-quail-21.html`](https://github.com/uiverse-io/galaxy/blob/main/loaders/AqFox_silent-quail-21.html) | 主选是三个点依次弹跳，小而易懂；备选是两点旋转，更紧凑，适合放进按钮里 | Tailwind 改 CSS 变量；点径缩到 ≤6px，整体 ≤16px 高；开了「减少动态效果」时改为静态「生成中…」文字 | 色 `primary` 60% 不透明 |
| U-05 | 工具提示（启用） | [`Tooltips/G4b413l_dry-turtle-84.html`](https://github.com/uiverse-io/galaxy/blob/main/Tooltips/G4b413l_dry-turtle-84.html) | [`Tooltips/Cksunandh_afraid-snail-51.html`](https://github.com/uiverse-io/galaxy/blob/main/Tooltips/Cksunandh_afraid-snail-51.html) | 主选只做淡入加小三角，最朴素；备选有上移进场，偏活泼 | 只取气泡和三角样式，触发、定位、延迟交给 Reka `Tooltip`；`opacity 0.3s` 改为 ≤150ms；备选的上移位移改为 ≤4px | 底 `primary`，字 `headerText`；圆角 4px |
| U-06 | 空态小图案 | **不启用** | — | 已核对 Cards/Patterns：小体量候选要么只是纯色块，要么是拟物投影或悬停放大，都比文字空态差 | 空态只用文字加一个操作按钮（文案按页面流），不加插画、不加动效 | — |

---

## 6. 修订

| 日期 | 说明 |
|---|---|
| 2026-10-20 | v2：§5 点名 UV-1/2 具体片段（U-01～U-05 主选 + 备选，U-06 不启用），路径已核对；状态改为 v2 |
| 2026-10-20 | v1：定 Reka UI / Uiverse / U-2 三层分工；点名 6 类取用条目与禁止照搬项；前端取用规则与减少动态效果要求；具体文件待 v2 |

*落盘：`docs/03-ux/uiverse-选型.md` · 交互设计师 · 不写业务代码 · 不开码*
