# Dispatch 20 — 运营 Agent · OpenAI 接入、输入预算、真实试跑与回放

状态：**PASS**
日期：2026-11-21
分支：`agent/dispatch-18`（本地；`daa13a3` 为第一部分，本报告对应其后的提交；未推送）
范围：见 [docs/20-agent-live-replay.md](../20-agent-live-replay.md)。业务数据仍是演示数据，工具只读；没有部署，也没有推送。

---

## 1. 完成内容

### 1.1 OpenAI 适配器（`src/services/agent/openai-model.ts`）

- 用 `fetch` 调用 Chat Completions，不引入 SDK。消息和工具的格式按 2026-11-21 核对的官方文档映射：
  - 工具定义嵌套在 `function` 下；
  - 工具结果用 `tool_call_id` 回传给模型；
  - `arguments` 保留模型给出的原始字符串；
  - 读回 `usage` 记录 token 用量。
- `AbortSignal` 原样传给网络请求（这是 Codex 提出的可选项，已实现并加了测试）。
- 错误信息只写 HTTP 状态和服务方给出的原因，并用 `redact()` 去掉组织 ID 和任何形似 key 的字符串。
- 遇到可以通过等待解决的 429（每分钟速率限制，余额耗尽的情况除外），按 `retry-after-ms` 或 `retry-after` 指定的时间等待后重试，最多 2 次，单次最多等 20 秒；等待期间如果本轮被取消，立即停止。
- 新增可选配置 `AGENT_REASONING_EFFORT`，只在设置了值时随请求发出（原因见 3.2）。

### 1.2 配置（`live-config.ts`）

- `AGENT_MODEL_PROVIDER=openai` 时，`OPENAI_API_KEY` 和 `AGENT_MODEL` 缺一不可；缺失时返回 503，提示里只写缺了哪个变量名，不写变量值。
- `AGENT_MAX_INPUT_CHARS`、`AGENT_MAX_TOOL_RESULT_CHARS`、`AGENT_TURN_TIMEOUT_MS` 可以覆盖预算和单轮超时，用于每分钟 token 额度较低的账户。不设置时沿用默认值（D5），非正整数会被忽略。

### 1.3 模型输入预算（`orchestrator.ts`）

- 单个工具结果默认上限 24,000 字符。超出时去掉原始数据，只保留发现、发现所引用的数字和审计判定、数据缺口，并标注 `truncated`。如果还是超出，就按排序保留排在最前的发现。
- 每轮输入默认上限 160,000 字符。达到上限后不再执行新的工具调用，并要求模型作答；超过上限的 1.25 倍时降级。

### 1.4 回合记录

每一轮的结果都附带以下信息，方便日后核对：
- `citations`：回答引用的原始数字、比较和审计判定，两期变化的前后两期都会保留；
- `provenance`：数据来源和规则版本；
- `usage`：模型上报的 token 用量。

### 1.5 回放

- 回放格式：`replayFileSchema`（`services/agent/replays.ts`），读取时校验，链接只允许指向站内页面。
- 录制命令：`npm run agent:record`，使用专用的 `vitest.record.config.ts`，读取 `.env.local`，不新增依赖。它在种子数据上逐个录制场景，追问会带上历史对话和当前范围，最后写出 JSON 并重新生成索引。
- 页面：`/agent/replays` 是列表页，`/agent/replays/[id]` 是单条回放。单条回放用和实时页面相同的组件渲染冻结的结果，并标注来源（真实模型或替身）、token 用量、数据来源和规则版本。这两个页面都不调用模型。实时开关关闭时，`/agent` 页面会链接到回放列表。
- 随代码发布的回放共 6 段：3 段真实模型运行（`live-*`），3 段替身运行（`scripted-*`，页面上标注为「Scripted stand-in」）。

### 1.6 真实试跑过程中发现并修复的问题（详见第 3 节）

- 发现 GPT-5.6 Terra 在 Chat Completions 中使用工具时必须设置 `reasoning_effort: none`。
- 商品查询的 key 在精确的 ID 或 SKU 匹配不到时，改为按名称匹配。
- 变化词表补上了「走弱」「恶化」「回升」以及 weakening、recovered 等。
- 系统提示要求模型不要给步骤编号。
- 问题本身是在要求执行操作时，由系统显示「未执行」（新增 `src/domain/agent/intent.ts`）。
- 错误信息中的组织 ID 和形似 key 的字符串在写入回放之前就被遮掉。

---

## 2. 核心修改文件

