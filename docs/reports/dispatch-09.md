# Dispatch 9 — PASS

执行日期：2026-09-21　｜　环境：macOS (darwin 25.6.0)、Node v24.18.0、npm 11.16.0、Chromium (Playwright 1.63)

## 1. 本次完成内容

对照 `docs/09-portfolio-polish.md` 的范围与验收标准逐条说明。

### 补上一个从 Dispatch 0 起就存在的合同缺口：Demo reset

`CLAUDE.md` 的存储合同要求"提供明确的 demo reset；只有用户触发 reset 才清空"。`reset()` 从 Dispatch 0 起就在 repository 层实现并被测试覆盖，但**界面上没有任何入口能触达它**——合同的前半句一直没有兑现。本阶段补上：

- 位置在 `/about-project` 底部，全项目唯一会清除存储的地方。
- **两步确认，且确认文案逐项列出将要丢弃的内容**（改过的商品、增改的选题、已存审计、已完成建议），而不是问一句"确定吗"。
- `previewDemoReset` **对照 seed 计数，不是对照零**：演示自带 10 条选题，丢掉它们和丢掉用户自己写的不是一回事。
- **corrupted 单独处理**：读不出来的存储同样返回 seed，但此时 reset 是修复而非损失，不能标成"已经是干净的"。
- 失败时明说"什么都没有清除，你的东西还在"，绝不谎报成功。
- 集成测试同时锁定反面：**加载、损坏数据、保存失败都不得清空存储**，且 reset 只删本项目命名空间下的键（测试里放一个别人的键进去，验证它还在）。

### /about-project

开发动机、独立站运营的四类具体失效方式、模块关系表、端到端链路、演示路径、以及**八条模型局限**（数据是生成的 / 分数是本项目规则 / GEO 不测量真实 AI 行为 / 归因是 last-touch 单渠道 / 营收口径窄且不建模退款 / 影响与工作量是估计 / 自然渠道 CAC 为 0 是因为没摊成本 / 这是工作台不是商城）。模块表与演示路径都从 `NAV_ITEMS` 与常量生成，规则版本号直接 import，**不会与实现脱节**。

### 跨模块导航补全

`NavItem` 增加 `question`（该模块回答的运营问题）。Dashboard 新增 "Where to go next"，链接到全部 7 个其他模块；此前 Dashboard 只能到 Analytics / Funnel / SEO / GEO，**Products、Content、Recommendations 从 Dashboard 无法直达**。About 页的模块表同源。侧边栏增加独立的 About 分区。

### README

从"任务包说明"重写为项目 README：业务背景与四类失效方式、功能模块表、真实技术架构与分层、为什么没有数据库、SEO/GEO 评分设计、数据模型与关系、核心指标口径表、安装运行测试（含端口与命名空间）、截图索引、**5 分钟演示路径与面试讲解提纲**、已知限制与未来规划、保留完整任务索引。

### 截图与性能测量

- `npm run screenshots` → `docs/screenshots/` 共 14 张（12 张桌面 + 2 张 375px），跑在生产构建上，**先跑完 SEO/GEO 审计再截**，否则分数全是 "Not audited"。每张截图前都断言页面已到 ready 状态，**一个坏掉的页面不会悄悄变成一张转圈的截图**。
- `npm run perf` 实测浏览器自报的导航计时与传输字节。
- 两者都在 `tools/screenshots/`，用独立 config 与独立存储命名空间，**绝不混进质量门禁**——截图会写入仓库。

### 回归

新增 `e2e/regression.spec.ts`，走完整链路：商品 SEO 编辑 → 快照同步 → 审计产生分数 → 再次编辑 → stale → 重新审计 → stale 清除 → 内容 → Analytics → Funnel → Recommendation 完成并刷新 → 回到 Dashboard 核对会话数与 Analytics 一致。另含：全模块深链、窗口一致性、**两次加载指标逐字节相同**（防随机漂移）、全模块无 console error、三档宽度 13 条路由溢出巡检、每页恰好一个 h1 与 main landmark。

### 验收标准对照

