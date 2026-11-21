# Dispatch 19：运营 Agent · 编排循环、回答校验、API 与 `/agent` 界面

> 运营 Agent 第一阶段的第二段。前置：Dispatch 18（四个只读工具与证据链接，`d719149`，Codex 复核通过）。
> 本阶段**不接真实模型**：测试与本地演示都用可控的替身模型（scripted）。OpenAI、真实试跑与回放在 Dispatch 20。

## 目标

「过去 30 天，独立站最该优先排查什么？」在本地 `/agent` 走完整条链路：模型选工具 → GrowthOS 校验并执行 → 模型组织回答 → GrowthOS 校验回答、排序、渲染证据。追问沿用范围，新对话恢复默认。

## 关键设计判断

1. **模型只选工具和组织语言；数字由 GrowthOS 渲染。** 回答里的数字用占位符 `{{ref:<refId>}}` 引用工具结果，由 GrowthOS 按口径格式化；两期变化用 `{{change:<currentRefId>}}`。正文出现未被占位的数字视为违规（日期、窗口天数、SKU 等白名单除外）。
2. **回答必须基于工具发现。** 每条优先发现以 `basedOn` 指向本轮某个工具发现的 id；排序由 `rankFindings`（`agent-priority-1.0.0`）决定，模型不能调整顺序。`limited` 的发现在界面显示样本量。
3. **「上升 / 下降」必须有支持结论的比较。** 正文出现变化类措辞（中英文词表）时，同一条发现必须含 `{{change:…}}`，且对应比较 `evidence.supportsConclusion === true`；否则校验失败。
4. **全站漏斗不能代表渠道或 SKU。** 发现声明的 `scope.channel` 非空时，不得引用 `channel = all` 的漏斗数字；声明了 `scope.productId` 时不得引用任何漏斗数字。
5. **分析范围是对话状态，由 GrowthOS 持有规则。** `ConversationScope { range, channel, products }`，默认 `30 天 / 全渠道 / 全商品`。模型用元工具 `set_analysis_scope` 声明用户改变的条件，GrowthOS 校验后合并；数据工具调用中**省略**的 range/channel 从当前范围注入。追问「只看自然搜索呢？」只改 channel，range 保持。范围随对话由客户端回传，新对话恢复默认。
6. **校验失败先修一次，再降级。** 回答不合格时把问题清单发回模型修一次；仍不合格则返回由 GrowthOS 按排序直接生成的「工具结果摘要」，明确标注为降级。
7. **只读。** 只注册 4 个数据工具与 1 个范围元工具；模型调用任何其他工具名都得到 `unknown-tool`，回答只能说明只读。
8. **限制。** 单次请求工具调用上限 8 次、单工具 5 秒、整轮 60 秒（D5）。超限时停止调用工具，基于已有结果作答或降级，并说明未完成的部分。
9. **实时开关。** `/api/agent` 只在 `AGENT_LIVE_ENABLED=true` 时工作，否则 503；模型来源由 `AGENT_MODEL_PROVIDER` 决定，本阶段只实现 `scripted`（E2E 与本地演示用），`openai` 在 Dispatch 20 接入，未接入时返回 503 `model-not-configured`。
10. **浏览器本地状态（D2）。** 客户端随请求提交本地 `DemoState`，服务端用 `parseLocalState` 校验（256 KB 上限），失败直接报错，不调用模型。

## 范围

- `src/domain/agent/scope.ts`、`answer.ts`（回答 schema、占位符渲染、校验、降级摘要）。
- `src/services/agent/`：`model.ts`（`ModelClient` 接口与消息类型）、`scope-tool.ts`、`orchestrator.ts`（循环、限制、事件）、`prompt.ts`、`scripted-model.ts`（替身模型与演示脚本）、`request.ts`（API 请求体校验）。
- `src/app/api/agent/route.ts`：NDJSON 流式事件（进度、完成、错误）。
- `src/app/agent/page.tsx` 与 `src/components/agent/`：示例问题、范围与起止日、进度、结论 / 验证建议 / 证据链接、可展开工具记录、追问、新对话；loading / empty / error / retry；live 未开启时的说明。
- 导航加 Agent 入口。

## 明确不做

- 不接 OpenAI，不录制或展示回放（Dispatch 20）。
- 不改工具的计算与 Dispatch 18 的证据契约。
- 不在服务端存对话；不写任何业务数据。

## 验收

| # | 用例 | 层 |
|---|---|---|
| 1 | 主问题：替身模型依次调用工具后作答，回答通过校验；发现顺序等于 `rankFindings`；每个数字由 ref 渲染，证据链接可打开 | unit + integration + e2e |
| 2 | 追问「只看自然搜索呢？」：range 不变、channel 更新、工具重新调用；新对话恢复默认 | unit + integration + e2e |
| 3 | 同一问题：正常数据给出发现；稀疏数据保留已确认部分并列出缺口 | integration |
| 3 | 零样本、查不到的商品、工具失败、写请求（无写工具可调，存储不变） | integration + e2e |
| 4 | 校验：伪造 ref、未占位数字、无支持的「下降」、全站漏斗推断渠道、未知 basedOn 均被拦截；修一次后通过；仍失败则降级 | unit + integration |
| 4 | 限制：超过 8 次调用、工具超时、整轮超时、模型抛错 | integration |
| 5 | live 关闭返回 503；请求体非法、本地状态损坏返回 400 且不调用模型 | integration |