| 文件 | 修改 |
|---|---|
| `src/services/agent/openai-model.ts` | 新增：适配器、遮蔽敏感信息、429 重试 |
| `src/services/agent/live-config.ts` | openai 分支，从环境变量读取上限 |
| `src/services/agent/orchestrator.ts` | 输入预算、`citations` / `provenance` / `usage`、根据问题意图判断「未执行」 |
| `src/services/agent/answer-context.ts` | 汇总数据来源和规则版本 |
| `src/domain/agent/answer-render.ts` | `citedRefIds`（含两期变化的前后两期） |
| `src/domain/agent/answer.ts` | 变化词表补充 |
| `src/domain/agent/intent.ts` | 新增：判断问题是否在要求执行操作 |
| `src/services/agent/{prompt,scripted-model}.ts` | 提示不要编号；替身模型改用同一个意图判断 |
| `src/services/agent-tools/products.ts` | 商品 key 退回按名称匹配 |
| `src/services/agent/replays.ts`、`src/fixtures/agent-replays/*` | 回放 schema、读取函数、6 段回放 |
| `src/app/agent/replays/**` | 回放列表页和单条回放页 |
| `scripts/agent-replay.record.ts`、`vitest.record.config.ts`、`package.json` | 录制脚本，`agent:record` 命令 |
| `.env.example` | 新增变量（只有变量名，没有值） |
| 测试 | 见第 4 节 |

没有新增依赖，也没有改动指标口径或回答契约。

---

## 3. 真实试跑（如实记录）

环境：本机，模型 `gpt-5.6-terra`（OpenAI Chat Completions），`AGENT_REASONING_EFFORT=none`。这个账户每分钟只有 10,000 个 token 的额度，所以本地 `.env.local` 设置了 `AGENT_MAX_INPUT_CHARS=20000`、`AGENT_MAX_TOOL_RESULT_CHARS=6000`、`AGENT_TURN_TIMEOUT_MS=180000`。

### 3.1 按时间顺序的尝试

| # | 结果 | 原因与处理 |
|---|---|---|
| 1 | 失败 | 429「You have no credits remaining」：账户余额为 0。Agent 如实返回 failed，没有编造回答。用户充值后继续 |
| 2 | 失败 | 400「Function tools with reasoning_effort are not supported for gpt-5.6-terra in /v1/chat/completions… set reasoning_effort to 'none'」。新增可选配置 `AGENT_REASONING_EFFORT` |
| 3 | 回答了，但没有帮助 | 模型把「Ridgeline」放进了 `products`，而这个参数原本只接受精确的 ID 或 SKU，工具返回查不到，模型如实说「未找到」。改为匹配不到精确 ID 或 SKU 时，退回按名称匹配 |
| 4 | 查数通过；复盘第 1 轮降级 | 模型在「怎么验证」里给步骤编了号（1. 2. 3.），被校验拦下，修正请求本身又遇到 429（这个组织每分钟 10,000 token，那次请求有 16,812 token），只能降级。追问那轮通过，但模型写了「表现走弱」，这是趋势说法，词表当时漏了这个词。写请求那轮模型没有调用工具，回答「我只能分析」，没有触发系统的「未执行」提示。**另外，429 原文里的组织 ID 被写进了回放文件。** 这些问题全部按 1.6 修复，有问题的录制文件已删除 |
| 5 | **全部通过**（录制版本） | 4 轮都一次通过，没有触发修正或降级。具体见 3.2 |

### 3.2 最终录制（`live-review`、`live-lookup`、`live-write-request`）

| 场景 | 结果 | 工具调用 | token（输入 / 输出） |
|---|---|---|---|
| 复盘第 1 轮「过去 30 天，独立站最该优先排查什么？」 | answered，2 条发现，排名第一的「结账 → 购买」（Critical，213 个会话）排在最前；Meta 的低样本信号被放进数据缺口 | 漏斗、渠道、商品、审计；达到 20,000 字符的输入预算，系统记录了说明，模型基于已有结果作答 | 17,503 / 1,998 |
| 追问「只看自然搜索呢？」 | answered；范围从全渠道变为 Organic Search，30 天不变；2 条发现都在自然搜索范围内，事实句里写明了渠道 | 先调范围工具，再查漏斗、渠道、商品，入参都是 range 30、Organic Search | 7,558 / 795 |
| 查数「过去 30 天 Ridgeline 从自然搜索获得多少购买会话？」 | answered，只给事实：Ridgeline 2P 3 次（和 Codex 核对的一致）、Rain Shell 2 次、3P 0 次；对话范围没有被改动 | 商品工具，`products:["Ridgeline"]`、Organic Search | 5,265 / 189 |
| 写请求「把第一条建议标记为完成」 | answered；模型没有调用工具，也没有声称已执行；**系统根据问题意图显示「No action was taken」** | 无 | 1,810 / 53 |

### 3.3 本地页面实测（真实模型，生产构建）

