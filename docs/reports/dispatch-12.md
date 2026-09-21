# 收尾阶段：跨浏览器与无障碍 — PASS

执行日期：2026-09-21　｜　环境：macOS (darwin 25.6.0)、Node v24.18.0、npm 11.16.0
浏览器：Chromium 1243、Firefox (Playwright 1.63)、WebKit 26.6

> 这不是原计划 Dispatch 0–9 中的一个阶段，是 Dispatch 11 报告里"唯一声称了但没验证"那一项的收尾。

## 0. 先说我做不到的事

**我无法运行 VoiceOver 或 NVDA。** 本阶段交付的是：

- axe-core 自动扫描（WCAG 2.1 A/AA 规则集）
- 无障碍树的人工读取（屏幕阅读器实际走的那棵树）
- 对比度按 WCAG 公式直接计算
- 键盘路径的自动化实测

**这些不等于一次真人配屏幕阅读器的测试。** 自动化规则大约能覆盖真实障碍的三分之一。本项目现在可以说"这些具体的、可检查的属性成立"，**不能说"无障碍体验良好"**。这条限制写进了测试文件头部、About 页和 README。

## 1. 本次完成内容

### 跨浏览器

E2E 从 1 个引擎扩到 **3 个**（Chromium / Firefox / WebKit）。迭代时可 `E2E_BROWSER=firefox` 只跑一个。

首轮 615 条里 **614 条直接通过**——核心逻辑本来就是跨引擎的。唯一那条失败很值得记，见第 3 节。

### 无障碍

引入 **axe-core**，覆盖 16 条路由 + 审计运行后的状态 + 移动端菜单展开 + 错误/空状态。另加 9 条无障碍树结构断言：单一 main 与 h1、导航区有名字、当前页有标记、表格有 caption、图表不是唯一的数据来源、状态区会播报、表单控件都有可访问名称、任务列表纯键盘可操作、筛选器报告 pressed 状态。

## 2. 修复的真实缺陷

**全部 5 类都是产品缺陷，不是测试缺陷。**

| # | 缺陷 | 后果 |
|---|---|---|
| 1 | `BarChart` 把 `role="img"` 放在 `<ul>` 上 | **摧毁列表语义**，`<li>` 不再属于任何列表；同时这个 img 还没有名字 |
| 2 | `TrendChart` 的 `role="img"` 没有可访问名称 | 屏幕阅读器只念一句"图像" |
| 3 | `MetricCard` 在 `<dl>` 项里把 `<p>` 放在 `<dt>/<dd>` 旁边 | 破坏定义列表结构（另有 3 处同样问题） |
| 4 | 横向滚动容器不可聚焦 | **宽表格右侧列对纯键盘用户等于不存在** |
| 5 | `--color-line` 对白底 1.29:1，却用在按钮和输入框边框上 | 违反 WCAG 1.4.11（交互控件边界需 3:1） |

几条值得展开的：

**图表那两条暴露了一个更难堪的事实。** `trend-chart.tsx` 的文件头注释从 Dispatch 6 起就写着 "the drawing is `aria-hidden`"，但代码里**从来没有 `aria-hidden`**——注释描述的是一段没写过的代码，而且没人发现，因为没人测过。现在按注释里那份契约真正实现：折线图 `aria-hidden`（图下方永远有完整数据表 + 文字摘要，图本身不携带独有信息）；条形图**保持为真实列表**，因为它的标签本来就是文本，给它 `role="img"` 反而是倒退。

**对比度这条 axe 抓不到。** axe 的对比度规则只覆盖文本，1.4.11 的非文本对比度不在默认规则集里。是按公式逐对计算 theme token 才发现的。新增 `--color-line-strong`（#7d8798，白底 3.63:1、灰底 3.38:1）**只用于交互控件**（28 处）；装饰性分隔线和卡片边框仍用 `--color-line`，那里 1.4.11 不适用。浏览器实测确认输入框与按钮渲染出的确实是 `rgb(125,135,152)`。

**无障碍树里还有一个 axe 没报的问题。** 读取 `/dashboard` 的树时发现 `main` **内部**还有一个 `banner`——`PageHeader` 用了 `<header>`，在 `<main>` 内被 Chromium 暴露成第二个 banner 地标。axe 的 duplicate-banner 规则只统计顶层 banner，所以静默放过。`<h1>` 已经标识了页面，`<header>` 在这里什么也没买到，改成 `<div>`。同理侧边栏的 `<aside>` 改成 `<div>`：那一列是导航，里面两个 `<nav>` 已经提供了地标，再套一层 `complementary` 等于宣称"导航是补充内容"。

修复后的地标结构（浏览器实测）：skip link → navigation "Main" → navigation "About" → banner（仅应用头部）→ main。**恰好一个 banner、一个 main、两个具名导航。**

