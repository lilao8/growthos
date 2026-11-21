# Dispatch 19 — 运营 Agent · 编排循环、回答校验、API 与 `/agent` 界面

状态：**PASS**
日期：2026-11-21
分支：`agent/dispatch-18`（在 Dispatch 18 的 `d719149` 之上继续提交，未推送）
范围：见 [docs/19-agent-orchestration.md](../19-agent-orchestration.md)。**不接真实模型**，测试和本地演示都用可控的替身模型。

---

## 1. 完成内容

### 1.1 回答契约与校验（`src/domain/agent/answer.ts`）

回答里的数字全部由 GrowthOS 渲染。模型只能用占位符引用工具结果：

- `{{ref:<refId>}}`：引用单个数字
- `{{change:<currentRefId>}}`：引用两期变化
- `{{audit:<refId>}}`：引用审计判定

`validateAnswer()` 是纯函数，拦截以下情况：

| 问题码 | 拦截什么 |
|---|---|
| `unknown-ref` / `unknown-change` / `unknown-audit` | 引用了本轮没有任何工具返回过的数字、比较或审计 |
| `raw-number` | 直接写出来的数字。白名单只有：窗口天数、ISO 日期，以及商品名、SKU、渠道名、阶段名里带的数字。`howToVerify` 额外允许出现该发现的引擎建议里本来就有的数字，例如「60 个字符以内」这类阈值 |
| `change-without-comparison` | 摘要、`observed`、`whyPriority` 里出现变化措辞（中英文词表），但同一处没有支持结论的 `{{change:…}}`。`drop-off` 是漏斗术语，不算变化措辞 |
| `unsupported-change` | 引用的比较项 `evidence.supportsConclusion === false` |
| `unknown-basis` / `insufficient-basis` / `duplicate-basis` | 每条发现必须基于本轮工具返回的、样本足够的、没被其他发现用过的工具发现 |
| `site-funnel-for-narrow-scope` / `funnel-for-product` | 用全站漏斗推断某个渠道，或者用任何漏斗数字推断某个商品（文中引用的和所依据工具发现带的引用都会检查） |

### 1.2 排序、渲染与降级（`answer-render.ts`）

- **排序**：发现的顺序由 `rankFindings` 决定，模型写的顺序不算数。
- **渲染**：占位符按口径格式化，并链接到证据页。
- **降级**：校验失败时，先把问题清单发回模型修正一次；仍不通过，就由 GrowthOS 直接用工具发现生成「工具结果摘要」，并在页面上标明是降级结果。

### 1.3 分析范围（`scope.ts`、`services/agent/scope-tool.ts`）

- 范围是一个 `ConversationScope`（日期范围、渠道、商品），默认是 30 天、全渠道、全商品。
- 模型通过元工具 `set_analysis_scope` 声明用户改了哪些条件，GrowthOS 校验后合并。
- 数据工具调用里省略的 range、channel、products，从当前范围注入。
- 范围随对话由客户端回传；开新对话时恢复默认。

### 1.4 编排循环（`services/agent/orchestrator.ts`）

- **调用上限 8 次**：超过时返回 `limit-reached`，并要求模型直接作答。
- **单个工具 5 秒超时**：超时只把这次调用记为错误，并写进说明，分析继续。
- **整轮 60 秒超时**：有工具结果时降级为工具结果摘要，没有时返回失败。
- **模型步数上限 12**，防止模型永远不给出回答。
- **模型无法连接时返回 `failed`**，不编造回答。
- **只读**：工具拿到的是状态的值；注册表里只有 4 个数据工具和 1 个范围元工具，调用其他工具名都得到 `unknown-tool`。
- **进度事件**：`started`、`scope`、`tool-start`、`tool-end`、`answering`、`repairing`、`done`。

### 1.5 模型接口与替身

