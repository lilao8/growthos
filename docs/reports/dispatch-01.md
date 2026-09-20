# Dispatch 1 — PASS

执行日期：2026-09-20　｜　环境：macOS (darwin 25.6.0)、Node v24.18.0、npm 11.16.0

## 1. 本次完成内容

对照 `docs/01-dashboard.md` 的范围与验收标准逐条说明。

**应用外壳。** Layout / Sidebar / Header / 导航完成。桌面（≥1024px）左侧固定侧边栏；小于该宽度折叠为 Header 上的 Menu 披露面板，带 `aria-expanded`、`aria-controls`，Escape 关闭，点击链接后自动收起。Skip link 是键盘第一个焦点目标。

**基础组件。** Card / CardHeader / CardBody、Table 全套原语（含横向滚动容器与 `<caption>`）、MetricCard、PageHeader、LoadingBlock / EmptyBlock / ErrorBlock、ModulePlaceholder。颜色、排版、间距统一走 `globals.css` 的 CSS 变量。

**路由。** 8 条模块路由全部可访问；`/` 重定向到 `/dashboard`。7 个未实现模块渲染占位页，写明计划阶段，不做假界面。

**Dashboard 六项指标。** Sessions、Revenue、Orders、Conversion Rate、AOV、Organic Traffic。E2E 断言页面上恰好 6 张指标卡，防止后续阶段的指标提前混入。

**Summary service 与可复现 repository。** `summarizeDashboard` 是纯函数，注入 sessions / orders / window；`dashboard-service` 负责加载与状态分类；`traffic-repository` 提供 fixture / empty / failing / delayed / flaky 五个适配器。**指标全部由 fixture 聚合得出，JSX 中没有任何硬编码数字。**

**loading / empty / error / retry。** 通过 `?demo=` QA 接缝可在浏览器与 E2E 中真实触发：`empty`、`error`、`slow`、`flaky`。取值是封闭白名单，未知值回落真实 fixture，界面不提供任何入口链接。

**验收标准对照：**

| 验收项 | 落实方式 |
|---|---|
| 六个指标与 fixture 和公式一致 | 集成测试断言 `conversionRate === orders/sessions`、`AOV === revenue/orders`；E2E 断言 organic ≤ sessions、orders ≤ sessions |
| 零分母、空数据、异常有正确显示 | 空数据走 empty 态而非显示 0；零分母返回 null → 显示 N/A；异常走 error 态 + retry |
| 所有导航可访问且当前项有状态 | 8 条路由 E2E 逐条访问断言 200；当前项 `aria-current="page"` |
| 键盘能操作菜单 | E2E：Tab 到 skip link、focus 导航链接按 Enter 跳转、Menu 按钮 Enter 展开、Escape 收起 |
| 375 / 768 / 1440px 无页面级横向溢出 | 三个宽度各一条 E2E，断言 `scrollWidth - clientWidth <= 0` |
| unit 验证聚合与零分母 | `dashboard-summary.test.ts` 7 例 |
| integration 验证数据层与状态传播 | `dashboard-service.test.ts` 10 例 |
| E2E 验证主页、导航、错误重试 | 21 条 E2E |

## 2. 修改的核心文件

**新增 — 领域层（纯函数）**

| 文件 | 目的 |
|---|---|
| `src/domain/dashboard-summary.ts` | 六项指标的唯一聚合实现，注入时间窗口 |
| `src/domain/format.ts` | 展示层格式化；null → `N/A` 的判断只此一处 |

**新增 — 数据层**

| 文件 | 目的 |
|---|---|
| `src/fixtures/demo-traffic.ts` | 确定性会话 / 订单 / 订单行生成器（阶段性，Dispatch 6 扩展） |
| `src/repositories/traffic-repository.ts` | 只读流量数据合同 + 五个适配器 |
| `src/services/dashboard-service.ts` | 加载 → 聚合 → 状态分类 |
| `src/services/demo-data-source.ts` | `?demo=` QA 接缝，封闭白名单 |

**新增 — UI**

