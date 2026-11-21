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

**本阶段完成。已停止，等待确认下一 Dispatch。**