| 验收项 | 结果 |
|---|---|
| 全新安装、启动、reset 与测试说明可复现 | `rm -rf node_modules .next` 后全绿；reset 有 UI 且有测试 |
| 所有导航与跨模块深链可用 | E2E 逐条点击断言 URL |
| 375 / 768 / 1440 检查 | E2E 自动巡检 13 条路由 × 3 档；**768px 首次人工核对**（此前八个阶段均未做） |
| 重要流程键盘可达 | skip link、侧边栏 Enter 导航、菜单 Enter/Escape 有测试；表单标签关联 |
| 性能记录实际环境和结果，不虚报 Lighthouse | 见第 3 节，实测浏览器上报值，**未跑 Lighthouse 也不声称跑过** |
| 数据一致、无随机漂移 | 两次加载逐字节相等有测试 |
| README / 截图 / About 与实现一致 | 截图由脚本从生产构建生成；About 的规则版本号直接 import |
| 未实现功能明确列未来规划 | README 与 About 各一份 |

## 2. 修改的核心文件

**新增**

| 文件 | 目的 |
|---|---|
| `src/components/about/about-view.tsx` | 项目说明页 |
| `src/app/about-project/page.tsx` | 路由 |
| `src/components/demo/demo-reset.tsx` | 两步确认的 demo reset |
| `tools/screenshots/capture.spec.ts` | 截图生成 |
| `tools/screenshots/perf.spec.ts` | 性能测量 |
| `playwright.screenshots.config.ts` | 门禁之外的独立 config |
| `e2e/regression.spec.ts` | 全链路回归 |
| `e2e/about-project.spec.ts` | About 与 reset |
| `tests/integration/demo-reset.test.ts` | reset 的正反面 |
| `tests/unit/nav-items.test.ts` | 导航一致性 |
| `docs/screenshots/*.png` | 14 张实际截图 |

**修改**

| 文件 | 修改目的 |
|---|---|
| `README.md` | 重写为项目 README |
| `src/services/demo-state-service.ts` | `previewDemoReset` / `resetDemoData` |
| `src/components/layout/nav-items.ts` | `question` 字段、`SECONDARY_NAV_ITEMS` |
| `src/components/layout/app-shell.tsx` | About 分区 |
| `src/components/dashboard/dashboard-view.tsx` | "Where to go next" + About 链接 |
| `src/components/products/product-detail-view.tsx` | **修复 375px 横向溢出** |
| `package.json` | `screenshots` / `perf` 脚本 |
| `docs/00-architecture.md` | Dispatch 9 实施记录 |

**删除**：`src/components/module-placeholder.tsx`（全模块实现后无引用）。

## 3. 测试结果

`rm -rf node_modules .next` 后逐条捕获退出码：

| 命令 | 结果 | 实际数量 | 相比 Dispatch 8 |
|---|---|---|---|
| `npm ci` | PASS | 428 packages | — |
| `npm run lint` | PASS | 0 problems | — |
| `npm run typecheck` | PASS | 无输出 | — |
| `npm run test -- --run` | PASS | **20 文件 / 367 通过，0 失败 0 跳过** | +7 |
| `npm run test:integration -- --run` | PASS | **13 文件 / 236 通过，0 失败 0 跳过** | +12 |
| `npm run test:e2e` | PASS | **166 通过，0 失败 0 跳过** | +22 |
| `npm run build` | PASS | 15 条路由（2 静态 / 13 动态） | +1 路由 |
| `OVERALL` | **fail=0** | — | — |

### 性能实测

`npm run perf`，生产构建 `next start`，Chromium，本机 loopback。数值是浏览器自己上报的 `PerformanceNavigationTiming` 与 `PerformanceResourceTiming`，**不是 Lighthouse 分数，本阶段没有跑过 Lighthouse**。