`src/components/layout/app-shell.tsx`（外壳与导航）、`src/components/layout/nav-items.ts`（导航唯一真相源）、`src/components/ui/{card,table,metric-card,status-block,page-header}.tsx`、`src/components/module-placeholder.tsx`、`src/components/dashboard/dashboard-view.tsx`。

**修改**

| 文件 | 修改目的 |
|---|---|
| `src/app/layout.tsx` | 套上 AppShell |
| `src/app/page.tsx` | 启动页改为重定向到 `/dashboard` |
| `package.json` | `typecheck` 改为 `next typegen && tsc --noEmit`（见已知问题 3） |
| `src/app/{dashboard,products,seo,geo,content,analytics,funnel,recommendations}/page.tsx` | 新增 8 个路由页 |

**测试**：新增 `tests/unit/{dashboard-summary,format}.test.ts`、`tests/integration/{dashboard-service,demo-traffic}.test.ts`；`e2e/start-page.spec.ts` 被 `e2e/{dashboard,navigation}.spec.ts` 取代（启动页已不存在，原断言全部迁移并扩展）。

## 3. 测试结果

`rm -rf node_modules .next` 后按顺序一次跑通，整体退出码 0。完整日志：scratchpad 的 `gates-d1.log`。

| 命令 | 结果 | 实际数量 | 相比 Dispatch 0 |
|---|---|---|---|
| `npm ci` | PASS | 428 packages | — |
| `npm run lint` | PASS | 0 problems | — |
| `npm run typecheck` | PASS | 无输出 | — |
| `npm run test -- --run` | PASS | **7 文件 / 60 通过，0 失败 0 跳过** | +13 |
| `npm run test:integration -- --run` | PASS | **4 文件 / 57 通过，0 失败 0 跳过** | +30 |
| `npm run test:e2e` | PASS | **21 通过，0 失败 0 跳过** | +17 |
| `npm run build` | PASS | 10 条路由，`/dashboard` 动态、其余静态预渲染 | — |

**过程中真实失败过两次，均已修复后重跑：**

1. `react-hooks/set-state-in-effect` 报 2 个 error：`app-shell` 在 effect 里同步 `setMenuOpen`，`dashboard-view` 在 effect 里同步 `setState(null)`。**未关闭规则**，改为：外壳去掉该 effect 改由链接点击回调关闭；Dashboard 拆出 `DashboardLoader` 并用 `key={attempt}` 重挂载来重置加载态。
2. E2E 断言指标卡数量失败（期望 6 实得 12）——是我自己的选择器缺陷，`metric-x` 前缀同时匹配到了 `metric-x-value`。给卡片加 `data-metric-card` 属性后修正，**不是放宽断言**。

**本阶段新增断言要点：**

- 聚合：窗口边界（前一天排除、首尾日包含）、重复 sessionId 去重、有会话无购买时转化率为真 0 而 AOV 仍为 N/A。
- Fixture 完整性（24 例）：每条会话通过 schema、阶段为有序前缀、漏斗各层单调不增、覆盖全部 90 天、用户数 < 会话数、购买会话与订单一一对应、**订单收入等于订单行金额之和**、折扣不为负且不超过行金额、只卖 active 商品、回头客第二单不再标新客、渠道会话数之和等于全站总数、AI source 标签只出现在 AI Referral 渠道。
- 状态传播：ready / empty / error 三态；flaky 源第一次失败第二次成功，证明 retry 真的重新取数；未知 `?demo=` 值回落真实 fixture。

## 4. 验收证据

**浏览器人工核对**（生产构建 + `next start`，三个宽度实测）：

| 宽度 | 观察结果 |
|---|---|
| 1440px | 左侧栏固定，Dashboard 当前项高亮；6 张卡片三列；指标定义表格完整；无横向溢出 |
| 768px | 侧栏收起为 Menu 按钮，卡片两列，页面正常 |
| 375px | 卡片单列堆叠；点 Menu 展开 8 条导航，Dashboard 项高亮；无横向溢出 |

