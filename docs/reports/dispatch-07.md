# Dispatch 7 — PASS

执行日期：2026-09-20　｜　环境：macOS (darwin 25.6.0)、Node v24.18.0、npm 11.16.0

## 1. 本次完成内容

对照 `docs/07-funnel.md` 的范围与验收标准逐条说明。

**五层漏斗，每层都是去重会话数。** 界面上每处标签都写 sessions，并有专门一段说明「不是页面浏览次数，也不是人数」。使用与 Analytics 相同的时间范围和同一批 SessionFact。

**非法序列明确报告，不静默截断。** `validateStageSequence` 要求阶段是 `FUNNEL_STAGES` 的有序前缀且无重复。不合格的会话**从所有层中剔除并计数上报**——如果把 `['session','checkout','product_view']` 悄悄截断成 `['session']`，它仍会计入第一层，等于虚增上层。有专门测试锁定这一点。

**最大流失按比例选取。** 平局取最早阶段（修早期的漏也会喂到下游）；上层为 0 的相邻对不可比较、不参与；全部不流失时返回 null 而不是随便挑第一行。

**建议引擎按阶段映射**，每段有自己的检查项：

| 阶段 | 检查项 |
|---|---|
| Sessions → Product View | 落地页相关性、导航清晰度、页面性能 |
| Product View → Add to Cart | 价格定位、价值表达、评论、CTA、图片、配送信息 |
| Add to Cart → Checkout | 购物车可见性、加购后才出现的费用、购物车留存 |
| Checkout → Purchase | 运费、支付方式、流程复杂度、信任信号、配送时间 |

**建议是假设不是诊断。** 每条措辞都用 "may"，配一条"如何验证"；页面顶部有醒目声明：漏斗只能说明在哪里流失，不能说明为什么，把其中任何一条当成已证实的原因就是把相关性当因果。单元测试断言每条 hypothesis 都含 "may"。

**阈值可配置 + 显示样本量 + 小样本标记。** 阈值和最小样本量都在 `DEFAULT_FUNNEL_CONFIG` 中；每条建议显示它所依据的会话数；样本低于该阶段的最小值时标 `Low confidence` 并加一句"这是提示去看，不是结论"。

**Dashboard 补齐**：Add-to-cart Rate、Checkout Rate（共 11 项指标）、Conversion Alerts 区块、跳转漏斗的链接。集成测试断言 Dashboard 的两项比率与漏斗页面同源。

**验收标准对照：**

| 验收项 | 落实方式 |
|---|---|
| unit 覆盖正常/全零/某层为零/无流失/平局/后层大于前层/重复事件/非法顺序 | `funnel-metrics.test.ts` 24 例全部覆盖 |
| recommendation tests 覆盖各段映射、阈值、小样本和无有效阶段 | `funnel-recommendations.test.ts` 22 例 |
| Funnel sessions/purchases 与 Analytics 同期一致 | 集成断言三个范围逐一相等；E2E 跨页面比对 |
| 总转化率和各段计算可手动复核 | 报告第 4 节逐行验算 |
| integration 验证过滤与有序会话处理 | 14 例集成测试 |
| E2E 验证流失高亮和建议导航 | 17 条 E2E |

## 2. 修改的核心文件

**新增**

| 文件 | 目的 |
|---|---|
| `src/domain/funnel/funnel-metrics.ts` | 阶段序列校验、五层计数、阶段转化与流失、最大流失选取 |
| `src/domain/funnel/recommendations.ts` | 阈值配置、按阶段的检查项映射、建议生成 |
| `src/services/funnel-service.ts` | 复用 Analytics 的范围与窗口 |
| `src/components/funnel/funnel-view.tsx` | 漏斗页面 |

**修改**

| 文件 | 修改目的 |
|---|---|
| `src/services/dashboard-service.ts` | 从同一批会话构建漏斗，补 addToCartRate / checkoutRate / alerts |
| `src/components/dashboard/dashboard-view.tsx` | 11 项指标 + Conversion Alerts 区块 |
| `src/components/layout/nav-items.ts` | Funnel 标记为已实现 |

