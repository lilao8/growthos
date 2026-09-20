# Dispatch 3 — PASS

执行日期：2026-09-20　｜　环境：macOS (darwin 25.6.0)、Node v24.18.0、npm 11.16.0

## 1. 本次完成内容

对照 `docs/03-seo-audit.md` 的范围与验收标准逐条说明。

**12 条规则的审计引擎。** meta title（存在 / 长度）、meta description（存在 / 长度）、H1、URL slug、canonical、image alt、internal links、structured data、indexability、keyword usage。输入是 PageSnapshot，不抓网站；每项返回 ruleId、status、severity、message、explanation、recommendation、evidence。

**状态语义严格区分四态：** `pass` 满足、`warning` 可用但超出项目建议、`error` 缺失或错误、`unknown` **无法评估**。unknown 既不算通过也不算失败，直接排除在评分之外并体现为覆盖率下降。

**具体判定规则（不只检查"有没有"）：**

- 缺 meta 为 error；长度超建议为 warning；**缺 meta 时长度规则返回 unknown**，不假装通过。
- H1 缺失 error（critical），多个 H1 也是 error，证据列出全部 H1 文本。
- slug 非小写连字符格式为 error；过长为 warning；URL 无法解析为 unknown。
- canonical 缺失 / 不可解析为 error；**指向其他页面为 warning 并同时给出两个 URL**；自指（含尾斜杠差异）为 pass。
- 图片：非装饰图缺 alt 属性为 error，空 alt 为 warning，**装饰图空 alt 允许**；无非装饰图时 unknown。
- 内链为 0 是 error；锚文本为空或"click here"这类泛词是 warning；只有 1 条也是 warning。
- **结构化数据验证必填字段与类型**：无数据 error；有数据但无 Product 条目 error；缺 `@context`/`name`/`offers.price`/`offers.priceCurrency` error 并列出缺的字段；只缺 `sku`/`availability` 为 warning。
- **robots 未知与 noindex 明确区分**：unknown 走"未采集"，noindex 是 warning 且建议文案写明"this audit will not change it for you"。

**评分（独立纯函数）。** 可评估项等权，pass=1、warning=0.5、error=0，`score = round(100 × 已获分 / 可评估项数)`，零可评估项返回 null。同时返回 coverage、evaluableCount、totalCount、ruleVersion（`seo-1.0.0`）。

**stale 机制（补上了 Dispatch 2 的遗留缺口）。** 审计存储 `inputFingerprint`——快照中审计真正读取的字段加主关键词的 FNV-1a 哈希。**stale 不是存储的标志位，而是每次读取时与当前快照比对得出的**，因此一份结果不可能在页面已经改动后还自称最新。编辑商品元数据 → 快照同步 → 指纹变化 → 自动 stale；重新审计后替换旧结果（同页同类型只保留一条，不累积）。

**三个视图 + Dashboard 接入。** `/seo` 含 Audit status（4 项指标 + stale 横幅 + 免责声明）、Pages 表、Issues 表；`/seo/[pageId]` 是页面详情审计。Dashboard 新增 SEO health 区块（SEO Score、Critical Issues、Warnings、Passed Checks），**调用的是同一个 `loadSeoOverview` service，不存在两套计算**，并有链接跳转。

**验收标准对照：**

| 验收项 | 落实方式 |
|---|---|
| 完整页、缺 title、title 过长、缺 description、缺 alt、无结构化数据、noindex 有预期结果 | 单元测试逐条覆盖，另加 E2E 实测 |
| 长度边界 | 30/60/70/160 四个边界值均断言 pass |
| 未知字段 | robots unknown、无图片、无关键词、URL 不可解析四种 unknown 场景 |
| 全空输入 | `scoreChecks([])` 与全 unknown 均返回 null |
| 评分上下界 | 全 pass=100、全 error=0、四舍五入 67、范围断言 |
| 装饰图片 | 装饰图空 alt 判 pass |
| 重复运行一致性 | 相同输入 JSON 完全一致；指纹一致 |
| 问题可定位页面、规则、证据、建议 | 集成测试逐条断言四个字段非空 |
| 汇总不重复计数 | 断言 issue 唯一键无重复，且 `issues.length === critical + warnings` |
| 注明平均分所用页面范围 | 界面写明"Mean of N of M audited page score(s)"，未审计页排除而非计 0 |
| integration 验证编辑→快照→stale→重跑 | 5 条专项测试 |
| E2E 验证详情审计与 Dashboard 链接 | 20 条 E2E |

## 2. 修改的核心文件

**新增 — 引擎（纯函数）**

