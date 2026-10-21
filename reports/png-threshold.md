# PNG 像素门槛校准报告（T33）

- 任务：S6 · T33（承接 PoC-1c 像素门槛校准 / PoC-1d `?pt-png-max` 覆盖验证 / 兜底演练）
- 日期：2026-10-21
- 环境：Windows 沙箱 · Playwright 1.63（chromium headless，dev server）· pretty-table @ T34 改造后
- 复跑命令：`pnpm exec playwright test --project=chromium e2e/png-threshold.spec.ts`

## 1. 测法说明

- **真实链路**：不直连核 API，全部经 UI 走「打开导出抽屉 → 选倍率 → 导出 PNG」全链路；下载产物按 PNG IHDR 头解析实测像素尺寸。
- **大表构造**：在 `LIMITS`（20 行 × 12 列 × 列宽 ≤360 × 行高宽松档 48）内取满，经 IndexedDB 草稿位（`idb-keyval`：db `pretty-table` / store `kv` / key `draft:current`）在 `addInitScript` 里预置草稿，App 启动 `tryRestoreDraft` 恢复。
- **门槛覆盖**：调试参数 `?pt-png-max=<px>` 把门槛压到可达规模（PoC-1d 指定测法）；dev 构建下 `pngMaxOverride()` 生效。
- **口径**：内容宽 = 列宽和 + 外框 2px；输出 =（内容 + 32）× 倍率（四周留白 16px，`PNG_PAD=16`）。

## 2. 实测数据（chromium）

### 2.1 出图像素尺寸口径（中等表 8 行 × 4 列，列宽 180，行高宽松）

内容 = 722 × 386（`measureContentSize`）。

| 倍率 | 理论（内容+32）×倍率 | 实测产物 IHDR | 判定 |
|---|---|---|---|
| 1× | 754 × 418 = 315,172 px | 754 × 418 | ✓ 完全一致 |
| 2× | 1,508 × 836 = 1,260,688 px | 1,508 × 836 | ✓ 完全一致 |
| 3× | 2,262 × 1,254 = 2,836,548 px | 2,262 × 1,254 | ✓ 完全一致 |

**留白口径验证：实测尺寸与（内容 + 32）× 倍率逐像素相等（无 ±2px 余量）。**

### 2.2 大表与门槛边界（极限表 20 行 × 12 列，列宽全 360，行高宽松）

内容 = 4,322 × 962。

| 倍率 | 输出尺寸 | 输出像素 | 相对默认门槛 16,777,216 |
|---|---|---|---|
| 1× | 4,354 × 994 | 4,327,876 | 25.8%（可出图，实测 ✓） |
| 2× | 8,708 × 1,988 | 17,311,504 | **103.2%（默认门槛下必拒）** |
| 3× | 13,062 × 2,982 | 38,950,884 | 232.2%（默认门槛下必拒） |

| 用例（`?pt-png-max` 覆盖） | 期望 | 实测 |
|---|---|---|
| 门槛 = (2×+3×)/2 ≈ 28,131,194 | 3× 必触发 `EXPORT_PNG_TOO_LARGE`；2× 必通过 | ✓ 3× 出白话降倍建议、无产物；2× 出图 8,708×1,988 |
| 门槛 = 2× 预估 − 1 = 17,311,503（边界减一） | 2× 必触发；1× 必通过 | ✓ 2× 拒绝（`>` 严格判定压线有效）；1× 出图 4,354×994 |

触发时行为（chromium 实测）：toast 白话建议（「当前 3× 超限，请改用 2× 或 1× 后重试」），不露错误码（GC-25）、不建产物、不自动降倍（PX-12）。

## 3. 兜底演练（?pt-fault=EXPORT_PNG_TOO_LARGE）

chromium 实测：注入后点「导出 PNG」→ 直接出人话提示「当前 2× 超限，请改用 1× 后重试」；无 download 事件（不建产物）；倍率选择维持 2×（不自动降倍）。用例：`e2e/png-threshold.spec.ts` · 兜底演练 describe。

## 4. 结论：维持 16,777,216

1. **口径吻合**：三档倍率实测尺寸与（内容 + 32）× 倍率零偏差，门槛预估公式与真实画布同源，无需修正。
2. **边界干净**：门槛判定为严格 `>`（预估像素 > maxPixels 即拒），压线 ±1 行为正确；`?pt-png-max` 覆盖优先级符合 PoC-1d（介于 2×/3× 预估之间时 3× 拒、2× 过）。
3. **上限合理性**：chromium 可成功导出 17.3M px（门槛之上）；但 WebKit/Safari 画布面积上限约 16.7M px（4096²，T19 门槛的实测依据），17.3M 画布在 WebKit 会创建失败。**维持 16,777,216 是 Safari 安全上限的正确取值**，不建议上调。
4. **不稳定区间**：约 16.7M～17.5M px（极限表 2× 一档）。chromium 实测该区间可出图，但跨过 Safari 上限；产品语义上应按「Safari 必失败」处理，维持现值即可。≥38.9M px（3× 极限表）在 chromium 亦稳定拒绝。

## 5. 跨浏览器结果矩阵

| 用例 | chromium | firefox | webkit |
|---|---|---|---|
| 应用根路径可达（既有 vue.spec） | ✓ | 环境性失败¹ | 环境性失败¹ |
| 1×/2×/3× 出图口径 | ✓ 全过 | 环境性失败¹ | 环境性失败¹ |
| PoC-1d 门槛覆盖（3× 拒 / 2× 过） | ✓ | 环境性失败¹ | 环境性失败¹ |
| 边界减一（2× 拒 / 1× 过） | ✓ | 环境性失败¹ | 环境性失败¹ |
| 兜底演练 ?pt-fault | ✓ | 环境性失败¹ | 环境性失败¹ |

> ¹ **环境性失败（非代码问题）**：本沙箱 Windows 宿主缺系统组件 `api-ms-win-core-apiquery-l2-1-0.dll`，
> Playwright 启动 firefox / webkit 进程即报 `browserType.launch: Host system is missing dependencies`
> （`playwright install firefox webkit` 阶段 host 校验已给出同款警告，浏览器二进制本身已下载完成）。
> 5 条用例全部在 launch 阶段失败，未执行到任何断言。**待真机（含 macOS Safari / Windows Firefox / iOS WebKit）手动复测后回填本表**；补测口径与断言可直接复用 `e2e/png-threshold.spec.ts`（用例本身不依赖 chromium 特性）。

## 6. 与门槛相关的备注（T34 交联）

- 门槛常量 `PNG_MAX_PIXELS_DEFAULT = 16_777_216` 与估算口径已随 T34 拆分至 `src/core/export/pngSize.ts`（与 VTable 解耦的静态模块），语义未变。
- 超限时壳层建议文案与倍率高亮（PX-12）由 `ExportDrawer` 消费核内 `EXPORT_PNG_TOO_LARGE`，核内不自动降倍（单测 `png.spec.ts` 已锁）。