- `ModelClient` 是一层薄接口：输入是消息和工具规格，输出是工具调用或最终文本。
- `createScriptedModel` 供测试构造各种异常模型。
- `createDemoModel` 是本地演示和 E2E 用的脚本：根据工具结果决定下一步。比如渠道结果里某个渠道转化差，它会再查这个渠道的漏斗（实测会追查 Meta）。它的 id 是 `scripted:demo`，界面上标为 Scripted stand-in model，不冒充真实模型。

### 1.6 API（`src/app/api/agent/route.ts`）

- 只接受 POST，以 NDJSON 流式返回进度事件，`maxDuration = 60`。
- 只有 `AGENT_LIVE_ENABLED=true` 时才工作，否则返回 503 `live-disabled`。
- `AGENT_MODEL_PROVIDER=scripted` 使用替身模型；其他值返回 503 `model-not-configured`。OpenAI 在 Dispatch 20 接入。
- 请求体用 zod 严格校验（问题最多 500 字符，历史最多 10 轮）。浏览器状态用 `parseLocalState` 校验，上限 256 KB。不合格就返回 400，不会调用模型。

### 1.7 `/agent` 页面

- **提问前**：显示分析范围（实际起止日期、天数、渠道、商品）、Demo data 标记和示例问题。
- **分析中**：显示查询进度，带 `aria-live`。
- **结果**：显示摘要和按排序编号的发现。每条发现包含观察到什么、为什么优先、怎么验证；证据有限时显示样本量和降档说明；附证据链接。另外列出数据缺口，以及默认折叠的工具调用记录。
- **追问与新对话**：追问时可以继续提问；「新对话」把范围恢复到默认。
- **异常状态**：读取本地数据时有 loading，读取失败有 error 和 retry；分析失败时保留问题，可直接重试；实时开关未开启时给出说明。
- 导航新增「Ops Agent」入口。

### 1.8 其他

- 新增 `.env.example`，只写变量名。
- E2E 测试服务器设置 `AGENT_LIVE_ENABLED=true`、`AGENT_MODEL_PROVIDER=scripted`，不会调用真实模型。
- 无障碍扫描的路由列表加入 `/agent`。

---

## 2. 核心修改文件

| 文件 | 修改 |
|---|---|
| `src/domain/agent/{scope,answer,answer-render}.ts` | 新增 |
| `src/services/agent/{model,scope-tool,answer-context,prompt,orchestrator,scripted-model,request,live-config,client}.ts` | 新增 |
| `src/app/api/agent/route.ts`、`src/app/agent/page.tsx` | 新增 |
| `src/components/agent/{agent-view,answer-text}.tsx` | 新增 |
| `src/components/layout/nav-items.ts` | 加 Ops Agent 入口 |
| `playwright.config.ts`、`e2e/ready.ts`、`e2e/accessibility.spec.ts` | 测试服务器环境变量、ready 标记、无障碍扫描路由 |
| `tests/unit/{agent-scope,agent-answer,agent-answer-render}.test.ts` | 新增 |
| `tests/integration/{agent-orchestrator,agent-api}.test.ts` | 新增 |
| `e2e/agent.spec.ts` | 新增 |
| `tests/unit/nav-items.test.ts` | 导航顺序加入 `/agent`（行为有意变化） |
| `.env.example`、`docs/19-agent-orchestration.md`、本报告、`README.md`、`docs/00-architecture.md` | 文档 |

没有新增依赖：工具规格用 zod 4 自带的 `z.toJSONSchema`，流式响应用 Web `ReadableStream`。没有改动工具计算、指标公式或 `DemoState` schema。

---

## 3. 命令与真实结果

环境：macOS（Darwin 27.2），Node v24.18.0，npm 11.16.0，本机执行。

