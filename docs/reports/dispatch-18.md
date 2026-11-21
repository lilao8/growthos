# Dispatch 18 — 运营 Agent · 只读工具层与可复现证据链接

状态：**PASS**
日期：2026-11-21
分支：`agent/dispatch-18`（基于 `main` @ `1dfd2c1`）
范围：见 [docs/18-agent-tools.md](../18-agent-tools.md)。不接模型、不新增 Agent 页面或 API 路由、不写任何状态。

---

## 1. 完成内容

### 1.1 四个只读工具（`src/services/agent-tools/`）

| 工具 | 复用的现有代码 | 返回 |
|---|---|---|
| `get_channel_performance` | `loadAnalytics`、`analyticsRecommendations` | 渠道表与站点总计；30/7 天附前一期与两期比较；渠道发现；样本不足的渠道作为缺口 |
| `get_funnel` | `loadFunnel`（新增 `channel` 选项）、`funnelRecommendations` | 全站或单渠道漏斗、前一期比较、发现；`productId` → `unsupported` |
| `get_product_performance` | `loadProductList`（新增 `channel`） | 按 id / SKU / 文本查询的商品指标；`notFound`；零浏览样本缺口 |
| `get_audit_findings` | `readAudit`、`runSeoAudit` / `runGeoAudit`、`seo/geoRecommendations` | 每页审计来源（`stored` / `computed-on-request` + 原因）、带规则与 evidence 的 `AuditRef`、发现 |

共同契约：zod 校验输入；`readOnly: true` 字面量；上下文里只有只读 traffic 仓库和值形式的 `DemoState`，没有可调用的 `save`。`runTool` 不抛异常：`unknown-tool`、`invalid-input`、`unsupported`、`error`、`empty` 都是结构化结果。每个关键数字带确定性的 `refId`、口径键、窗口、渠道和证据 `href`。

### 1.2 新增纯函数（`src/domain/`）

- `agent/windows.ts`：可比前一期。前一期必须完整落在数据内，否则返回 `no-prior-window`。
- `agent/comparison.ts`：两期比较。方向只反映算术差值，不代表显著性；任一侧缺失时为 `unknown`。
- `agent/priority.ts`（`agent-priority-1.0.0`）：先按现有规则优先级排；证据有限的降一档；低于会话下限的不参与排序，转为缺口；同档按受影响会话数降序，最后按 id。
- `agent/links.ts`、`agent/refs.ts`、`url-params.ts`、`analytics/session-filters.ts`。

### 1.3 证据链接（D3）

- `/analytics?range=&end=`、`/funnel?range=&channel=&end=`（新增渠道下拉框）、`/products/[id]?range=&channel=`。
- 页面和链接构造共用 `url-params.ts` 里的参数名与解析器。`end` 只在整个窗口落在数据内时才被接受，页面上会显示「Comparison window」提示。
- 切换范围或渠道时用 `history.replaceState` 同步 URL，`demo` 等其他参数保持不变。
- 三个页面不带参数时，默认行为与之前完全一致。

### 1.4 规则修改（D7）

`CLAUDE.md` 与 `AGENTS.md` 第 29 行改为：只有 Agent 层可以调用一个经授权的模型端点；业务数据仍是演示数据，工具只读，公开部署不开启实时调用。两份文件保持逐字相同。`AGENTS.md` 首次纳入版本控制。

---

## 2. 核心修改文件

| 文件 | 修改 |
|---|---|
| `src/services/agent-tools/{types,shared,channels,funnel,products,audits,registry,local-state}.ts` | 新增 |
| `src/domain/agent/{windows,comparison,priority,links,refs}.ts` | 新增 |
| `src/domain/url-params.ts`、`src/domain/analytics/session-filters.ts` | 新增 |
| `src/services/analytics-service.ts` | `windowForRange` / `loadAnalytics` 接受 `end`；`parseAnalyticsRange` 改为委托给共用解析器 |
| `src/services/funnel-service.ts` | `loadFunnel(deps, range, { channel, end })`，返回值带 `channel` |
| `src/services/product-service.ts` | `deps.channel` |
| `src/app/{analytics,funnel,products/[id]}/page.tsx` | 解析 URL 参数 |
| `src/components/{analytics,funnel,products}/…-view.tsx` | 用 URL 参数初始化状态；Funnel 加渠道筛选和 `funnel-scope` 说明；商品页显示指标范围 |
| `src/components/ui/replace-query.ts` | 新增 |
| `tests/unit/{agent-windows,agent-priority,agent-links,session-filters}.test.ts` | 新增，共 43 个 |
| `tests/integration/agent-tools.test.ts` | 新增，共 38 个 |
| `e2e/agent-evidence.spec.ts` | 新增，7 个 × 3 个浏览器 |
| `CLAUDE.md`、`AGENTS.md`、`README.md`、`docs/00-architecture.md`、`docs/18-agent-tools.md` | 文档 |