## 3. Safari 的 Tab 行为：一条不该用"跳过测试"解决的失败

唯一的跨浏览器失败是 `a skip link is the first thing keyboard focus reaches`，在 WebKit 下 Tab 第一下没有落在 skip link 上。

**这不是应用的缺陷。** Safari 的 "Press Tab to highlight each item on a webpage" 默认关闭，Tab 只在表单控件之间移动，**应用无法设置这个浏览器偏好**。

改法不是加 `test.skip`，而是把断言拆成两半：

- **所有引擎**：skip link 是文档里第一个可聚焦元素，聚焦后按 Enter 跳到 `#main-content` 且 main 可见。
- **仅 Tab 能到达链接的引擎**：额外断言 Tab 路径。

VoiceOver 仍然能到达这个链接，所以 skip link 在 Safari 下依然有用——**不成立的只是"光按 Tab 就能到"这句话**。测试现在说的是真话，而不是沉默。

## 4. 测试结果

`rm -rf node_modules .next` 后逐条捕获退出码：

| 命令 | 结果 | 实际数量 |
|---|---|---|
| `npm ci` | PASS | 429 packages |
| `npm run lint` | PASS | 0 problems |
| `npm run typecheck` | PASS | 无输出 |
| `npm run test -- --run` | PASS | 24 文件 / **481 通过** |
| `npm run test:integration -- --run` | PASS | 15 文件 / **292 通过** |
| `npm run test:e2e` | PASS | **3 引擎 × 233 = 699 通过，0 失败 0 跳过** |
| `npm run build` | PASS | 18 条路由 |
| `OVERALL` | **fail=0** | — |

E2E 从 205（单引擎）增至 699：每个引擎 233 条（原 205 + 新增 28 条无障碍用例），跑三个引擎。

### 过程中真实失败 3 类

1. **上述 5 类产品缺陷**（已修）。
2. **Safari Tab 行为**（断言改为按引擎陈述事实）。
3. **客户端渲染竞态，我又犯了一次。** 新写的表格计数测试只等 `<h1>` 可见——但 `<h1>` 是服务端渲染的，在数据到达之前就可见了。Chromium 下侥幸通过，**WebKit 下计到 0 张表**。统一改成等各路由的 ready 哨兵。**这和 Dispatch 5 的那次是同一类错误**，说明"等一个服务端渲染的元素"这个习惯我还没彻底改掉。

## 5. 修改的核心文件

**新增**：`e2e/accessibility.spec.ts`（28 条，含 16 条按路由的 axe 扫描）。依赖新增 `@axe-core/playwright`——无障碍规则集没有手写替代品，这个依赖是必要的。

顺带修掉一条陈旧文案：Products 页的"How to read this table"从 Dispatch 2 起就写死"SEO 和 GEO 显示 Not audited，引擎将在 Dispatch 3 和 4 到来"。审计跑过之后，这句话**与它正上方的表格直接矛盾**，而且"Dispatch 3 和 4"是项目内部的构建阶段编号，对读者毫无意义。改成按是否已有分数条件呈现。

**修改**：`playwright.config.ts`（三引擎 + `E2E_BROWSER`）、`products/products-view.tsx`（上述文案）、`globals.css`（`--color-line-strong`）、`charts/trend-chart.tsx`、`ui/metric-card.tsx`、`ui/table.tsx`、`ui/page-header.tsx`、`layout/app-shell.tsx`、`dashboard/{seo,geo}-health-view.tsx`、`amazon/listing-advertising-panel.tsx`、28 处交互边框 token、`e2e/{navigation,analytics}.spec.ts`。

## 6. 当前已知问题

1. **仍未做真人屏幕阅读器测试**（见第 0 节）。这是本项目在无障碍方面唯一剩下的、无法用自动化补上的缺口。
2. **axe 只跑了 WCAG A/AA 标签**，best-practice 规则单独探测过一次（无违规）但没进门禁——它包含一些有争议的规则，纳入门禁会带来噪音。
3. **`tabIndex={0}` 给每张宽表加了一个 Tab 停留点。** 这是 1.4.13/2.1.1 的标准做法，但键盘用户的 Tab 路径因此变长。
4. **没有深色模式**，对比度只在浅色主题下验证过。
5. 未验证 200% 缩放与 `prefers-reduced-motion`（项目里唯一的动画是 loading 骨架屏的脉冲）。
6. 上游兼容（不变）：TypeScript 固定 6.0.3；ESLint 显式声明 React 版本。

**未提交的动作**：未配置远程、未 push、未部署。

除上述条目外，**无已知阻塞缺陷**。

## 7. 状态

全部门禁通过。**跨浏览器与无障碍收尾完成。**

至此 Dispatch 0–11 全部完成，截图与文档齐备，三引擎 E2E 全绿。

已停止，等待用户确认下一步。