| 命令 | 结果 |
|---|---|
| `npm ci` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run test -- --run` | PASS：35 个文件，**699 个测试**（Dispatch 18 结束时 630） |
| `npm run test:integration -- --run` | PASS：20 个文件，**397 个测试**（之前 364） |
| `npm run test:e2e` | PASS：**837 个测试**，3 个浏览器，1.3 分钟（之前 816；agent 6 个 × 3 + `/agent` 无障碍扫描 1 个 × 3） |
| `npm run build` | PASS，构建出 `/agent`、`/api/agent` |

单文件变异测试：

| 文件 | 得分 | 剩余存活变异 |
|---|---|---|
| `scope.ts` | 100% | 0 |
| `answer-render.ts` | 94.58% | 9 个：缺省值分支，以及在已校验输入下不可达的防御分支 |
| `answer.ts` | 92.18% | 18 个：11 个错误消息文本；4 个正则分组或缺省值的默认分支，缺省时已有其他问题被报出；1 个等价过滤条件；2 个替换成空字符串时的极端相邻字符边界 |

全量 `npm run test:mutation` 没有运行，需要先推送、再从 Actions 手动触发。

### 过程中的失败与修复（如实记录）

1. **演示脚本的追查条件没生效**：发给模型的工具发现里没有 `ruleId`，脚本无法识别「转化差」这条发现。把 `ruleId` 加进发给模型的发现后，脚本会追查 Meta 的漏斗。
2. **数据不足的集成测试写错了预期**（3 次失败）：
   - 我原以为数据稀疏或为空时不会有任何发现，但 SEO/GEO 审计发现依然存在。审计看的是页面内容，与流量无关，流量只影响排序；这与 Codex 认可的规则一致。
   - 稀疏数据里「浏览 → 加购」仍有 185 个会话进入，超过 150 的门槛，所以保留为已确认的发现；两个结账步骤低于门槛，转为缺口。
   - 测试改为按这些已确认的行为断言（按步骤名、缺口原文和数量），没有放宽断言。
3. **`formatValue` 的倍数符号写错了预期**：项目的格式化函数输出 `2.50x`，我在测试里写成了 `2.50×`。改的是测试预期，代码没有问题。
4. **build 的类型检查拦下了测试里一处多余的类型比较**，已修正。
5. **E2E 选择器冲突**：`getByText('Demo data')` 在页面上匹配到 4 个元素，改为限定在 agent 区域内。
6. **变异测试第一轮暴露的真实缺口**，已逐一补测试：
   - `sameScope` 没测过两个相同的非空商品列表；
   - 回答 schema 的各个长度上限；
   - 变化词表里的每个词；
   - whyPriority 中的变化措辞；
   - 去除名称时的长度顺序和空名称；
   - 占位符两侧紧挨的数字；
   - 非漏斗的全站数字被误判为漏斗数字；
   - 通过 `{{change}}` 引用的全站漏斗；
   - 用 `{{ref}}` 冒充变化依据；
   - 未知的 change 和漏斗引用不应导致崩溃；
   - 变化符号（+ / ± / 无相对值）；
   - 渲染时未知依据被丢弃；
   - 降级摘要的措辞。

---

## 4. 验收证据

| 验收项 | 证据 |
|---|---|
| 1 主问题：按优先级给出建议，每条结论都能回到来源核对 | 集成测试：替身模型依次调用渠道 → 全站漏斗和 Meta 漏斗 → 审计，回答通过校验；发现顺序等于 `rankFindings`；每个数字都渲染成链接，指向 `/analytics`、`/funnel`、`/products`、`/seo`、`/geo`。E2E（3 个浏览器）：页面显示编号发现、数字链接和证据链接，点击证据链接能打开对应页面。Dispatch 18 的 E2E 已证明这些链接上的数字与工具结果一致 |
| 2 追问「只看自然搜索呢？」 | 集成测试：范围从 `{30, null}` 变为 `{30, 'Organic Search'}`，窗口仍是 08-02..08-31，所有数据工具调用的入参都是 range 30、channel Organic Search；从 7 天范围追问时保持 7 天；新对话恢复默认；非法范围被拒绝，范围保持不变。E2E：第二轮的范围标签和工具记录入参符合预期，「新对话」后恢复 All channels |
| 3 数据足够与数据不足（同一个问题） | 集成测试：完整数据下有结账发现；稀疏数据下结账转为缺口（附原始会话数），8 个渠道都报低于 300 的缺口，「浏览 → 加购」保留为已确认的发现 |
| 3 零样本、查不到的商品、工具失败、写请求 | 零样本：没有流量类发现，缺口里报告 no sessions，审计发现的受影响会话为 0。查不到的商品：`NT-999` 返回 empty，缺口中写明。工具失败：所有调用记为 error，分析仍然作答。写请求：`unknown-tool`，没有发现，状态对象前后深度相等。E2E 中写请求前后的 localStorage 逐字节相同 |
| 4 用替身模型自动化覆盖 | 校验：伪造引用 → 修正一次后通过；修正后仍不合格 → 降级（问题码包括 unknown-ref 和 change-without-comparison）；非 JSON 回答 → 降级（invalid-json）。限制：恰好执行 8 次调用后要求作答；工具 20 ms 超时；整轮 30 ms 超时；模型 3 步内不作答；模型抛错时返回 failed |
| API | live 开关只认 `"true"`（`'1'`、`'TRUE'` 都不行）；关闭时返回 503；provider 未配置时返回 503；非法 JSON、空问题、超长问题、非法范围、未知字段、`schemaVersion` 6、超大状态都返回 400，不会调用模型；流式事件以 `started` 开头、以 `done` 结尾。客户端能正确拼接被拆分到多个 chunk 的事件，也能区分 disabled、error 和网络失败 |
| 无障碍 | axe 扫描 `/agent` 的初始状态，以及已有回答且工具记录展开后的状态，均无 WCAG A/AA 违规（3 个浏览器）。这不等于屏幕阅读器实测 |
| 浏览器目视 | 在生产构建上用替身模型实际走了一遍：范围卡片、编号发现、样本有限的降档说明、Meta 漏斗的缺口、折叠的工具记录都显示正常 |

验收第 4 条中的「真实模型本地试跑」和「回放」属于 Dispatch 20，本阶段没有进行，也没有标记为通过。

---

## 5. 已知问题与偏差

- **数据缺口分两部分展示**：一部分是工具自己写的缺口，GrowthOS 原文展示，里面的数字由引擎计算，不经过占位符；另一部分是模型写的缺口，要通过数字校验。这样做是因为样本量这类数字对判断缺口最关键，而工具原文本来就可信。
- **替身模型的回答比较机械**：它直接照抄引擎给的「怎么验证」原文，中文提问时会出现中英混排。真实模型在 Dispatch 20 应该会改写这部分；校验规则允许改写，只要不引入新的数字。
- **变化词表是启发式的**：可能漏判同义的说法，也可能把「建议提升」之类误判为变化措辞。`howToVerify` 不检查变化措辞，以减少误伤。词表的取舍可以复核。
- **回答渲染只放在客户端**：服务端返回的是结构化片段，页面负责展示。回放的数据格式在 Dispatch 20 定。
- **发给模型的工具结果没有裁剪**：审计结果可能有几十 KB。对替身模型没有影响；接 OpenAI 时要评估 token 用量，必要时裁剪。

---

## 6. 下一阶段建议

**Dispatch 20：接入 OpenAI、本地真实试跑、录制回放、回放页、Vercel 只读开关**（仅为建议）。

- **需要你操作**：在项目根目录新建 `.env.local`，写入 `OPENAI_API_KEY`、`AGENT_LIVE_ENABLED=true`、`AGENT_MODEL_PROVIDER=openai`，以及模型 ID（`AGENT_MODEL`）。到时我会再提醒一次。
- 用 `fetch` 实现 OpenAI 的 `ModelClient`，接口细节先按当时的官方文档确认。
- 用真实模型跑主问题、追问和写请求，把实际结果写进报告（包括模型没有一次通过校验的情况）。
- 回放 JSON 冻结每次运行用到的引用、比较和审计数据；回放页不触发任何模型调用。
- 公开部署需要你另行授权。

---

## 7. 复核修正（Codex 复核 `503d099` 后）

逐条对照代码核实，4 个阻塞项和 3 条建议都成立。阻塞项 2 改变了回答契约的设计，但不涉及产品范围、数据口径或工具权限，所以直接实现。

### 7.1 阻塞项

| # | 复核意见 | 核实 | 修正 |
|---|---|---|---|
| 1 | 自然搜索追问的结果里显示原始占位符 | 成立：占位符正则 `[^{}\s]+` 排除了空格，而引用 ID 里含 `Organic Search` | 引用不再写在文本里：事实改为结构化字段，自然不再需要解析。E2E 断言追问结果里没有 `{{`，每个数字都写成句子并带日期，链接都指向 `channel=Organic+Search` |
| 2 | 引用有效，仍可能支撑错误的结论（渠道、日期、方向） | 成立：变化校验只看有没有一条样本达标的比较，方向写反也能通过；渠道和日期写在文本里，无法校验 | **事实结构化**：发现里的 `facts` 由 `value`、`change`（带模型声称的 `direction`）和 `audit` 三类组成，**事实句由 GrowthOS 生成**：指标标签（缺渠道名时补上渠道范围）、起止日期、数值；两期变化写成「前期值（前期日期）→ 本期值（本期日期），相对变化」，两期各自链接到自己的窗口。校验 `direction` 与数据实际方向一致（新增 `wrong-direction`）；每条引用的渠道和商品必须与发现的 scope 一致（新增 `scope-mismatch`）；一条发现的文本里不能出现其他渠道名（匹配时长名优先，所以「AI Referral」不会被当成「Referral」）。模型不再给发现命名，标题取自工具发现 |
| 3 | 标题和缺口没有做数字校验，白名单过宽 | 成立 | 所有可见的文本字段（摘要、为什么优先、怎么验证、缺口）都**不允许出现任何数字**，取消了窗口天数、ISO 日期和名称白名单；日期和窗口只出现在 GrowthOS 生成的事实句里。商品只能写成 `{{product:<id>}}`，由 GrowthOS 渲染成商品名并链接。「怎么验证」可以说「观察转化是否改善」，但不能写数字；规则的原始建议（含字符上限等阈值）在旁边原文显示为「Rule guidance」。文本里也不能再声称变化（「比上月弱」「上月」「前期」等词已加入词表）；变化只能写成 change 事实，由数据核对方向 |
| 4 | 流中断时界面卡住；取消后仍可能启动后续调用 | 成立，另外复现出一个真 bug：请求在进入循环之前就已取消时，`abort` 事件不会再触发，模型仍然被调用 | 客户端读取流时捕获异常，返回「连接中断」错误；页面退出「分析中」，保留问题，可重试。编排循环开始时先检查信号是否已取消；同一批工具调用里，每次调用前都检查，取消后的调用记为 `cancelled`。路由写流时检测客户端是否已断开 |

### 7.2 建议修改

| 复核意见 | 修正 |
|---|---|
| 区分模型失败、工具失败和数据不足；写操作被拒后由系统说明 | `done: failed` 不再清空草稿，页面显示错误和重试按钮。结果新增 `failedChecks`（失败的查询），页面单独显示「Could not check」，不会被当成数据为零。新增 `refusedActions`：模型调用了不存在的操作时，**由 GrowthOS 显示「No action was taken」**，不依赖模型怎么说 |
| 第 11 轮以后历史超过 10 条，请求会被拒 | `askAgent` 只发送最近 10 轮历史，测试确认第 16 轮的请求能通过服务端校验 |
| 替身模型提前截取前五条，排序和 GrowthOS 不一致 | 替身模型改用同一个 `rankFindings` 选前五条 |
| 读取请求体时就限制大小 | 路由边读边计数，超过 320 KB 立即返回 413（同时检查 Content-Length），不会先把整个请求读进内存 |

### 7.3 可选与口径

- **缺口带证据链接**（采纳）：工具缺口现在是 `{message, links}`，链接指向缺口所依据的原始数字（例如结账步骤只有多少会话）。
- **零流量的发现**（采纳）：审计发现的受影响会话为 0 时，页面标注「no sessions in this window, so the current impact is limited」。
- **单次调用显式下钻**（保持现状）：只有 `set_analysis_scope` 会改变下一轮的默认条件。每条事实句都写出自己的渠道和日期，所以下钻得到的数字在回答里有明确标注。
- **模型输入预算和回放格式**：按 Codex 的建议放到 Dispatch 20 开头确定（实测一次未筛选的审计结果约 101 KB）。

### 7.4 新增与修改的测试

- 单元测试 +11：回答校验重写为 52 个用例，渲染测试重写为 16 个。
  - 校验覆盖：含空格的引用 ID；方向写反；样本不足的变化；Meta 数字被当成自然搜索；渠道数字被当成全站；全站漏斗（事实里的和依据里带的）推断渠道；任何漏斗数字推断商品；商品数字与 scope 不符；文本中的其他渠道名；「AI Referral」出现两次；所有文本字段里的数字（包括「30」、ISO 日期、标题位置、缺口）；商品占位符；其他占位符；31 个变化词；schema 的各个边界。
  - 渲染覆盖：渠道范围标注；两期链接；符号；无法解析时不渲染；证据标签。
- 集成测试 +5：追问的事实链接都指向自然搜索、日期正确、没有占位符；证据有限的发现显示降档；工具失败进入 `failedChecks` 而不是缺口；写请求进入 `refusedActions`；已取消的请求不调用模型；同一批调用在取消后记为 `cancelled`；流中途断开；第 16 轮只发送 10 轮历史；请求体超过 320 KB 返回 413。
- E2E +2 个 × 3 个浏览器，另外加强了已有断言：
  - 失败的回答保留问题，重试后能拿到结果；
  - 流中断后页面退出「分析中」，提问按钮可用，问题仍在；
  - 主问题的结果里没有占位符，并显示 Rule guidance；
  - 追问的事实句含 Organic Search 和日期，链接都带渠道参数；
  - 写请求显示「No action was taken」。

### 7.5 变异测试（单文件）

| 文件 | 得分 | 剩余存活变异 |
|---|---|---|
| `answer.ts` | 89.20% | 31 个，均为错误消息文本、缺省值或等价写法（例如是否过滤 audit 类事实：audit 的 id 本来就不在数字引用表里） |
| `answer-render.ts` | 97.01% | 6 个，均为缺省值或在已校验输入下不可达的分支 |

第一轮暴露的真实缺口都已补测试：三个方向枚举值和 audit 类型、`fall`/`rise`/`grow` 词形、渠道名出现两次、没有商品归属的审计判定、证据标签被覆盖、事实和 scope 字段、降级摘要的字段。

### 7.6 修正后的门禁（本机，Node v24.18.0）

| 命令 | 结果 |
|---|---|
| `npm ci` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run test -- --run` | PASS：35 个文件，**710 个测试** |
| `npm run test:integration -- --run` | PASS：20 个文件，**402 个测试** |
| `npm run test:e2e` | PASS：**843 个测试**，3 个浏览器，1.3 分钟 |
| `npm run build` | PASS |

### 7.7 过程中的失败（如实记录）

- 一个集成测试原本断言主问题的结果里有「证据有限」的发现。替身模型改用同一套排序后，前五条全是 Critical，这个断言不再成立，这是预期的变化。测试改为显式引用 Meta 的低订单发现，验证样本量和降档的显示。
- 已取消请求的测试暴露了编排循环里的真 bug（已在 7.1 第 4 行修复）。
- 流中断测试最初在同一个 tick 里先 enqueue 再 error，Web Streams 会直接丢弃已排队的块。改为按次拉取：第一次读到数据，第二次读时出错。
- lint 拦下两处 `==`，改为显式的 `previousRef()` 辅助函数。
- 浏览器目视检查发现，漏斗数字的事实句没有写出渠道。补上 `describe()`：标签里没有渠道名时加上渠道范围，并为此补了单元测试和 E2E 断言。

---

**本阶段完成。已停止，等待确认下一 Dispatch。**