没有新增依赖，没有改 `SCHEMA_VERSION`，也没有改任何指标公式或审计规则。

---

## 3. 命令与真实结果

环境：macOS（Darwin 27.2），Node v24.18.0，npm 11.16.0，本机执行。

| 命令 | 结果 |
|---|---|
| `npm ci` | PASS（581 个包） |
| `npm run lint` | PASS，0 problems |
| `npm run typecheck` | PASS |
| `npm run test -- --run` | PASS：31 个文件，**616 个测试**（Dispatch 17 为 573） |
| `npm run test:integration -- --run` | PASS：17 个文件，**344 个测试**（之前 306） |
| `npm run test:e2e` | PASS：**798 个测试**，3 个浏览器，1.2 分钟（之前 777） |
| `npm run build` | PASS |
| Stryker 单文件（`npx stryker run --mutate <file>`） | 见下表 |

| 文件 | 变异得分 | 存活变异 |
|---|---|---|
| `agent/windows.ts` | 100% | 0 |
| `agent/comparison.ts` | 100% | 0 |
| `agent/refs.ts` | 100% | 0 |
| `agent/links.ts` | 100% | 0 |
| `analytics/session-filters.ts` | 100% | 0 |
| `agent/priority.ts` | 91.43% | 6 个，均为等价变异：5 个只在两个发现 id 完全相同时才可能有差别；1 个是 `minimumOrders !== null` 守卫，在 JS 里 `n < null` 本来就是 false |
| `url-params.ts` | 85.71% | 4 个，均为等价变异：3 个是把缺省值的空字符串换成别的非法字符串；1 个是边界上 `>` 改成 `>=`，两者返回同一个值 |

全量 `npm run test:mutation` 没有运行：约需 24 分钟，按规则应从 Actions 手动触发，而这需要先推送。

### 过程中的失败与修复（如实记录）

1. **第一次全量 E2E 有 3 个失败**（795 passed / 3 failed），失败的是已有测试 `funnel.spec.ts`「switching the range moves every layer together」，三个浏览器都挂。原因：我在 `funnel-window` 后面追加了「· All channels」，而这个测试断言的是这一行的完整文本。处理方式：不改旧断言，把渠道说明拆到单独的 `funnel-scope` 元素里，新测试也改为断言这个元素。修复后重跑全量，798 个全部通过。
2. **第一次跑 Stryker 时 `url-params.ts` 只有 34%**：`parseEndParam` 没有单元测试，之前只被集成测试和 E2E 间接覆盖到。补了 7 个边界用例（恰好落在覆盖范围首日、差一天、晚于截止日、非法日期等）。剩下的存活变异都来自冗余的 `null`/`undefined` 守卫，于是把守卫简化为 `value ?? ''`，行为不变。
3. **`priority.ts` 有一个真实缺口**：排序比较器里 `a` 和 `b` 各自写了一遍 `?? -1`，变异其中一侧后测试仍然通过。原因是小数组排序时比较器只按某一个参数顺序被调用，测试抓不到这种不对称。改成两侧共用 `sessionKey()`，该变异随即被杀死。
4. `links.ts` 删掉了一个不可达的分支（所有调用都会传 range，查询串不会为空）。

---

## 4. 验收证据

