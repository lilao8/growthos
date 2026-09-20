# Dispatch 4 — PASS

执行日期：2026-09-20　｜　环境：macOS (darwin 25.6.0)、Node v24.18.0、npm 11.16.0

## 1. 本次完成内容

对照 `docs/04-geo-audit.md` 的范围与验收标准逐条说明。

**10 条规则，每条都绑定一个可观察的代理信号**（不存在模糊的"AI 判断"）：

| 规则 | 读取的信号 |
|---|---|
| topic clarity | H1 是否存在，及其与 meta title 的词汇重叠率 |
| direct answer availability | 显式 `directAnswer` 字段，长度是否足以独立成句，是否含具体数字 |
| FAQ coverage | 问答对数量（答案非空才计入） |
| heading structure | 恰好一个 H1、至少两个章节标题、无跳级 |
| factual density | 带标签且有值的规格事实数量 |
| entity clarity | 品牌名是否出现在标题/内容，结构化数据是否有商品标识 |
| structured product facts | Product 标记的 name / sku / price / priceCurrency / availability |
| source/evidence presence | 引用来源数量，是否带可解析 URL |
| original information | 原创声明 + 支撑材料（证据或自测事实） |
| extractability | 可直接摘取的结构数量（直接回答 / 事实表 / FAQ / 章节标题），并扣减无量化的营销话术 |

**评分：** 每条 10 / 5 / 0 分，等权，`score = round(100 × 已得分 / (可评估条数 × 10))`。**输入根本没采集到的规则返回 Unknown，同时从分子和分母中移除**——不计 0，因为"页面没有 FAQ"和"我们没采集 FAQ"是两件事。零可评估项返回 null。

**明确标注的三条模型局限**（写在页面上，不是注释里）：原创性只能检查"是否有声明和支撑材料"，无法验证真伪；有来源不等于来源可靠；关键词命中不等于语义理解。

**强制免责声明。** 页面显著位置（不是脚注）显示：*This score is an internal heuristic designed to evaluate content readiness for generative search systems.*，并补充：不是任何公司的算法、高分不保证被引用、不调用 AI API。

**展示。** GEO Score、AI Readiness（Strong / Moderate / Weak / Poor，描述内容就绪度而非引用概率）、Pages 表、Recommendations 表、ruleVersion（`geo-1.0.0`）、coverage。

**与 SEO 引擎解耦。** 两个引擎各有 config / rules / engine / service / UI 组件与独立的数据加载。**指纹按审计类型区分**：SEO 读商品关键词所以关键词变更会让 SEO 结果 stale；GEO 不读关键词，所以关键词变更不会让 GEO 结果 stale——否则就是让用户去重做一件不可能改变结果的事。

**验收标准对照：**

| 验收项 | 落实方式 |
|---|---|
| 好内容 / 空内容 / 只有营销话术 / 缺事实证据 / 缺 FAQ / 标题混乱 / 缺原创材料有可解释差异 | 单元测试每种情形独立断言分值；浏览器实测分数跨度 0–100 |
| unit 覆盖全部 10 条、边界、非法输入、稳定性 | 50 条单元测试，含阈值边界、`null`/字符串/数字混入结构化数据、相同输入 JSON 完全一致 |
| 固定样例展示明确改动与分数变化 | 专项测试：删掉 FAQ → 该规则 10→0，总分 100→90，且逐项验算 |
| 页面免责声明、规则证据与缺失数据提示清晰 | 每条规则显示"Signal read / What to add / Evidence"；E2E 断言免责声明四段文案 |
| integration 验证保存/审计一致性 | 编辑 → 快照 → stale → 重跑闭环；商品行同源显示 GEO 分数与 stale |
| E2E 验证页面可读和重跑 | 20 条 E2E |
| 与 SEO 引擎解耦，单个引擎失败不显示另一个的伪造成功 | 集成测试：GEO 读取失败时 SEO 仍正常返回真实结果；跑 GEO 不会凭空产生 SEO 结果。**浏览器实测同屏可见** |

## 2. 修改的核心文件

**新增 — 引擎（纯函数）**

| 文件 | 目的 |
|---|---|
| `src/domain/geo-audit/config.ts` | 阈值、规则 ID 与信号说明、就绪度分档、免责文案、`GEO_RULE_VERSION`；文件头写明模型是什么、不是什么 |
| `src/domain/geo-audit/rules.ts` | 10 条规则 |
| `src/domain/geo-audit/engine.ts` | `runGeoAudit`、`scoreGeoChecks` |

