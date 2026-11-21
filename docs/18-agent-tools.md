# Dispatch 18：运营 Agent · 只读工具层与可复现证据链接

> 运营 Agent 第一阶段分三段：**18 工具层与证据链接（本文件）**、19 编排循环 / 替身模型 / API / UI、20 接入 OpenAI、真实试跑与回放。
> 本阶段不接任何模型，不新增路由页面，不写入任何状态。

## 目标

为「过去 30 天，独立站最该优先排查什么？」准备 Agent 可调用的四个只读工具，以及让工具给出的每个关键数字都能通过链接在现有页面上复现。

## 前置条件

用户已确认的决定（2026-11-21）：

| # | 决定 |
|---|---|
| D1 | 模型供应商 OpenAI（Dispatch 20 接入，本阶段不涉及） |
| D2 | 实时版的审计数据来自**调用方提供的浏览器本地状态**（`DemoState`，经 `demoStateSchema` 校验）；未审计或 stale 的页面在服务端用该快照现场运行引擎，不写回；回放冻结录制时数据（Dispatch 20） |
| D3 | 改造现有 Analytics / Funnel / 商品详情页，范围与渠道由 URL 参数驱动 |
| D4 | 样本门槛沿用 `ANALYTICS_THRESHOLDS`、`LOW_VOLUME_ORDER_THRESHOLD`、漏斗配置，不另立口径 |
| D5 | 工具调用上限 8 次、单工具 5 秒、整轮 60 秒（Dispatch 19 实现） |
| D6 | 回答跟随提问语言；界面英文 |
| D7 | 规则改为「仅 Agent 层可调用一个经授权的模型端点」 |
| D8 | 不扩大 `?demo=` 白名单；数据不足路径用注入数据测试 |
| D9 | 分 18 / 19 / 20 三段，每段停下等确认 |

## 关键设计判断

1. **不新写指标公式。** 渠道、漏斗、商品、审计全部调用现有 domain 函数。新增的只有：渠道过滤、可比前一期窗口、两期比较、证据充分度与 Agent 排序、证据链接构造。
2. **渠道漏斗与全站漏斗同口径。** 先按 `channel` 过滤会话，再调用同一个 `buildFunnel`。会话只有一个归因渠道，所以各渠道首层之和等于全站首层，有测试断言。
3. **没有 SKU 漏斗。** 加购与结账是会话级事件，没有归到商品；`get_funnel` 收到 SKU 参数直接拒绝，返回结构化的 `unsupported`，并指向商品转化指标。
4. **前一期必须完整落在数据覆盖范围内。** 30 天的前一期为 2026-07-03 — 2026-08-01；90 天没有前一期，返回 `gap: 'no-prior-window'`，任何「下滑」说法都不能成立。
5. **排序 = 现有规则优先级 + 证据充分度 + 受影响样本。** 规则严重度直接取现有 Recommendation 引擎的 `priority`；证据有限（订单或会话低于现有门槛）降一档；同档内按受影响会话数降序，再按稳定 ID。版本 `agent-priority-1.0.0`。
6. **每个数字有 `refId`。** 工具结果里的关键数字以 `{ refId, label, value, unit, definition }` 形式给出，Dispatch 19 的回答校验只认这些 ref。
7. **证据链接与页面使用同一个参数解析器。** 链接构造函数与页面读取 URL 用同一套解析，链接打开后页面计算的就是同一个窗口、同一个渠道。

## 范围

- `src/domain/agent/`：`windows.ts`、`comparison.ts`、`evidence.ts`（证据充分度与排序）、`links.ts`、`refs.ts`、`types.ts`。
- `src/domain/analytics/session-filters.ts`：按渠道过滤会话与订单。
- `src/services/agent-tools/`：四个工具与注册表，zod 校验输入，类型上只允许只读工具。
- 页面：`/analytics?range=&end=`、`/funnel?range=&channel=&end=`（新增渠道筛选）、`/products/[id]?range=&channel=`；切换时用 `history.replaceState` 同步 URL，保留其他参数（含 `demo`）。`end` 用于打开前一期的数字，只在整个窗口落在数据内时接受；商品页的 `channel` 用于打开按渠道过滤的商品数字。这两个参数是实现时为「链接能复现每个数字」补上的，原计划只写了 `range` 和 Funnel 的 `channel`。
- 测试：unit（新 domain）、integration（工具 + fixture + 校验 + 只读）、e2e（证据链接复现数字）。

## 复核后补充

- SEO/GEO 审计页支持 `?preview=1` 只读预览，审计证据链接带这个参数，点开即可核对引用的检查，不写存储。
- 低于漏斗步骤自身 `minimumSessions` 的发现只作为数据缺口返回（附原始数字引用），不进入排序。
- 比较结果带比较双方的 refId；CAC 发现引用全站 AOV，ROAS 发现引用广告花费；商品页显示购买会话数。
- 工具入参拒绝未知字段。

## 明确不做

- 不接模型，不新增 `/agent` 页面或 API 路由。
- 不改任何指标公式、审计规则、`DemoState` schema。
- 不改 Recommendations 页的链接与 90 天窗口。

## 验收标准

- 四个工具对正常 fixture、空数据、失败仓库、查不到的 SKU、SKU 漏斗请求、损坏的本地状态都返回结构化结果，不抛未处理异常。
- 渠道漏斗与全站漏斗同口径：各渠道 session 层之和 = 全站；渠道 session 层 = 渠道表 sessions；purchase 层 = orders。
- 30 天前一期窗口正确；90 天返回缺口。
- 审计工具：已存且未 stale 的审计原样使用；未审计页面现场计算，结果等于该页点 Run audit 的结果；状态对象执行前后深度相等。
- 工具给出的证据链接在浏览器打开后，页面显示同一个数字（E2E）。
- 六项门禁全部通过；新增 domain 文件用 Stryker 单文件验证。