| 验收标准 | 证据 |
|---|---|
| 渠道漏斗与全站同口径 | `agent-tools.test.ts` 遍历 8 个渠道：每层之和等于全站对应层；渠道 session 层等于渠道表的 sessions；purchase 层等于 orders |
| 30 天前一期正确；90 天给出缺口 | 单元测试：前一期为 `2026-07-03..2026-08-01`，覆盖首日边界和差一天的情况；集成测试：90 天时 `previous: null`、没有比较结果、带 `no-prior-window` |
| 工具数字与页面服务一致 | 集成测试：渠道行和站点总计与 `loadAnalytics(30)` 深度相等；前一期的行与 `loadAnalytics(30, '2026-08-01')` 深度相等 |
| 证据链接复现数字 | E2E（3 个浏览器）：Organic Search 的 sessions / orders 在 `/analytics?range=30` 上一致；前一期数字在 `?end=2026-08-01` 上一致并显示对比提示；Organic 漏斗的 session 和 purchase 层在 `/funnel?range=30&channel=Organic+Search` 上一致；商品浏览会话在 `/products/…?range=30&channel=Organic+Search` 上一致 |
| D2 审计：现场计算的结果等于在页面上运行审计 | 集成测试：先运行 SEO/GEO 全量审计再调用工具，`origin` 变为 `stored`，与现场计算的 AuditRef 和分数逐项相等。E2E：全新浏览器打开 `/seo/snap_ridgeline_2p_tent` 显示 never-audited，点击 Run audit 后，分数和每条检查的 `data-status` 与工具结果一致 |
| 本地编辑会反映到结果里 | 集成测试：审计后修改 meta 标题，工具把该页标为 `computed-on-request / stale`，`meta-title-length` 的 evidence 反映新标题（12 个字符） |
| 结构化处理零样本、查不到的商品、失败和 SKU 漏斗 | 空数据时 8 个渠道都有 `zero-sessions` 缺口，比率为 null，结果中没有 NaN 或 Infinity；`NT-999` 进入 `notFound`，状态为 `empty`；四个工具遇到失败的仓库都返回 `error`；`productId` 返回 `unsupported` 并指向商品工具 |
| 只读 | 四个工具执行前后，传入的状态对象深度相等；注册表只有固定的 4 个工具；调用 `mark_recommendation_done` 返回 `unknown-tool` |
| 损坏或过大的本地状态 | `parseLocalState`：`schemaVersion: 6`、非对象、超过 256 KB 都会被拒绝，不回退到种子 |

---

## 5. 已知问题与偏差

- **方案偏差（扩大）**：原计划只给 Analytics 加 `range`、给商品页加 `range`。实现时发现前一期数字和按渠道过滤的商品数字在页面上无法复现，所以补了 Analytics/Funnel 的 `end` 参数和商品页的 `channel` 参数。这两项都只是为了满足「证据链接能复现数字」这条已确认的要求，已写入 spec。
- **审计发现的证据强度**：审计结论是确定性的规则判定，只有 evidence 为空时才标为 `limited`；受影响样本（页面浏览会话）只用于同档内排序。这一点可以讨论，是否需要按页面流量降档请 Codex 一并复核。
- **审计排序用的流量窗口与 Recommendations 页不同**：工具使用请求的窗口（默认 30 天）来分流量档，Recommendations 页固定用 90 天，所以两边同一条发现的优先级可能不同。审计页本身不显示优先级，证据（检查状态和 evidence）是一致的。
- **商品工具不做两期比较**，只给当前窗口，这是范围内的取舍。
- **种子状态约 59 KB**（含全部 34 次审计时会更大，但仍明显低于 256 KB 上限）；带全部审计的实际大小没有单独测量。
- 全量 mutation workflow 没有运行（原因见第 3 节）。

---

## 6. 下一阶段建议

**Dispatch 19：编排循环、替身模型、API 与 `/agent` UI**（仅为建议）。内容包括：`ModelClient` 薄接口与 `ScriptedModelClient`；scope 合并纯函数（追问时沿用日期、更新渠道）；全局 `rankFindings`；回答 JSON 校验（只认 refId，「下滑」必须引用比较结果，全站漏斗不能用来推断渠道或 SKU）；调用上限 8 次，单工具 5 秒，整轮 60 秒；`/api/agent` route（读取 `AGENT_LIVE_ENABLED`）；提问页、进度和结果 UI。Dispatch 19 不需要 OpenAI key。

---

## 7. 复核修正（Codex 复核 `b66730e` 后）

复核提出 3 个阻塞问题和 2 条建议。逐条对照代码核实后，5 条都成立，而且都不涉及产品范围、数据口径或工具权限的变化，所以直接修复。