**新增 — 服务与 UI**

`src/services/geo-audit-service.ts`、`src/components/geo/{geo-overview-view,geo-page-view,geo-disclaimer}.tsx`、`src/components/dashboard/geo-health-view.tsx`、`src/app/geo/[pageId]/page.tsx`。

**修改**

| 文件 | 修改目的 |
|---|---|
| `src/domain/types.ts` | `AuditCheck` 增加 `points`（GEO 按分档计分，SEO 传 null） |
| `src/domain/schemas.ts` | 校验 `points` |
| `src/repositories/types.ts` | **SCHEMA_VERSION 2 → 3** |
| `src/domain/audit-fingerprint.ts` | 指纹按 `AuditKind` 区分，GEO 不含关键词 |
| `src/services/product-service.ts` | 商品行的 geoScore / geoStale 接入真实审计 |
| `src/components/products/*` | 列表 GEO 分数带 Stale 徽标；详情页分别链接两个审计并分别说明各自的审计时间 |
| `src/app/geo/page.tsx`、`src/app/dashboard/page.tsx`、`nav-items.ts` | 页面与导航接入 |

## 3. 测试结果

`rm -rf node_modules .next` 后按顺序一次跑通，整体退出码 0。完整日志：scratchpad 的 `gates-d4.log`。

| 命令 | 结果 | 实际数量 | 相比 Dispatch 3 |
|---|---|---|---|
| `npm ci` | PASS | 428 packages | — |
| `npm run lint` | PASS | 0 problems | — |
| `npm run typecheck` | PASS | 无输出 | — |
| `npm run test -- --run` | PASS | **13 文件 / 205 通过，0 失败 0 跳过** | +50 |
| `npm run test:integration -- --run` | PASS | **8 文件 / 135 通过，0 失败 0 跳过** | +21 |
| `npm run test:e2e` | PASS | **79 通过，0 失败 0 跳过** | +21 |
| `npm run build` | PASS | 15 条路由 | — |

**过程中真实失败 2 次：**

1. 加 `points` 字段后一个既有 SEO 测试辅助函数类型不完整 → 补齐。
2. 一条 E2E 假设 TrailCell 草稿页的 topic-clarity 会返回 Unknown，实际是 5 分——因为快照 builder 的 h1 默认回退到商品标题，该页只是缺 title。**改的是测试断言而不是规则**，同时发现：当前 17 个页面没有任何一条 GEO 规则会触发 Unknown（快照的内容字段都采集了，coverage 全部 100%）。Unknown 路径由单元测试覆盖（topic clarity 与 extractability 各一条）。这条记在已知问题 3。

## 4. 验收证据

**浏览器人工核对**（生产构建 + `next start`，1440px，实际点击"Run GEO audit on all pages"）：

审计 17 个页面后：**GEO score 61、AI readiness Moderate、Rules not yet met 76、Rules fully met 94**。

手工验算：17 页 × 10 条 = 170 条规则；76 + 94 = 170，未评估 0 条 ✓。

分数分布（实测，覆盖 0–100 全区间）：

| 页面 | 分数 | 档位 | 满分 / 部分 / 未达 |
|---|---|---|---|
| Ridgeline 2P、Traverse 55L | 100 | Strong | 10 / 0 / 0 |
| Summit 0 Expedition、Ridgeline 3P | 95 | Strong | 9 / 1 / 0 |
| Emberlite Canister Stove | 85 | Strong | 8 / 1 / 1 |
| Ridgeline Rain Shell | 70 | Moderate | 7 / 0 / 3 |
| 多数页面 | 65 | Moderate | 6 / 1 / 3 |
| Traverse 35L Daypack | 45 | Weak | 3 / 3 / 4 |
| Trailhead 1P（已下架） | 40 | Weak | 2 / 4 / 4 |
| Basecamp Tarp | 15 | Poor | 0 / 3 / 7 |
| TrailCell（草稿） | 10 | Poor | 0 / 2 / 8 |
| **Summit 20 Down Sleeping Bag** | **0** | Poor | 0 / 0 / 10 |

Summit 20 得 0 分可逐条解释：无 H1、无直接回答、无 FAQ、无标题结构、无事实、正文不提品牌、无结构化数据、无来源、无原创声明、无可摘取结构——十条全部未达标。详情页实测 COVERAGE 100%、RULES FULLY MET 0/10，每条都给出 Signal read / What to add / Evidence。