| 文件 | 目的 |
|---|---|
| `src/domain/seo-audit/config.ts` | 阈值、规则 ID、规则说明、`SEO_RULE_VERSION`，全部集中一处 |
| `src/domain/seo-audit/rules.ts` | 12 条规则实现 |
| `src/domain/seo-audit/engine.ts` | `runSeoAudit`、`scoreChecks`、`tallyChecks`、`averageScore` |
| `src/domain/audit-fingerprint.ts` | FNV-1a 指纹，用于判定 stale |
| `src/domain/audit-lookup.ts` | 读取时计算 stale；`upsertAudit` 保证同页同类型只有一条 |

**新增 — 服务与 UI**

`src/services/seo-audit-service.ts`、`src/components/seo/{seo-overview-view,seo-page-view,check-status,seo-disclaimer}.tsx`、`src/components/dashboard/seo-health-view.tsx`、`src/app/seo/[pageId]/page.tsx`。

**修改**

| 文件 | 修改目的 |
|---|---|
| `src/domain/types.ts` | 拆分 `StoredAuditResult`（持久化）与 `AuditResult`（含计算出的 stale） |
| `src/domain/schemas.ts` | 新增审计校验 schema |
| `src/repositories/types.ts` | `DemoState` 增加 `auditResults`，**SCHEMA_VERSION 1 → 2** |
| `src/services/product-service.ts` | 商品行的 seoScore 改为读取真实审计结果，新增 seoStale |
| `src/components/products/*` | 列表显示分数与 Stale 徽标；详情页显示分数、审计时间并链接到审计页 |
| `src/app/dashboard/page.tsx` | 挂载 SEO health 区块 |

## 3. 测试结果

`rm -rf node_modules .next` 后按顺序一次跑通，整体退出码 0。完整日志：scratchpad 的 `gates-d3.log`。

| 命令 | 结果 | 实际数量 | 相比 Dispatch 2 |
|---|---|---|---|
| `npm ci` | PASS | 428 packages | — |
| `npm run lint` | PASS | 0 problems | — |
| `npm run typecheck` | PASS | 无输出 | — |
| `npm run test -- --run` | PASS | **12 文件 / 155 通过，0 失败 0 跳过** | +60 |
| `npm run test:integration -- --run` | PASS | **7 文件 / 114 通过，0 失败 0 跳过** | +21 |
| `npm run test:e2e` | PASS | **58 通过，0 失败 0 跳过** | +20 |
| `npm run build` | PASS | 13 条路由 | — |

**过程中真实失败 3 次：**

1. 单元测试中"完整页面"的基线快照标题不含目标关键词，导致基线本身不是满分。修的是测试数据，不是规则。
2. 见下方已知问题 1：keyword-usage 规则判定过严，**在浏览器可视核对时才发现**，改规则后有一条新测试的场景构造不严谨（覆盖了 h1 却没覆盖 headings，而 headings 也参与内容匹配），修正测试场景。

## 4. 验收证据

**浏览器人工核对**（生产构建 + `next start`，1440px，实际点击"Run audit on all pages"）：

审计 17 个页面后：**Average SEO score 84、Critical issues 15、Warnings 30、Passed checks 155**。

手工验算：17 页 × 12 条 = 204 项检查；15 + 30 + 155 = 200，余 4 项 unknown。这 4 项可逐一说明——TrailCell（草稿页）无 metaTitle/metaDescription 各产生 1 项长度 unknown、无主关键词产生 1 项 keyword unknown，Summit 20 的 robots 未采集产生 1 项。**数字对得上，不是估算。**

分数分布（节选，均为实测）：

| 页面 | 分数 | 错误 | 警告 | 通过 | 未评估 |
|---|---|---|---|---|---|
| Waypoint Baseplate Compass | 100 | 0 | 0 | 12 | 0 |
| Ridgeline 2P / Traverse 55L / Beacon 400 | 96 | 0 | 1 | 11 | 0 |
| Basecamp Ultralight Tarp Shelter | 71 | 2 | 3 | 7 | 0 |
| **Summit 20 Down Sleeping Bag** | **41** | 5 | 3 | 3 | 1 |
| **TrailCell Rechargeable Lantern**（草稿） | **28** | 6 | 1 | 2 | 3 |

Summit 20 详情页实测：SCORE 36→41、COVERAGE 92%（11/12 可评估）。手工验算旧值：6 error(0) + 2 warning(1.0) + 3 pass(3.0) = 4.0 / 11 = 36.36 → 36 ✓。