| # | 复核意见 | 核实 | 修正 |
|---|---|---|---|
| B1 | 审计链接可能打开「未审计」或旧结果，要手动重跑才能核对 | 成立：`computed-on-request` 的链接指向普通审计页 | 新增纯函数 `src/domain/audit-preview.ts` 的 `currentAudit()`，Agent 工具和审计页共用这一个函数。SEO/GEO 审计页支持 `?preview=1`：已存且当前的审计照常显示；否则用当前快照现场计算并显示「Preview, not saved」，原因区分 not-audited 和 stale，不写入任何存储。审计链接统一带 `?preview=1`。不带这个参数时页面行为不变 |
| B2 | 部分关键数字在链接页面上找不到；CAC 告警缺少它所比较的全站 AOV 引用 | 成立：商品页不显示购买会话数；CAC 发现没有引用 AOV；环比结果没有给比较双方的引用 | 商品详情页新增「Sessions that bought this product」，并改写口径说明。渠道工具新增全站 `average_order_value` 和各渠道 `ad_spend` 引用；CAC 发现引用 AOV，ROAS 发现引用广告花费。渠道和漏斗的每个比较项都带 `currentRefId` / `previousRefId`。Analytics 渠道表给转化率和广告花费单元格加了 testid |
| B3 | 样本不足的漏斗步骤仍会进入排序 | 成立：漏斗引擎标为低置信的步骤被映射成 `limited`，降档后仍然参与排序 | 低于该步骤自身 `minimumSessions` 的步骤改为 `insufficient`，从发现列表移出，改作 `below-minimum-sessions` 缺口返回。缺口里保留原始会话数和门槛，并附 `refIds`，数字仍可核对 |
| S1 | 切换漏斗渠道时，新标签会先出现在旧数字上方 | 成立 | Funnel 和 Analytics 的加载结果按「范围｜渠道｜截止日」打标签，结果与当前筛选不一致时显示加载状态 |
| S2 | 未知入参被静默丢弃（传 `sku` 会变成全站漏斗） | 成立：用的是 `z.object` | 四个工具改用 `z.strictObject`，未知字段返回 `invalid-input` 并列出字段名 |

关于审计是否按流量降档：采纳 Codex 的建议，保留两层判断。规则是否命中只看页面内容；修复的先后再考虑流量。审计工具新增 `priorityWindow` 字段，标明排序所用的流量窗口（默认 30 天，Recommendations 页是 90 天）。

### 7.1 新增测试

- 单元测试 +7：`audit-preview.test.ts`（6 个：未审计、当前、过期、改关键词、GEO 忽略关键词、不同种类）；`parsePreviewParam`（1 个）。
- 集成测试 +15：
  - `audit-preview.test.ts`（6 个）：预览与工具引用逐条一致；`save` 调用次数为 0，状态前后深度相等；审计当前时不显示预览；过期页反映修改；GEO 同样成立；页面不存在时返回 not-found。
  - `agent-tools.test.ts`（+9 个）：4 个工具都拒绝未知字段；CAC 发现引用 AOV、ROAS 发现引用广告花费；渠道比较双方引用均可解析，前一期截止于 08-01；漏斗比较双方引用均可解析；AI Referral 低于门槛的步骤（含结账步骤）不出现在发现和排序里，缺口带原始数字；全站结账步骤仍保留为发现。
- E2E +5 个 × 3 个浏览器：
  - 渠道工具返回的 57 个引用，在 `/analytics?range=30` 上逐个找到相同的数字；
  - SEO 和 GEO 的预览各一条：点开链接即可核对引用的检查（状态和 evidence）和分数，localStorage 前后逐字节相同，刷新后仍是预览；
  - 在预览页保存审计后，预览提示消失，分数不变；
  - 不带 preview 参数时仍显示未审计；
  - `?demo=slow` 下切换到 Email 时，加载期间页面上没有任何漏斗数字，加载完成后标签与 Email 的数字一致。
  - 另外，商品 E2E 增加了对购买会话、转化率和收入的核对。

### 7.2 变异测试（单文件）

| 文件 | 得分 |
|---|---|
| `audit-preview.ts` | 100%（第一轮有 4 个存活变异，来自冗余的关键词三元表达式和不可达的 null 检查，已简化掉） |
| `agent/links.ts` | 100% |
| `agent/refs.ts` | 100% |
| `url-params.ts` | 85.71%（4 个存活变异，均为等价变异，见第 3 节） |

### 7.3 修正后的门禁（本机，Node v24.18.0）