**引擎独立性——浏览器同屏实测：** 只跑 GEO 审计后打开 Dashboard，**SEO health 显示 N/A 与"No page has been audited yet"，GEO readiness 显示 61 Moderate**。一个模块的结果不会冒充另一个。

**免责声明实测：** GEO 概览页与详情页均在卡片顶部显示规定原文，并列出三条局限。

**未运行：** 截图未落盘（Dispatch 9 范围）；Firefox / WebKit 未跑；未做屏幕阅读器实测；768px 未人工查看。

## 5. 当前已知问题

**必要偏离与原因：**

1. **`AuditCheck` 新增 `points` 字段，`SCHEMA_VERSION` 2 → 3。** GEO 按每条 0/5/10 计分，SEO 按状态加权，两者无法共用同一种计分表达。SEO 的 `points` 一律为 null。旧存储会被识别为 schema 过旧并回落种子数据。
2. **指纹按审计类型区分。** GEO 不读商品关键词，因此只改关键词时 GEO 结果不标 stale。这是刻意的：把 GEO 标成 stale 会让用户去重跑一次必然得出相同结果的审计。集成测试专门锁定了这条（改关键词后 `seoStale === true` 而 `geoStale === false`）。
3. **当前演示目录不会触发 GEO 的 Unknown。** 17 个页面的 coverage 都是 100%，因为快照的内容字段全部采集到了。Unknown 的代码路径由单元测试覆盖（topic clarity 缺标题且缺 H1 且无 headings；extractability 正文未采集且无 headings），但**没有端到端的真实样本**。如果希望 GEO 的覆盖率提示在演示中可见，需要在目录里加一个内容未采集的页面——本阶段没有加，因为那会改动 SEO 的既有基线。
4. **`entity-clarity` 用品牌名的字符串匹配判断实体是否清晰。** 这是代理信号而非语义理解：一个页面可以反复提"NorthTrail"却依然说不清自己是什么。规则说明里写了这是代理信号，但解释时需要主动说明。
5. **`extractability` 的营销话术检测是固定词表**（best / amazing / incredible 等 10 个词）。覆盖不全，且对非英语内容无效。词表在 config 里可配置。
6. **AI Readiness 的四档阈值（80/55/30）是拍出来的**，没有外部依据——生成式搜索没有公开基准可对齐。阈值集中在 config，档位文案明确说的是"内容结构"而非"被引用概率"。这一点在面试中会被问，需要照实回答。
7. **GEO 概览的组合分数与 SEO 一样是页面算术平均**，高流量页与零流量页同权。

**上游兼容问题**（不变）：TypeScript 固定 6.0.3；ESLint 显式声明 React 版本；`unrs-resolver` postinstall 被拦截。

**未提交的动作：** 未配置远程、未 push、未部署。

除上述条目外，**无已知阻塞问题**。

## 6. 下一 Dispatch 建议

Dispatch 5：Content Planner（`docs/05-content-planner.md`）。字段含 id、topic、primaryKeyword、secondaryKeywords、searchIntent、funnelStage、contentType、status、targetProduct、seoOpportunity、geoOpportunity、productRelevance；内容列表、筛选、创建、编辑、状态管理，持久化并校验关联商品存在。

Content Opportunity Score 是独立纯函数：`0.35×SEO + 0.25×GEO + 0.20×commercialIntent + 0.20×productRelevance`，意图映射 Informational=40 / Commercial=80 / Transactional=100 / Navigational=30。

有一处需要特别注意：**`seoOpportunity` 与 `geoOpportunity` 是编辑者手填的机会判断，不是本阶段和上一阶段产出的审计分数**，两者必须在界面上区分清楚，否则会被误读为"审计分参与了机会评分"。

本阶段可复用的基础：`DemoState` 持久化与 schema 校验模式、表单校验与失败保留输入的模式（`product-seo.ts` + `seo-metadata-form.tsx`）、列表筛选模式（`product-filters.ts` + `products-view.tsx`）。ContentIdea 类型在 Dispatch 0 已定义，需补 `productRelevance` 并加入 `DemoState`（又一次 schema 升版）。

仅为建议，等待用户确认。

## 7. 状态

本阶段全部门禁通过，**Dispatch 4 完成**。

已停止，等待用户确认下一 Dispatch。