Issues 表实测 45 条，与 15 + 30 一致 ✓。每条列出页面、规则、状态、严重度、结论、证据（如 `canonical: absent`、`internalLinks: 0`、`/images/summit-20-down-sleeping-bag-1.jpg`）。

**未运行：** 截图未落盘（Dispatch 9 范围）；Firefox / WebKit 未跑；未做屏幕阅读器实测；768px 未人工查看（375px 与 1440px 已由 E2E 或人工覆盖）。

## 5. 当前已知问题

**必要偏离与原因：**

1. **keyword-usage 规则在本阶段内被改过一次，起因是浏览器可视核对。** 初版只做整词组精确匹配，结果 17 个商品里有 12 个被判 error——例如标题 `Ridgeline 2P Backpacking Tent` 对关键词 `2 person backpacking tent`，因为 "2P" ≠ "2 person"。这是**规则产生的错误判定**，不是数据问题：页面显然就是讲这个的。改为两级匹配——逐字出现在标题且出现在内容为 pass；只是词都在但短语没出现为 warning；关键词的词在页面上几乎不存在（覆盖率 < 50%）仍为 error。同时把 headings、FAQ 与规格表纳入"页面内容"，因为那些也是读者看得见的文字。改动后 error 从 27 降到 15，其余转为 warning。
   **需要说明的是：我是在看到结果不合理之后才改规则的。** 判断依据是规则本身的目标（"页面是否使用了它所针对的查询"），不是为了让分数好看——关键词完全不存在时仍然判 error，单元测试有专门用例锁定。
2. **`SEO_RULE_VERSION` 保持 `seo-1.0.0` 未升版。** 按 `config.ts` 自己写的纪律，规则判定逻辑变更应升版；但这次变更发生在同一个 Dispatch 内、规则集从未对外发布、也没有任何已持久化的旧结果。版本纪律从本阶段交付起生效。
3. **`SCHEMA_VERSION` 从 1 升到 2。** 新增 `auditResults`。旧版本的浏览器存储会被识别为"schema 过旧"并回落到种子数据——这条路径 Dispatch 0 就有测试覆盖。对演示项目可接受，但真实产品需要迁移逻辑。
4. **`stale` 不是存储字段而是读取时计算。** 类型拆成 `StoredAuditResult` 与 `AuditResult`。这样比存标志位更可靠：任何改动路径都不会漏标。代价是每次读取要算一次哈希（17 个页面，可忽略）。
5. **Dashboard 的 SEO 区块在加载失败时静默不显示。** 理由是 SEO 数据出问题不该让 Dashboard 的六项业务指标一起垮掉。但这意味着用户可能不知道那里本该有内容——Dispatch 9 统一打磨时应改为显示一个轻量的错误提示。
6. **平均分是页面分数的算术平均**，每个已审计页面权重相同，与页面流量无关。界面写明了覆盖范围（"Mean of N of M audited page score(s)"），但高流量页面和零流量页面同权，解释时需要说清楚。

**上游兼容问题**（不变）：TypeScript 固定 6.0.3；ESLint 显式声明 React 版本；`unrs-resolver` postinstall 被拦截。

**未提交的动作：** 未配置远程、未 push、未部署。

除上述条目外，**无已知阻塞问题**。

## 6. 下一 Dispatch 建议

Dispatch 4：GEO Audit（`docs/04-geo-audit.md`）。10 条规则评估内容对生成式搜索的就绪度：topic clarity、direct answer availability、FAQ coverage、heading structure、factual density、entity clarity、structured product facts、source/evidence presence、original information、extractability。每项 0/5/10 分，总分 0–100，输入缺失返回 Unknown 并展示覆盖率。

本阶段已经铺好的基础可直接复用：`AuditResult`/`StoredAuditResult` 类型与持久化、`audit-lookup` 的 stale 与 upsert（`kind: 'geo'` 即可共用）、`audit-fingerprint`、`check-status` 组件、页面详情的展示结构。GEO 只需新增自己的 config + rules + service。

快照里已备好 GEO 所需的字段：`directAnswer`、`faq`、`facts`、`evidence`、`originalityClaim`，且深浅不一——Ridgeline 2P 与 Emberlite 炉头齐全，Summit 20 与 Basecamp 帐篷几乎全空。

另外提醒：`docs/04-geo-audit.md` 要求页面显著位置写明 "This score is an internal heuristic designed to evaluate content readiness for generative search systems."，且不得声称能测量真实 AI 引用概率。

仅为建议，等待用户确认。

## 7. 状态

本阶段全部门禁通过，**Dispatch 3 完成**。

已停止，等待用户确认下一 Dispatch。