**数据核对（页面实测值）：** Sessions 2,804、Revenue $39,033.40、Orders 105、Conversion Rate 3.74%、AOV $371.75、Organic Traffic 950。

手工验算：105 ÷ 2804 = 3.745% ✓ 与显示一致；$39,033.40 ÷ 105 = $371.75 ✓；950 ÷ 2804 = 33.9%，与 Organic Search 渠道 34% 的权重一致 ✓。

**状态核对：** `?demo=error` 显示「Could not load dashboard data / Demo data source is unavailable.」与 Retry 按钮，无指标卡；`?demo=empty`、`?demo=slow`、`?demo=flaky` 行为符合预期（E2E 已实测）。`/products` 占位页显示「Not implemented yet — planned for Dispatch 2.」。

**未运行：** 截图未落盘（`docs/screenshots/` 属 Dispatch 9）；Firefox / WebKit 未跑（仅配 chromium）；未做屏幕阅读器实测，可访问性仅验证到语义标记、`aria-*` 属性与键盘操作层面；未做性能测量（Dispatch 9 范围）。

## 5. 当前已知问题

**必要偏离与原因：**

1. **`?demo=` QA 接缝。** loading / empty / error 是验收项，但本地 fixture 永远成功，这些状态无法自然发生。用 query 参数切换适配器，是为了让状态可被真实触发而不是造假界面。取值为封闭白名单、未知值回落真实数据、界面无任何入口。属于测试接缝，不是产品功能。
2. **流量 fixture 是阶段性的。** 当前 2,804 条会话、105 笔订单来自种子生成器，只为让六项指标有真实来源。渠道花费、AI Referral 明细、CAC / ROAS 所需数据要到 Dispatch 6 才建，届时 Dashboard 按计划切换到统一数据源。代码注释已标注。
3. **`typecheck` 脚本改为 `next typegen && tsc --noEmit`。** 开启 typedRoutes 后路由类型由构建产物生成，全新检出（无 `.next`）直接跑 `tsc` 会因 `Route` 类型缺失而报 9 个错。加 typegen 后已验证在 `rm -rf .next` 状态下通过。**这是 Dispatch 0 遗留的隐患，本阶段才暴露并修复**，Dispatch 0 报告中的 typecheck 结果是在有 `.next` 的状态下取得的。
4. **768px 仍使用折叠菜单。** 侧边栏断点设在 1024px（Tailwind `lg`），因此平板竖屏走 Menu 面板而非固定侧栏。布局正常、无溢出，但如果希望平板也显示侧栏，需要把断点下调到 `md`。这是取舍，不是缺陷。
5. **演示转化率 3.74% 偏高。** 真实 DTC 独立站通常在 1.5–3%。当前值落在集成测试设定的 0.5%–8% 合理区间内，属于「小众高客单品牌」可解释范围，但 Dispatch 6 重建完整数据集时建议下调到 2.5% 附近，更贴近行业基准。

**未变更的上游兼容问题**（详见 Dispatch 0 报告）：TypeScript 固定 6.0.3；ESLint 配置显式声明 React 版本；`unrs-resolver` postinstall 被拦截但不影响 lint。

**未提交的动作：** 未配置远程、未 push、未部署。

除上述条目外，**无已知阻塞问题**。

## 6. 下一 Dispatch 建议

Dispatch 2：商品中心（`docs/02-products.md`）。把 fixture 从 3 个 SKU 扩展到 15+ 个有合理价格 / 成本 / 库存 / 关键词关系的户外商品，建商品列表（搜索、品类与状态联合筛选、清除条件）、商品详情与 SEO 元数据编辑表单，编辑跨刷新持久化并同步 PageSnapshot。评分此时仍显示 null / Not audited。

需要注意：本阶段的流量 fixture 目前只引用 active 商品，SKU 扩展后需同步调整订单行生成逻辑，否则商品级营收会集中在原来的两个 SKU 上。

仅为建议，等待用户确认。

## 7. 状态

本阶段全部门禁通过，**Dispatch 1 完成**。

已停止，等待用户确认下一 Dispatch。
