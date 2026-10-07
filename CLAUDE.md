# GrowthOS Development Rules

## 项目目的与读取顺序

构建可运行、可展示、可解释的 DTC 增长决策作品集：SEO、GEO、Content、Analytics、Funnel、Recommendations。所有功能服务于运营判断，而非堆砌图表。

每阶段开始依次阅读 `README.md`、本文件、`docs/00-architecture.md`、当前 Dispatch、此前阶段报告与相关代码。不要假设代码已按原计划实现。当前用户明确指令优先，其次本规则与当前阶段的具体边界；总 Prompt 仅提供全局目标。发现实质冲突先说明，避免静默扩大范围。

## Dispatch 工作流

1. 只读扫描并说明当前目标、前置条件、修改范围、验收计划。
2. 仅实现已获确认的当前 Dispatch；允许修复阻塞当前阶段的基础问题，并在报告说明。
3. 为核心计算和数据变更写有意义的测试，运行所有质量门禁。
4. 失败先修复再重跑相关测试和最终门禁；禁止删测试、跳过用例或弱化断言凑通过。
5. 测试全部通过后写报告并停止。未经用户明确确认，不得进入下一 Dispatch。
6. 缺环境或外部条件时如实标记 BLOCKED；“未运行”“被跳过”均不等于通过。不得虚构日志或测试结果。

## 工程规则

- TypeScript strict；避免 any；边界输入必须校验。
- UI 只渲染与协调交互，业务规则、计算函数、数据访问层独立；不要在组件中写审计或聚合逻辑。
- 单一指标口径、公共类型和配置；不要复制评分公式。
- 核心计算为 pure function，可注入时间、数据和规则版本。
- 保持最小清晰架构；无必要不增加依赖，不重写已有可用基础。
- 不在页面渲染时随机造数。seed 固定且可重复；金额使用整数分或精确十进制，展示时再格式化。
- 所有页面有 loading / empty / error / retry；写入失败保留表单输入，成功后才显示成功状态。
- 表单可通过键盘操作，标签关联输入，颜色不是唯一状态提示；图表有文本摘要。
- 不覆盖用户修改，不提交凭据，不自动 push、部署或发布；阶段完成不等于获得发布授权。
- MVP 不接真实 API、不爬网站、不做完整商城、支付、登录、多租户或后台自动任务。

## 数据与存储合同

- 演示品牌 NorthTrail Outdoor，市场北美、币种 USD，至少 15 个有合理价格/成本/库存与关键词关系的户外 SKU；明显标记 Demo data。
- 数据源统一，90 天固定日期窗口，以 `demoAsOf` 为结束日；界面展示具体起止日，避免固定 seed 冒充今天的实时数据。7/30/90 天均含结束日，时区 UTC。
- SessionFact 保存 sessionId、userId、日期、channel、source、landingPageId、按顺序发生的漏斗阶段及可选 orderId；MVP 每会话至多一笔订单。Order/OrderItem 保存归因渠道、新客标记、金额及商品分摊；每日渠道花费用独立记录。
- 用户数按 userId 去重；按渠道用户数可能重叠，不能相加当全站用户数。会话仅有一个归因渠道，渠道 sessions/orders/revenue 与全站总计对齐。
- 商品收入按订单行分配，全商品收入之和等于订单收入。商品转化率使用包含该商品购买的会话数 / 该商品访问会话数，明确多商品会话不可直接相加。
- Revenue 定义为已支付订单的商品金额扣折扣，排除税、运费和退款；MVP 不建模退款，界面说明此限制。
- Product 的 seoScore/geoScore/organicSessions/conversionRate/revenue 是派生视图字段，不允许普通表单手工修改。阶段 2 评分为 null/Not audited，阶段 3/4 才由引擎产生。
- PageSnapshot 是审计输入，包含 URL、meta、H1/headings、正文、图片 alt、内链、canonical、robots/indexability、结构化数据及 FAQ/事实/证据字段；数据不全应显示 Unknown，不臆测网站实际状态。
- 产品 SEO 编辑、内容创建/编辑、建议完成状态必须跨刷新保存。默认本地演示适配器：浏览器存储 + schemaVersion，隔离 SSR 读取，校验损坏数据，提供明确的 demo reset；只有用户触发 reset 才清空。替换为数据库时保持服务合同。
- SEO 编辑应同步对应 PageSnapshot；已有审计标记 stale，并提供重新审计；阶段 3/4 以前不实现审计引擎。