## 3. 测试结果

`rm -rf node_modules .next` 后逐条捕获退出码：

| 命令 | 结果 | 实际数量 | 相比 Dispatch 6 |
|---|---|---|---|
| `npm ci` | PASS | 428 packages | — |
| `npm run lint` | PASS | 0 problems | — |
| `npm run typecheck` | PASS | 无输出 | — |
| `npm run test -- --run` | PASS | **18 文件 / 318 通过，0 失败 0 跳过** | +47 |
| `npm run test:integration -- --run` | PASS | **11 文件 / 200 通过，0 失败 0 跳过** | +15 |
| `npm run test:e2e` | PASS | **128 通过，0 失败 0 跳过** | +17 |
| `npm run build` | PASS | 18 条路由 | — |
| `OVERALL` | **fail=0** | — | — |

**过程中真实失败 4 次：**

1. 单元测试里我构造的样本实际产生了 80% 的并列流失，引擎按"平局取最早"返回 `add_to_cart` 是**正确的**。重构样本让 `checkout→purchase` 成为唯一最大（95% vs 50%），并顺带验证了"比例优先于人数"。
2. **集成测试暴露了一个真实的设计缺陷** —— 见已知问题 1。
3. 上述缺陷修好后，一条旧集成断言（"只为低于阈值的步骤给建议"）已不成立，改为按两种触发原因分别断言。
4. E2E 的数字解析函数把 `"729 (100.0%)"` 拼成了 `729100`。改成只取第一个数字；原写法在"单调不减"的断言里是靠巧合通过的，同样脆弱。

## 4. 验收证据

**浏览器人工核对**（生产构建 + `next start`，1440px）：

漏斗五层实测：**8,748 → 5,170 → 1,483 → 613 → 223**

**逐行手工验算（读屏幕数字）：**

| 步骤 | 界面显示 | 手工验算 |
|---|---|---|
| Sessions → Product View | 59.10% / 流失 40.90% / 丢 3,578 | 5,170 ÷ 8,748 = 59.098% ✓；8,748 − 5,170 = 3,578 ✓ |
| Product View → Add to Cart | 28.68% / 流失 71.32% / 丢 3,687 | 1,483 ÷ 5,170 = 28.685% ✓；5,170 − 1,483 = 3,687 ✓ |
| Add to Cart → Checkout | 41.34% / 流失 58.66% / 丢 870 | 613 ÷ 1,483 = 41.335% ✓；1,483 − 613 = 870 ✓ |
| Checkout → Purchase | 36.38% / 流失 63.62% / 丢 390 | 223 ÷ 613 = 36.378% ✓；613 − 223 = 390 ✓ |
| 总体转化 | 2.55% | 223 ÷ 8,748 = 2.549% ✓ |

各层占比：59.1% / 17.0% / 7.0% / 2.5%，与 5170、1483、613、223 除以 8,748 一致 ✓。

**最大流失实测：** Product View → Add to Cart，71.32%，3,687 个会话。横幅写明"按流失比例选取而非人数；平局取更早阶段"。表格中该行带 `Largest drop-off` 标记。

**建议实测：** 共 11 条——6 条属于 Product View → Add to Cart（因其为最大流失），5 条属于 Checkout → Purchase（因其 36.38% 低于 45% 阈值）。每条都标明触发原因、所依据的会话数、如何验证。

**Dashboard 实测：** Add-to-cart Rate 16.95%（1,483 ÷ 8,748 = 16.953% ✓）、Checkout Rate 7.01%（613 ÷ 8,748 = 7.007% ✓）；Conversion Alerts 列出两个步骤并分别说明原因。

**未运行：** 截图未落盘（Dispatch 9 范围）；Firefox / WebKit 未跑；未做屏幕阅读器实测；768px 未人工查看。

## 5. 当前已知问题

**本阶段发现并修复的设计缺陷：**