| 路由 | TTFB | DCL | load | LCP | 传输 KB | 请求数 |
|---|---|---|---|---|---|---|
| /dashboard | 6 | 23 | 46 | 28 | 281 | 27 |
| /products | 9 | 23 | 29 | 24 | 33 | 37 |
| /products/[id] | 6 | 14 | 18 | 52 | 25 | 28 |
| /seo | 9 | 18 | 25 | 40 | 40 | 41 |
| /geo | 8 | 18 | 24 | 40 | 38 | 34 |
| /content | 10 | 20 | 27 | 28 | 34 | 35 |
| /analytics | 10 | 21 | 28 | 28 | 26 | 27 |
| /funnel | 8 | 19 | 24 | 56 | 28 | 27 |
| /recommendations | 9 | 20 | 25 | 20 | 35 | 27 |
| /about-project | 11 | 23 | 28 | 24 | 29 | 27 |

单位毫秒。**/dashboard 的 281 KB 是冷缓存的结果**——它是本次测量的第一个导航，共享 JS chunk 全部计在它头上，后续路由复用缓存所以只有 25–40 KB。这不是 dashboard 特别重，而是测量顺序造成的，如实记在这里而不是修饰掉。

本机 loopback 的绝对数值没有外部参考价值（没有网络延迟、没有真实设备），**可比的是相对关系**：没有哪个模块明显重于其他模块，130 条任务的 Recommendations 也不例外。

### 过程中真实失败 5 次

0. **最终门禁第一次跑出 `fail=1`：lint 在 `tools/screenshots/perf.spec.ts` 上报错**（一个写了没用的变量，加两条 console 警告）。这个文件是在上一轮门禁通过之后才加的，而 `eslint .` 覆盖整个仓库。删掉死变量；`console.log` 加文件级 disable 并写明理由——**打印表格就是这个脚本的产出**，它不是应用代码也不参与门禁。修复后重跑全部门禁。记在这里是因为：如果只信上一轮的结果，这份报告就会谎报 lint 通过。
1. **375px 下商品详情页横向溢出 81px（真实缺陷）。** canonical URL 是长不可断字符串，在 `flex justify-between` 里撑开了行的最小宽度。修法：值加 `min-w-0` + `break-words`，标签加 `shrink-0`。这是继 Dispatch 5 的 `sr-only` 溢出之后第二个同类问题——**任何可能承载 URL 或 slug 的容器都要能断行**。发现它靠的是把详情路由加进溢出巡检；只扫列表页永远看不到，因为长字符串都在详情页。
2. 我的 E2E 断言用了会命中两个元素的文本选择器（strict mode violation）。测试缺陷，改用容器 + `toContainText`。
3. 三处 testid 写错（`product-result-count` 实为 `result-count`、`analytics-total-sessions-value` 实为 `analytics-sessions-value`、产品 id 少了 `_tent` 后缀）。测试缺陷。
4. 集成测试里的内容表单字段名和枚举值猜错（`intent`→`searchIntent`、`Awareness`→`TOFU`、`Guide`→`Buying Guide`）。测试缺陷，按 schema 改正。

**门禁全部通过后才写本报告，没有删测试、跳过用例或弱化断言。**

## 4. 验收证据

**浏览器人工核对**（生产构建 + `next start`，实际操作，非仅看测试结果）：

- **768px 首次人工核对**——此前八个阶段全部记为"未运行"，是累积的缺口。实测 About 页两栏网格、Dashboard 指标卡两栏、"Where to go next" 两栏，均无溢出，菜单按钮正常显示。
- **375px 手动走完 reset 全流程**：跑 SEO 审计 → About 页显示 "Stored audit results 17"（与实际审计页数一致）→ 点 Reset demo data → 确认面板逐项列出待丢弃内容 → 点 "Yes, reset demo data" → 页面显示已重置。随后在页面上下文里读 `Object.keys(localStorage)` 得到 `[]`，**确认存储确实被清空而不只是 UI 说清空了**。
- 12 张桌面截图 + 2 张 375px 截图已落盘 `docs/screenshots/`，逐张目视检查过内容正确（Recommendations 顶部为 130 / 42 / 11 / 0，首条为 Summit 20 的 GEO Quick Win；About 页八条局限完整呈现）。

**自动化证据**：全链路回归、13 条路由 × 3 档宽度溢出巡检、两次加载逐字节一致、全模块零 console error、每页恰好一个 h1 与 main landmark。

**未运行**（如实标注，不计为通过）：