## 指标口径

| 指标 | 项目公式 / 约定 |
|---|---|
| Conversion Rate | 购买会话数 / sessions；MVP 一会话最多一单，故与 orders/sessions 一致 |
| AOV | revenue / orders |
| Organic Traffic / Revenue | channel = Organic Search 的 sessions / revenue |
| Add-to-cart Rate | 到达加购的去重会话数 / sessions |
| Checkout Rate | 到达结账的去重会话数 / sessions |
| CAC | acquisitionSpend / newCustomers；独立于订单数 |
| ROAS | paidAttributedRevenue / adSpend；非付费渠道显示 N/A |
| Stage Conversion | 下一阶段会话数 / 上一阶段会话数 |
| Drop-off Rate | 1 − Stage Conversion |
| Overall Funnel Conversion | purchaseSessions / sessions |

分母为 0 或缺数据时返回 null，UI 显示 N/A，不产生 Infinity/NaN；有效分母下零分子显示 0。比率内部用 0–1，展示百分比；ROAS 展示倍数。汇总先加分子分母再计算，禁止直接平均比率。

漏斗全程使用同一批会话，后续阶段必须按序发生；每层去重计数，不能把页面浏览次数、用户人数与会话数混用。最大流失默认按流失比例排序，同时展示流失数；平局按流程先后，不把相关性当因果。

SEO/GEO/Content 分数为 0–100 的内部规则结果。规则配置、权重、缺失处理、四舍五入和版本要可解释、可测试。GEO 不使用 AI API，不声称能测量真实 AI 排名或引用概率。

## 测试脚本合同

以下命令从应用根目录运行。默认 npm；已有其他包管理器则在 Dispatch 0 映射等价命令并同步文档、CI 与报告，只保留一种锁文件。

```bash
npm ci
npm run lint
npm run typecheck
npm run test -- --run
npm run test:integration -- --run
npm run test:e2e
npm run build
```

- `npm ci` 在已有 lockfile 的全新环境验证；初次初始化需先安装依赖并生成 lockfile。
- `lint` 运行项目支持的 lint 工具；`typecheck` 执行 TypeScript 无输出检查。
- `test` 默认约定 Vitest，单次执行，不启用 watch；采用其他测试框架时明确替换 `--run`。
- `test:integration` 检查 service/repository 与数据持久化的真实边界；阶段 0 至少验证配置/适配器边界和固定 fixture 的读写往返。
- `test:e2e` 用 Playwright；配置自动启动测试服务和明确 baseURL。阶段 0 至少验证启动页可访问，不允许空测试套件假装成功。
- 首次安装浏览器使用 `npx playwright install chromium`，所需环境、端口和数据库写入运行说明。
- 每阶段均运行上述 lint、typecheck、unit、integration、e2e、build；E2E 先维护小型关键路径集，阶段 9 扩展完整回归。使用隔离测试存储，禁止清空非测试数据。
- 前四条由 `.githooks/pre-commit` 在每次提交前自动执行（约 6 秒），`npm install` 时经 `prepare` 自动挂载；六条全部由 `.github/workflows/ci.yml` 执行。自动执行不替代阶段末的手工全量运行——报告里的数字必须来自你自己跑出的那一次。确需带着失败提交用 `git commit --no-verify`。
- 分层边界与 seed 确定性由 `eslint.config.mjs` 强制：`domain` 不得 import 任何层，`fixtures` 仅可 import `repositories/types`，`components` 对 `repositories` 仅可 type-only import，`src/**` 禁用 `Math.random` 与 `crypto`。

## 完成报告

保存到 `docs/reports/dispatch-NN.md`，同时向用户汇报：完成内容、核心修改文件、命令与真实结果、验收证据、已知问题、下一阶段建议。报告写明 PASS / FAIL / BLOCKED、实际测试数量与环境。没有实测不能标 PASS。所有门禁通过才写“本阶段完成”；最后明确“已停止，等待确认下一 Dispatch”。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