1. **最大流失的步骤原本可能完全没有建议。** 90 天数据里最大流失是 Product View → Add to Cart（丢 71.32%、3,687 个会话），但它的转化率 28.68% **高于**阈值 20%，于是引擎一条建议都不给；建议全落在 Checkout → Purchase 上。结果就是：页面顶部高亮"这里流失最多"，下面的建议却在讲另一个步骤。
   这不是数据问题——商品页到加购丢掉 70% 在任何电商里都是常态。但规格要求"生成针对流失位置的局部建议"，最大流失位置没有建议是违背本意的。
   **改法：** 一个步骤满足以下任一条件即产生建议——低于阈值，或是最大流失。每条建议带 `raisedBecause` 标明是哪一种，界面分别用不同措辞解释。这样同时回答了两个不同的问题："哪一步不达预期"和"哪一步丢的人最多"。
2. **Dashboard 的告警措辞一度会误导。** 最初写成"converts at 28.68% against a 20.00% threshold"，读起来像是不达标。改为按原因分别措辞，最大流失那条明确写"这是关于流量去向，不是不达标"。

**必要偏离与原因：**

3. **非法序列的会话被完全排除，而不是修复后计入。** 这是刻意的：截断后它仍会计入第一层，等于虚增。界面会报告被排除的数量和原因。演示数据中为 0 条（生成器保证有序），但代码路径有测试覆盖。
4. **漏斗阈值是项目自定的粗略预期，没有外部依据。** 电商各品类差异极大，不存在可通用的公开基准。阈值集中在 `DEFAULT_FUNNEL_CONFIG`，界面写明这一点。**面试时必须照实说这是自己拍的。**
5. **一个会话最多一笔订单**（MVP 约束），所以"购买会话数"等于"订单数"，漏斗底层与 Analytics 的订单数是同一个值。真实电商中一次会话可能下多单。
6. **Top Landing Pages / Top Products 仍在 Analytics**，Dashboard 通过链接跳转（Dispatch 6 已记录的取舍）。
7. **本阶段没有改动演示数据**，因此 Dispatch 6 报告中的数字仍然有效。

**上游兼容问题**（不变）：TypeScript 固定 6.0.3；ESLint 显式声明 React 版本；`unrs-resolver` postinstall 被拦截。

**未提交的动作：** 未配置远程、未 push、未部署。

除上述条目外，**无已知阻塞问题**。

## 6. 下一 Dispatch 建议

Dispatch 8：统一 Recommendations（`docs/08-recommendations.md`）。聚合 SEO、GEO、Content、Analytics、Funnel 五个来源，复用已有引擎不复制公式，形成可排序、可完成的任务中心。

需要注意的几点：

- **稳定任务标识**：`id = hash(ruleId + sourceEntityId)`，重复生成不得重复建任务；完成状态独立持久化；来源问题消失后不再列为 active 但保留历史状态；证据变化而标识不变时展示最新证据并保留既有完成状态。
- **Impact / Effort 为 1–5 档**，象限映射：高影响(≥4)+低工作量(≤2)=Quick Wins，高影响高工作量=Strategic，低影响低工作量=Low Priority，低影响高工作量=Defer。不是收益保证。
- Analytics 的"流量高转化低"等规则阈值、最低样本量、优先级映射要写入配置——本阶段的 `DEFAULT_FUNNEL_CONFIG` 和 Dispatch 6 的 `LOW_VOLUME_ORDER_THRESHOLD` 是同类先例，可沿用同一套做法。
- 现有可直接复用的来源：SEO 的 `SeoIssue`、GEO 的 `GeoRecommendation`、Funnel 的 `FunnelRecommendation`（均已带 ruleId / 证据 / 版本号），Content 的机会分排序，Analytics 的渠道行与低样本标记。
- `DemoState` 需要新增完成状态存储，schemaVersion 要升到 5。

仅为建议，等待用户确认。

## 7. 状态

本阶段全部门禁通过，**Dispatch 7 完成**。

已停止，等待用户确认下一 Dispatch。