- **Lighthouse 未跑**，本报告不含任何 Lighthouse 分数。
- **Firefox / WebKit 未跑**，E2E 仅 Chromium。
- **屏幕阅读器未实测**。可访问性覆盖的是结构性检查（语义标签、`aria-current`/`aria-expanded`/`aria-describedby`、role、键盘可达、焦点样式、状态不依赖颜色），这些有测试；但**没有用 VoiceOver 或 NVDA 实际听过一遍**，不能声称屏幕阅读器体验良好。
- 对比度未用工具逐一测量，仅目视。

## 5. 当前已知问题

**功能性限制**（设计取舍，非缺陷，均在 About 页与 README 列明）：

1. 影响分按规则类别取常量，不随页面流量加权（未发布商品会降权 2 分）。零流量页与高流量页的同类问题目前同分。
2. 任务只有 Open / Done，没有"忽略/不适用"。
3. Recommendations 历史区信息少——来源问题消失后，原始标题与证据无从恢复（它们本就不持久化）。
4. 归因 last-touch 单渠道；营收不含税运费且完全不建模退款。
5. 自然渠道 CAC 为 $0.00 是因为没给它摊成本。

**环境与流程限制**：

6. E2E 仅 Chromium；屏幕阅读器与 Lighthouse 未实测（见上）。
7. `docs/screenshots/` 约 6.9 MB。Recommendations 一页 full-page 截图原本 5.2 MB（130 条任务），已改为视口截图；其余保持 full-page。
8. 性能数值来自本机 loopback，无网络延迟与真实设备，绝对值不可外推。
9. 上游兼容（不变）：TypeScript 固定 6.0.3（typescript-eslint 尚不支持 7.0）；ESLint 需显式声明 React 版本；`unrs-resolver` 的 postinstall 被拦截。
10. `docs/reports/dispatch-00.md`–`07.md` 中的部分数值是当时数据集下的结果，数据集在 Dispatch 6/8 调整过。本报告与 Dispatch 8 的数值是当前值；早期报告保留原样作为过程记录，**未回改**——回改会把"当时确实测到这个数"变成事后修饰。

**未提交的动作**：未配置远程、未 push、未部署。阶段完成不等于获得发布授权。

除上述条目外，**无已知阻塞缺陷**。

## 6. 下一步建议

**Dispatch 0–9 全部完成，MVP 已完成。** 不自动开始任何新功能，也不部署。

**可以直接演示的路径**（5 分钟，应用内 About 页与 README 各有一份）：Dashboard 口径表 → Products 编辑某 SKU 并刷新 → SEO 重新审计并走一条失败检查 → GEO readiness 三档 → Analytics 渠道表 → Funnel 最大流失 → Recommendations 标记完成并刷新。

**后续候选事项**（按我判断的性价比排序，均需你确认后才动）：

| 优先级 | 事项 | 理由 |
|---|---|---|
| 高 | Firefox / WebKit E2E + 屏幕阅读器实测 | 现在无法诚实声称跨浏览器与无障碍可用 |
| 高 | 按商品级流量为影响分加权 | 当前最明显的模型弱点：零流量页与高流量页同分 |
| 中 | 任务增加"忽略/不适用"与理由 | 实际使用中最常缺的状态 |
| 中 | 退款与毛利建模 | 让 CAC / ROAS 对得上真实盈亏 |
| 中 | 部署到 Vercel 并在 README 放演示链接 | 作品集需要一个能点开的链接；**需你明确授权** |
| 低 | 多触点归因，与 last-touch 并排对比 | 展示价值高但工作量大 |
| 低 | Prisma + PostgreSQL 适配器 | 服务合同已就位，主要是证明可替换性 |

**另外，有一个从 Dispatch 0 起一直没答复的问题会影响作品集的包装方式**：你的求职目标是独立站/DTC 运营、亚马逊运营，还是两者都投？本项目现在完全是独立站口径（渠道、漏斗、GEO 都按独立站建模）。如果也投亚马逊，需要的是另一套叙述（甚至可能是另一个模块），而不是把现有内容改个说法。

## 7. 状态

本阶段全部门禁通过，**Dispatch 9 完成**。Dispatch 0–9 全部完成，**MVP 完成**。

已停止，等待用户确认。