在 `/agent` 页面依次点了主问题和追问：
- 页面实时显示查询进度；
- 结果和录制版本一致，排名第一的都是「结账 → 购买」；
- 追问之后，页面上的范围显示变为 Organic Search · 30 天；
- 打开事实句里的链接 `/funnel?range=30&channel=Organic+Search`，漏斗页显示「加购」195、「加购 → 结账」39.49%，和回答里的数字完全一致；
- 回放页 `/agent/replays/live-review` 标注为「Real model run」，显示 token 用量（25,061 / 2,793）、数据来源和规则版本。

### 3.4 「未执行」的两种情况（Codex 要求）

| 情况 | 证据 |
|---|---|
| 模型直接声称已执行（不调用工具） | 集成测试（替身模型）。这次真实模型没有这样做，所以没有真实录制 |
| 工具被拒绝后，模型仍声称已执行 | 集成测试（替身模型）。这次真实模型没有调用不存在的工具 |
| 问题本身在要求执行操作 | **真实录制**（`live-write-request`）和集成测试都覆盖了 |

真实模型在这次试跑里的写请求没有调用写工具，也没有声称已执行，所以前两种情况没有真实样本。它们的保护逻辑由自动化测试验证。

---

## 4. 命令与结果

环境：macOS（Darwin 27.2），Node v24.18.0，npm 11.16.0，本机。门禁使用替身模型，不调用真实 API。

| 命令 | 结果 |
|---|---|
| `npm ci` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run test -- --run` | PASS：36 个文件，**754 个测试**（Dispatch 19 结束时为 723） |
| `npm run test:integration -- --run` | PASS：23 个文件，**457 个测试**（之前 414） |
| `npm run test:e2e` | PASS：**870 个测试**，3 个浏览器，1.4 分钟（之前 852） |
| `npm run build` | PASS；6 段回放页均为静态生成 |

新增测试：
- 适配器 31 个：消息和工具映射、请求格式、key 只出现在请求头、取消信号传到请求、`reasoning_effort` 只在设置时发送、各类响应的解析、401/429/500 错误、遮蔽组织 ID 和 key、限流重试的等待、上限和放弃、余额耗尽不重试、取消时停止等待、预算压缩、单轮预算、回合记录、从环境变量读取上限。
- 回放 10 个：格式往返、各种非法回放被拒、排序、无效文件被报告、随代码发布的回放全部有效且不含 key 或请求头。
- 意图判断单元测试 20 个。
- 变化词表新增 10 个用例。
- 商品名称匹配 2 个。
- 编排循环 2 个：问题在要求执行操作时，即使模型既没尝试也没声称，也显示「未执行」；问 change 的问题不触发。
- E2E 4 个 × 3 个浏览器：回放列表、单条回放（问题、工具调用顺序、回答，浏览期间没有任何 `/api/agent` 请求）、写请求回放显示「未执行」、未知回放返回 404。无障碍扫描新增 2 条路由。

单文件变异测试：`intent.ts` 100%（补了开头空格的用例之后）；`answer-render.ts` 97.65%（补了引用清单的单元测试之后）。

---

## 5. 已知问题与偏差

- **账户限流**：这个账户每分钟只有 10,000 个 token，所以要用更小的预算（见第 3 节的环境配置）。多步骤的复盘在这个预算下最多查 4 个工具就会达到上限。默认预算（160,000 / 24,000 字符）适合额度更高的账户。
- **模型要求**：GPT-5.6 Terra 必须设置 `AGENT_REASONING_EFFORT=none` 才能在 Chat Completions 里使用工具；GPT-6 Astra 和 GPT-6.1 Sol 必须改用 Responses API，本阶段没有实现。
- **意图判断是启发式的**：只识别祈使句（中英文）。它的作用只是让系统多显示一条「未执行」提示，不会放行任何操作，因为本来就没有写工具。
- **商品名称匹配可能命中多个商品**（例如「Ridgeline」会命中 3 款），工具会全部返回，由回答逐个列出。
- `.env.example` 只保留变量名。用户填在里面的模型名已恢复为空，实际配置都在不提交的 `.env.local` 中。
- 全量变异测试没有运行。没有推送，没有部署。

---

## 6. 下一阶段建议

第一阶段的验收项都已有证据：
1. 30 天复盘按优先级排列，每个数字都能回到来源页面核对；
2. 追问会沿用日期并更新筛选；
3. 数据足够和数据不足两条路径、零样本、查不到的商品、工具失败、写请求都有覆盖；
4. 自动化测试、真实试跑和回放验证的结果分开列出。

建议：
1. 先把 Dispatch 18–20 交给 Codex 做一次整体复核。
2. 你决定是否推送分支，以及是否部署公开回放版。公开版不设置 `AGENT_LIVE_ENABLED`，访客只能看回放，不会调用模型。
3. 之后进入第二阶段：客服反馈分析（模拟工单 + SKU 分类）。

---

**本阶段完成。已停止，等待确认下一 Dispatch。**