| 命令 | 结果 |
|---|---|
| `npm ci` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run test -- --run` | PASS：32 个文件，**623 个测试** |
| `npm run test:integration -- --run` | PASS：18 个文件，**359 个测试** |
| `npm run test:e2e` | PASS：**813 个测试**，3 个浏览器，1.4 分钟 |
| `npm run build` | PASS |

过程中有 1 次失败：新写的 GEO 预览 E2E 一开始选了 Ridgeline 帐篷，而这个商品在演示数据里没有任何 GEO 发现，断言「至少有一条引用」因此失败。改用有 GEO 发现的 Basecamp Tarp 后通过。这是测试样本选错了，不是功能缺陷。

---

## 8. 第二轮复核修正（Codex 复核 `3dac15d` 后）

逐条对照代码核实，全部成立，均不涉及范围、口径或权限的变化。

| # | 复核意见 | 修正 |
|---|---|---|
| 阻塞 | 低样本的步骤已经移出排序，但它的环比（如 30 天 AI Referral 结账 → 购买，本期 8 次、前期 10 次，门槛 60）仍带着两个有效引用，可能被引用为「下降」 | 新增纯函数 `comparisonEvidence()`（`src/domain/agent/priority.ts`），每个比较项都带 `evidence`：`strength`、`supportsConclusion`、两期原始样本和门槛。两期使用与单期发现相同的门槛，取较弱的一方；没有前一期时一律不支持结论。漏斗阶段的比较用该阶段自身的 `minimumSessions`；整体转化和渠道指标用 `ANALYTICS_THRESHOLDS`（会话 300 / 订单 25）。原始数字照常返回，Dispatch 19 的回答校验必须读取 `supportsConclusion` |
| 建议 | 前一期读取失败时，本期结果也一起丢失 | 渠道和漏斗工具改为本期优先：前一期失败时仍返回本期数据，`previous: null`，并附 `previous-window-unavailable` 缺口 |
| 建议 | 购买会话引用的口径键借用了转化率 | 新增 `product_purchase_sessions` 计数定义 |
| 可选 | 浏览器测试补一个过期场景 | 新增 E2E：先保存审计、再修改 meta 标题，然后打开证据链接，预览显示新内容的检查结果（标明原因是「older content」）；打开前后 localStorage 不变；普通审计页仍显示 stale |

口径决定：按 Codex 的建议维持原规则。渠道订单少于 25 仍是「低置信，降一档」，回答中要显示样本量；漏斗阶段低于最低进入会话数则只作为缺口。两条规则各有既定含义。

### 8.1 新增测试

- 单元测试 +7：`weakerStrength` 1 个；`comparisonEvidence` 6 个（两期都达标、只有本期不足、只有前期不足、两期都不足且保留原始样本、订单不足时为 limited、没有前一期）。
- 集成测试 +5：
  - 渠道比较：每个渠道的 `supportsConclusion` 等于「两期会话都 ≥ 300」，且样本与数据一致；Email 不支持结论。
  - 前一期失败时，渠道工具的本期结果不变，并附缺口。
  - AI Referral 结账步骤：两期都低于 60，方向仍然计算出来，但 `evidence` 标为 insufficient 并保留原始样本。
  - 全站漏斗：每个阶段的比较是否支持结论，与两期样本对门槛的判断一致；整体转化支持结论。
  - 前一期失败时，漏斗工具的本期结果不变。
  - 另外，商品工具的已有用例里补充断言购买会话引用的定义和单位。
- E2E +1 个 × 3 个浏览器：过期审计的预览。

### 8.2 变异测试

`priority.ts` 得分 91.01%，8 个存活变异均为等价变异：原有 6 个见第 3 节；新增 2 个，一个是 `STRENGTH_ORDER` 首项改成空字符串后 `indexOf` 返回 -1，仍是最小值；另一个是 `<=` 改成 `<`，只在两边相等时生效，而这时返回的是同一个值。

### 8.3 门禁（本机，Node v24.18.0）

| 命令 | 结果 |
|---|---|
| `npm ci` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run test -- --run` | PASS：32 个文件，**630 个测试** |
| `npm run test:integration -- --run` | PASS：18 个文件，**364 个测试** |
| `npm run test:e2e` | PASS：**816 个测试**，3 个浏览器，1.3 分钟 |
| `npm run build` | PASS |

本轮没有出现失败。

### 8.4 交给 Dispatch 19 的约束

- 回答里说某个指标「上升」或「下降」，必须引用一个 `ComparedMetric`，且其 `evidence.supportsConclusion === true`；否则只能陈述两期的原始数字，并说明样本不足。
- 发现为 `limited` 时，回答中要显示样本量。
- 带 `refIds` 的缺口可以引用原始数字，但不能作为结论。

---

**本阶段完成。已停止，等待确认下一 Dispatch。**
