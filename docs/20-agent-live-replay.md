# Dispatch 20：运营 Agent · OpenAI 接入、输入预算、真实试跑与回放

> 运营 Agent 第一阶段的第三段。前置：Dispatch 19（`8c334e8`，Codex 复核认可进入本阶段）。
> 本阶段接入真实模型，但**业务数据仍是演示数据，工具仍只读**，公开部署不开启实时调用。部署和推送需要用户另行授权。

## 目标

1. 用一层薄适配器接入 OpenAI，替身模型继续承担全部自动化测试。
2. 先定模型输入预算和回放格式（Codex 复核要求）。
3. 用户提供 key 后，在本地用真实模型跑完验收问题，并保存真实运行的回放。
4. `/agent/replays` 展示回放，浏览回放时不发起任何模型调用。

## 接口依据（2026-11-21 核对官方文档）

- 使用 Chat Completions：`POST https://api.openai.com/v1/chat/completions`，请求头 `Authorization: Bearer <key>`。
- 工具定义为 `tools: [{ type: "function", function: { name, description, parameters } }]`。
- 助手消息带 `tool_calls: [{ id, type: "function", function: { name, arguments } }]`，其中 `arguments` 是 JSON 字符串；工具结果以 `{ role: "tool", tool_call_id, content }` 回传。
- 响应取 `choices[0].message`，`finish_reason` 为 `tool_calls` 或 `stop`，用量在 `usage.prompt_tokens` 和 `usage.completion_tokens` 中。
- 文档写明 GPT-6 Astra 和 GPT-6.1 Sol 做工具调用必须使用 Responses API，**这两个模型不能用本适配器**。Chat Completions 的示例模型是 `gpt-5.6-terra`。
- 文档没有给出错误响应体的格式，适配器按 `error.message`、再退回 HTTP 状态码的顺序做防御式解析，且**不会把请求头或 key 写进任何错误信息或日志**。

## 关键设计判断

1. **适配器只做格式映射。** `createOpenAIModel({ apiKey, model, fetch })` 实现 `ModelClient`：把内部消息转成 Chat Completions 格式，把响应转回 `ModelTurn`。`AbortSignal` 原样传给 `fetch`。不加 SDK 依赖。
2. **配置。** `AGENT_MODEL_PROVIDER=openai` 时必须同时设置 `OPENAI_API_KEY` 和 `AGENT_MODEL`；缺任何一项都返回 503 `model-not-configured`，提示中只列出缺少的变量名，不显示变量值。
3. **输入预算。**
   - 单个工具结果发给模型前，上限为 24,000 个字符。超出时先去掉 `data`，保留发现、发现所引用的数字和审计判定、缺口；仍然超出就按排序截取发现，并在结果中标明 `truncated`。
   - 整轮输入上限为 160,000 个字符（所有消息累计）。达到上限后不再执行新的工具调用，要求模型直接作答；超过上限的 1.25 倍时直接降级，并在 `notes` 中写明原因。
4. **回放格式。** 每个回放是 `src/fixtures/agent-replays/<id>.json` 文件，内容为：版本号、`source`（`live-model` 或 `scripted`）、模型 ID、录制时间、演示数据截止日、状态来源（`seed`），以及每一轮的问题、提问前的范围和完整的 `AgentTurnResult`。`AgentTurnResult` 中冻结以下内容：
   - 实际的工具调用（入参与摘要）；
   - 已渲染的回答（数值与链接）；
   - 所引用的原始数字、比较和审计判定（`citations`）；
   - 数据源和规则版本（`provenance`）；
   - token 用量。
   
   回放文件不包含任何请求头或密钥。
5. **录制。** 使用 `npm run agent:record`，由专用的 vitest 配置运行录制脚本（不新增依赖）。脚本读取 `.env.local`，用种子状态依次跑完给定的问题（追问会带上历史和范围），然后写出回放文件。替身模型也能录制，但标为 `scripted`，页面上明确写「Scripted stand-in」。
6. **回放页。** `/agent/replays` 列出回放，`/agent/replays/[id]` 用与实时版相同的组件渲染冻结的结果。页面只读取静态 JSON，不调用 `/api/agent`。实时开关关闭时，`/agent` 会提示可以查看回放。

## 范围

- `src/services/agent/openai-model.ts`、`live-config.ts`（新增 openai 分支）、`orchestrator.ts`（输入预算、`citations`、`provenance`、`usage`）。
- `src/domain/agent/replay.ts`（回放 schema）、`src/services/agent/replays.ts`（读取与校验）、`src/fixtures/agent-replays/`。
- `src/app/agent/replays/page.tsx`、`src/app/agent/replays/[id]/page.tsx`。
- `scripts/agent-replay.record.ts`、`vitest.record.config.ts`、`npm run agent:record`。

## 明确不做

- 不部署、不推送、不改 Vercel 设置。
- 不接第二家供应商，不做 Responses API 适配。
- 不改工具、指标口径和回答契约。

## 验收

| # | 用例 | 层 |
|---|---|---|
| 1 | 适配器：请求格式、工具规格、消息映射（含 `tool_call_id`）、工具调用解析、最终文本解析、用量、HTTP 错误、错误中不含 key、`AbortSignal` 传到 `fetch` | unit / integration（模拟 fetch） |
| 2 | 配置：缺 key 或缺模型时返回 503，提示中只有变量名 | integration |
| 3 | 预算：大型工具结果被压缩并标明截断；整轮超预算时停止调工具，超过上限的 1.25 倍时降级 | integration |
| 4 | 回放：schema 校验；回放页显示原问题、工具调用顺序、关键结果和最终回答；浏览期间没有 `/api/agent` 请求 | integration + e2e |
| 5 | 真实试跑（需要用户的 key）：主问题、追问「只看自然搜索呢？」、查数、写请求（直接声称已执行、调用不存在的工具两种情况都显示「未执行」）、复盘必须包含排名第一的发现；记录每一轮的真实结果，包括被修正或降级的情况 | 手工 + 回放 |
