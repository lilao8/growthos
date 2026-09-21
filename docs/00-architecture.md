# Dispatch 0：项目架构

## 目标

完成项目扫描和架构决策，并在用户确认后建立可验证的最小工程。

## 前置条件

已阅读总 Prompt，首次方案经用户确认后才开始初始化。

开始前阅读 `README.md`、`CLAUDE.md`、`docs/00-architecture.md`、本文件与相关代码；以当前项目为准，不假设前序实现。全局愿景不等于本阶段授权。

## 范围

- 初次只读规划：推荐架构、数据模型、页面结构、业务实体、Dispatch 计划、测试策略、MVP 与后续边界；输出后停止。
- 用户确认执行本阶段后：初始化或兼容现有工程、strict TypeScript、最小启动页、测试框架和质量脚本。没有业务页面也要有启动 smoke test。
- 划分 UI / services / domain / repositories / fixtures / tests；规划 Product、PageSnapshot、AuditResult、ContentIdea、SessionFact、Order、OrderItem、ChannelSpend、Recommendation。
- 决定数据适配器、持久化方式、demo reset、固定 demoAsOf、金额和日期策略；此时只建最小合同与小型 fixture，不生成全套业务。
- 在本文件追加“实施记录”：实际技术版本、包管理器、目录与路由图、实体关系、服务接口、指标定义、架构取舍、测试启动说明。保留任务要求。
- 安装依赖后固定 lockfile，建立后续模块占位路由约定。

## 明确禁止提前实现的内容

- 不实现 Dashboard 指标卡、商品 CRUD、SEO/GEO 引擎、图表、内容工作流或建议中心。
- 不连接真实数据源，不引入登录、多租户或生产数据库运维。
- 不进入后续 Dispatch；若当前任务依赖尚未实现的后续能力，使用有说明的占位或接口，不扩展实现。

## 验收标准

- 架构计划覆盖全部 8 个模块；0–9 的依赖清晰，尚未实现功能明确标注。
- 全新环境可按说明安装、启动、构建；strict 和所有约定脚本真实可用。
- 至少一个有实际断言的 unit、integration、启动页 E2E 测试通过；适配器 fixture 的输入校验与读写合同可验证。
- 架构实施记录足以指导下一阶段，无空命令或假通过。

## 测试命令

从应用根目录运行；Dispatch 0 必须先建立这些真实脚本，后续阶段沿用。约定 Vitest 与 Playwright，已有不同框架则按阶段 0 记录使用等价命令。

```bash
npm run lint
npm run typecheck
npm run test -- --run
npm run test:integration -- --run
npm run test:e2e
npm run build
```

按上面的验收场景增加当前阶段测试，同时保留此前回归。命令失败须修复并重新运行；无环境、无测试用例、跳过测试不能计为通过。当前阶段报告中记录实际命令、结果及浏览器验收证据。

## 完成后的汇报格式

保存到 `docs/reports/dispatch-00.md`，并在会话输出：

```text
Dispatch 0 — PASS / FAIL / BLOCKED

1. 本次完成内容：对应范围和验收项逐条说明。
2. 修改的核心文件：路径 + 修改目的。
3. 测试结果：命令、实际通过/失败/跳过数量、构建结果；附关键日志或证据位置。
4. 验收证据：关键操作、数据核对、截图或人工检查结果；区分已实测与未运行。
5. 当前已知问题：缺陷、环境限制、必要偏离及原因；没有则明确“无已知阻塞问题”。
6. 下一 Dispatch 建议：Dispatch 1：基础框架与 Dashboard（仅建议，等待用户确认）。
7. 状态：已停止，等待用户确认；如未通过则明确本阶段尚未完成。
```

---

# 实施记录（Dispatch 0）

> 本节由执行 Dispatch 0 的会话追加，记录实际落地结果。上方任务要求保持不变。

## 实际技术版本

| 项目 | 选型 | 版本 |
|---|---|---|
| 运行环境 | Node.js | v24.18.0 |
| 包管理器 | npm（唯一锁文件 `package-lock.json`） | 11.16.0 |
| 框架 | Next.js（App Router，Turbopack 构建） | 16.3.5 |
| UI 运行时 | React / React DOM | 19.3.x |
| 语言 | TypeScript | **6.0.3（固定）** |
| 样式 | Tailwind CSS + @tailwindcss/postcss | 4.3.x |
| 校验 | Zod | 4.6.x |
| Lint | ESLint + eslint-config-next（flat config） | 10.11.0 / 16.3.5 |
| 单元 / 集成测试 | Vitest | 5.0.1 |
| E2E | Playwright（chromium） | 1.63.0 |

尚未安装的依赖：shadcn/ui、Recharts、React Hook Form。它们在真正需要的阶段再引入（Dispatch 1 起），避免装了不用。

### 两处被迫的版本取舍

1. **TypeScript 固定在 6.0.3，不用 7.0。** typescript-eslint 目前不支持 TS 7.0 API，装 7.0 会让 `npm run lint` 直接崩溃。升级前提是 typescript-eslint 发布 TS 7 支持。
2. **eslint.config.mjs 显式声明 `settings.react.version = '19.3'`。** eslint-config-next 内置的 eslint-plugin-react 用了 ESLint 10 已移除的版本探测 API，显式声明可以绕过这条代码路径。

## 目录与路由

```
src/app/            页面与布局（当前只有启动页）
src/components/     通用 UI（Dispatch 1 起使用）
src/services/       组合 repository 与 domain，产出页面视图模型
src/domain/         纯函数与类型：types / schemas / metrics / money / demo-window / seed
src/repositories/   持久化契约与两个适配器
src/fixtures/       固定种子演示数据
tests/unit/         纯函数单元测试
tests/integration/  适配器与服务的真实边界测试
e2e/                Playwright 关键路径
```

依赖方向单向向下：`app → services → repositories → fixtures`，`domain` 可被任意层引用但不反向依赖任何一层。

### 路由规划

| 路由 | 模块 | 计划阶段 | 当前状态 |
|---|---|---|---|
| `/` | 启动页 | Dispatch 0 | **已实现** |
| `/dashboard` | Dashboard | Dispatch 1 | 未实现 |
| `/products`、`/products/[id]` | Products | Dispatch 2 | 未实现 |
| `/seo`、`/seo/[pageId]` | SEO Audit | Dispatch 3 | 未实现 |
| `/geo`、`/geo/[pageId]` | GEO Audit | Dispatch 4 | 未实现 |
| `/content` | Content Planner | Dispatch 5 | 未实现 |
| `/analytics` | Analytics | Dispatch 6 | 未实现 |
| `/funnel` | Conversion Funnel | Dispatch 7 | 未实现 |
| `/recommendations` | Recommendations | Dispatch 8 | 未实现 |
| `/about-project` | 项目说明 | Dispatch 9 | 未实现 |

启动页按上表列出 8 个模块并标注「Not implemented yet」，不做假页面。

## 实体关系

全部 9 个实体的类型已在 `src/domain/types.ts` 定义，Dispatch 0 只有 Product 与 PageSnapshot 进入 fixture 和持久化。

```
Product 1─1 PageSnapshot 1─N AuditResult（kind = seo | geo，带 stale 标记）
Product 1─N ContentIdea.targetProductId
SessionFact N─1 landingPageId；SessionFact 0..1─1 Order 1─N OrderItem N─1 Product
ChannelSpend（date × channel 唯一）
Recommendation ← SEO / GEO / Content / Analytics / Funnel 规则输出
```

关键约束（已写进类型与 schema）：

- Product **不存储** seoScore、geoScore、organicSessions、conversionRate、revenue。这些是派生视图字段，由 service 计算，禁止通过表单手改。
- SessionFact.stages 必须是 `FUNNEL_STAGES` 的**有序前缀**，schema 会拒绝乱序或跳级序列，不静默修复。
- PageSnapshot 的 `indexability` 有 `unknown` 这个一等值；缺数据必须报告覆盖缺口，不能算 pass。
- Order 的 revenue = 已支付商品金额 − 折扣，不含税费运费；MVP 不建模退款。

## 服务与持久化合同

```ts
interface DemoStateRepository {
  load(): Promise<StateLoadResult>;   // status: loaded | empty | corrupted | unavailable
  save(state: DemoState): Promise<void>;
  reset(): Promise<StateLoadResult>;  // 仅由用户显式触发
}
```

**不接数据库，也不为数据库预留迁移接口。** 这一层存在的理由是两个当下就成立的问题：服务端渲染读不到浏览器存储（返回 `unavailable` 并回落到 seed，而不是渲染空页面），以及测试需要一个不是 localStorage 的后端。

适配器：

- `createMemoryStateRepository` — 测试与服务端渲染使用；内部存编码后的字符串，与浏览器适配器走同一条序列化路径。
- `createBrowserStateRepository` — localStorage；键统一加命名空间前缀，`reset()` 只删本项目的键，不会清掉同源下其他数据。E2E 通过 `NEXT_PUBLIC_GROWTHOS_STORAGE_NAMESPACE=growthos.e2e` 隔离。

数据校验：`SCHEMA_VERSION = 1`。写入前先编码，非法状态直接抛错，不会写坏数据；读取时区分「JSON 损坏」「schemaVersion 不匹配」「结构合法但违反领域规则」三种情况，都回落到 seed 并带上可展示的原因。

## 指标与数据口径

- `demoAsOf = 2026-08-31`（固定，不是「今天」）。90 天窗口为 **2026-06-03 → 2026-08-31**，含首尾，UTC。7/30/90 天共用同一结束日。
- 金额一律整数分（`Cents`），`assertCents` 在边界拒绝小数，`apportionCents` 保证折扣分摊后各行之和等于总额。展示时才 `formatCents`。
- 所有比率走 `safeRatio`：分母为 0 或输入非有限值返回 `null`（UI 显示 N/A），有效分母下零分子返回 `0`。禁止 Infinity / NaN。
- 汇总用 `aggregateRatio`：先加分子分母再相除，不对比率求平均。
- 用户数用 `distinctCount` 去重，渠道用户数不可相加当全站用户数。
- 演示数据用 `createRandomSource(seed)`（mulberry32）生成，**代码中不出现 `Math.random()`**，页面渲染时不造数。

## 架构取舍

| 决策 | 理由 | 代价 |
|---|---|---|
| 不用数据库 | 演示数据自足，加库只增加部署门槛，不增加说服力 | 无法展示 SQL / 迁移能力；已在文档中说明 |
| 保留 repository 层 | SSR 读不到 localStorage；测试需要非 localStorage 后端 | 多一层间接，约 200 行 |
| 派生字段不落库 | 防止评分被手工篡改，保证单一口径 | 每次读取需计算 |
| unit 与 integration 拆两份 Vitest 配置 | 纯函数跑 node 环境更快，适配器需要 jsdom | 两个配置文件 |
| E2E 跑生产构建而非 dev server | dev 的 HMR WebSocket 会污染 console 断言；生产构建才是真实产物 | 每次 E2E 先构建，约多 30 秒 |
| 不预装 UI / 图表库 | 装了不用是噪音 | 后续阶段需各自安装 |

## 测试与启动说明

全新环境：

```bash
npm ci
npx playwright install chromium   # 首次 E2E 前执行一次
```

质量门禁（从应用根目录运行，顺序无依赖）：

```bash
npm run lint
npm run typecheck
npm run test -- --run
npm run test:integration -- --run
npm run test:e2e
npm run build
```

本地开发：`npm run dev`（默认 3000 端口）。E2E 使用 **3100** 端口，可用 `E2E_PORT` 覆盖；Playwright 会自行构建并启动生产服务器，不需要手工先跑 `npm run build`。

测试隔离：E2E 的浏览器存储命名空间是 `growthos.e2e`，集成测试用 `growthos.test`，默认演示命名空间 `growthos.demo`，三者互不干扰。测试从不清空非测试数据。

## 实施记录更新（Dispatch 1）

- `typecheck` 脚本改为 `next typegen && tsc --noEmit`。开启 typedRoutes 后路由类型是构建产物，全新检出直接跑 `tsc` 会因 `Route` 类型缺失报错。
- 新增只读数据层 `TrafficRepository`：会话与订单是不可编辑的演示事实，不进入持久化的 `DemoState`，浏览器存储只保存用户能改的数据。
- 新增 `?demo=` QA 接缝（`empty` / `error` / `slow` / `flaky`），用于真实触发 loading / empty / error 状态。封闭白名单，未知值回落真实 fixture。
- 侧边栏断点为 Tailwind `lg`（1024px）；以下宽度折叠为 Header 披露面板。
- `src/fixtures/demo-traffic.ts` 为阶段性流量数据，Dispatch 6 建立完整分析数据集时替换。

## 实施记录更新（Dispatch 2）

- `SessionFact` 新增 `viewedProductIds`：商品转化率的分母是「浏览过该商品的会话」，仅靠 `landingPageId` 无法计算。schema 约束为「到达 product_view 时非空、否则为空，且不得重复」。落地页是入口，商品浏览是独立事件，二者语义不同。
- 演示目录集中在 `src/fixtures/demo-catalogue.ts`：17 个 SKU（15 active / 1 draft / 1 archived），每个配一份页面快照。快照质量刻意参差，缺陷是显式授权的，供 Dispatch 3/4 的审计引擎评分。
- 商品级派生指标口径见 `src/domain/product-metrics.ts`：商品营收按订单行分摊，全商品营收之和等于订单营收；商品转化率分母各不相同，不可相加或求平均。
- QA 接缝新增 `storage-error`：读取正常但保存失败，用于验证「未保存 + 保留输入」的恢复路径；`error` 仍表示数据加载失败。
- 筛选控件采用 `aria-pressed` 切换按钮，不使用隐藏在 label 中的复选框。
- **待补**：`AuditResult` 尚未进入持久化状态，因此商品 SEO 编辑后的「审计 stale 标记」在 Dispatch 3 才能实现。

## 实施记录更新（Dispatch 3）

- **SCHEMA_VERSION 1 → 2**：`DemoState` 增加 `auditResults`。审计是带时间戳的显式用户动作，因此结果持久化；但商品上仍不存分数，分数从该页最新审计读取。
- 类型拆分：`StoredAuditResult`（持久化，含 `inputFingerprint`）与 `AuditResult`（视图，含 `stale`）。**stale 在读取时由指纹比对得出，不是存储的标志位**，因此结果不可能在页面已改动后仍自称最新。
- `src/domain/audit-fingerprint.ts` 用 FNV-1a 对"审计实际读取的快照字段 + 主关键词"取哈希，非安全用途。
- `src/domain/audit-lookup.ts` 的 `readAudit` / `upsertAudit` 按 `kind` 区分，Dispatch 4 的 GEO 审计可直接复用。
- SEO 评分口径：可评估项等权（pass=1 / warning=0.5 / error=0），unknown 完全排除在分子分母之外并体现为 coverage 下降；零可评估项返回 null。
- 组合分数为已审计页面分数的**算术平均**，未审计页面排除而非计 0，界面写明覆盖页数。
- `SEO_RULE_VERSION = seo-1.0.0`。阈值与规则判定逻辑变更需升版；结果携带产出时的版本，跨版本比较分数无意义。
- keyword-usage 采用两级匹配（逐字出现 / 词覆盖率），并把 headings、FAQ、规格表计入"页面内容"。理由见 `docs/reports/dispatch-03.md` 已知问题 1。

## 实施记录更新（Dispatch 4）

- **SCHEMA_VERSION 2 → 3**：`AuditCheck` 增加 `points`。GEO 每条规则计 0/5/10 分，SEO 按状态加权计分，`points` 在 SEO 结果中一律为 null。
- **指纹按 `AuditKind` 区分**：SEO 读商品主关键词，故关键词变更使 SEO 结果 stale；GEO 不读关键词，故关键词变更不使 GEO 结果 stale。把不受影响的结果标成 stale 等于让用户白做一次审计。
- GEO 评分口径：可评估规则等权，`score = round(100 × 已得分 / (可评估条数 × 10))`；输入未采集的规则从分子分母同时移除并体现为 coverage 下降，绝不计 0。
- `GEO_RULE_VERSION = geo-1.0.0`。AI Readiness 分档阈值（80/55/30）在 config 中可配置，描述的是内容结构就绪度，不是被引用概率。
- 两个审计引擎完全解耦：各自的 config / rules / engine / service / UI 与独立的数据加载路径，单个引擎失败不会显示另一个的结果。
- GEO 模型的三条固有局限写在界面上：原创性只能验证"声明+材料"不能验证真伪；来源存在不等于来源可靠；关键词命中不等于语义理解。

## 实施记录更新（Dispatch 5）

- **SCHEMA_VERSION 3 → 4**：`DemoState` 增加 `contentIdeas`。
- Content Opportunity Score 口径：`0.35×SEO + 0.25×GEO + 0.20×commercialIntent + 0.20×productRelevance`，四项输入均 0–100，权重合计为 1（有测试锁定），结果取整为 0–100。意图映射 Transactional 100 / Commercial 80 / Informational 40 / Navigational 30，集中在 `INTENT_COMMERCIAL_VALUE`。
- **机会分 ≠ 审计分**：`seoOpportunity` / `geoOpportunity` / `productRelevance` 是编辑者输入的判断，与 Dispatch 3/4 的审计分无关，也不是关键词搜索量。`opportunityBreakdown()` 为每项标记 `entered` / `derived`，详情页并排显示目标商品的实测审计分并声明其不参与计算。
- 内容 id 由 topic 派生并在冲突时加序号；改标题不改 id，以免链接和已存状态失效。
- **`TableWrapper` 必须保留 `relative`**：绝对定位的后代（如 `sr-only` 标签）否则会以根元素为包含块、逃出 `overflow-x` 裁剪，造成整页横向溢出。
- 门禁脚本需逐条捕获退出码；`{ ...; } > log` 的分组写法只反映最后一条命令的退出码，会漏掉中间的失败。

## 实施记录更新（Dispatch 6）

- 流量 fixture 增加 `ChannelSpend`：每渠道每天一条（含 0 花费的渠道），金额由该渠道当天实际会话数推导。会话基数由 30/天 提高到 95/天。
- **acquisitionSpend ⊇ adSpend**：广告花费同时计入获客花费。三类渠道——买媒体的（CAC + ROAS 都有）、只有平台费/分成的（有 CAC、ROAS 为 N/A）、纯自然的（CAC 为 $0.00、ROAS 为 N/A）。
- `src/domain/analytics/channel-metrics.ts` 是渠道口径的**唯一实现**，Dashboard 与 Analytics 共用；集成测试断言两者的 `daily` 与 `channels` 深度相等。
- 会话/订单/营收可与站点总计对账；**用户数跨渠道重叠，相加会大于站点去重总数**，这是正确行为，界面必须说明。
- 站点 ROAS 只计入买了媒体的渠道所带来的营收，不是全站营收除以广告花费。
- 自然渠道 CAC 为 $0.00 是口径正确的结果，但界面须说明本演示不建模内容/SEO/品牌成本。
- `LOW_VOLUME_ORDER_THRESHOLD = 25`：订单少于此数的渠道，其比率标记为低置信。数字照常显示，但标明不可当定论。
- **图表不使用图表库**，为手写内联 SVG（约 100 行）。每张图必须配文本摘要与完整数据表格，图表通过 `aria-describedby` 指向摘要。
- 漏斗的渠道意图系数**不作用于 checkout→purchase**：该环节由结账体验决定，而非流量来源。

## 实施记录更新（Dispatch 7）

- 漏斗每层为**去重会话数**，不是页面浏览次数也不是人数；界面必须明说，否则三者极易被混为一谈。
- 阶段序列必须是 `FUNNEL_STAGES` 的有序前缀且无重复。不合格的会话**整条排除并上报**，不截断——截断后它仍会计入第一层，等于虚增上层。
- 最大流失按**流失比例**选取（不是人数），平局取更早阶段，上层为 0 的相邻对不可比较不参与，全部不流失时返回 null。
- 建议的触发条件有两个：**低于阈值** 或 **是最大流失**。两者回答不同问题——一个步骤可以丢掉大部分人却仍属该类正常（商品页到加购在任何店铺都如此）。每条建议带 `raisedBecause` 标明原因，界面分别措辞。
- 建议一律是**待验证假设**，措辞用 "may" 并配"如何验证"，绝不写成已证实的原因。单元测试断言此措辞。
- 阈值与最小样本量在 `DEFAULT_FUNNEL_CONFIG` 中可配；每条建议显示所依据的会话数，样本不足时标低置信。阈值是项目自定的粗略预期，无外部基准。
- Dashboard 的 Add-to-cart / Checkout Rate 与 Conversion Alerts 由同一份漏斗计算得出，与漏斗页面同源。

## 实施记录更新（Dispatch 8）

- **SCHEMA_VERSION 4 → 5**：`DemoState` 增加 `recommendationStatuses`。
- **只持久化决定，不持久化任务。** 存储中只有 `{ id, status, updatedAt }`；任务本身每次由各引擎重新生成，因此不可能与引擎当前的判断脱节。撤销完成时删除记录而非写入 "Open"——没有决定本身就是 Open 的含义。
- **稳定标识** `rec_<source>_<fnv1a(source, ruleId, sourceEntityId)>`（`src/domain/stable-id.ts`）。同页同规则恒为同一 id；不同页的同一规则是不同任务；跨来源的同名 ruleId 不会相撞。证据变化而标识不变时，展示新证据并保留既有完成状态。
- **本模块不重算任何分数。** SEO/GEO 取各自审计引擎的输出，漏斗取漏斗引擎的分析，Analytics 取 `channel-metrics` 的渠道行。它只决定"什么值得当作任务、大概值多少、去哪里做"。
- **Impact / Effort 是 1–5 的估计，不是收益承诺**，按规则类别写死在 `src/domain/recommendations/config.ts` 并附理由；四象限由 `impact ≥ 4 && effort ≤ 2 = Quick Win` 等规则映射。界面必须写明这一限定。
- **未发布商品降权**（`UNPUBLISHED_IMPACT_PENALTY = 2`，下限 1）：draft/archived 商品的页面级发现影响分减 2，并在理由中说明"问题真实存在但发布前不影响任何指标"。**降权而不隐藏**。没有这条规则时，列表首位会是一个未上线草稿的 meta 缺失——技术上正确，作为建议却是错的。
- **CAC / AOV 是除法结果，可能带小数分**，生成说明文字须用会取整的 `formatMoneyMetric`，不可用要求整数分的 `formatCents`（`assertCents` 会直接抛错）。
- **没有产出的来源要被点名**，不能留空白——"某模块没有报告问题"与"该模块已确认无问题"不是一回事。
- domain 层的 `link` 是纯字符串（domain 不应知道 Next 的路由类型），在 UI 边界处转成 `Route`。

## 实施记录更新（Dispatch 9）

- **Demo reset 是全项目唯一清除存储的入口**（`/about-project` 底部）。此前存储合同要求"提供明确的 demo reset；只有用户触发 reset 才清空"，但 `reset()` 只存在于 repository 层，界面上无法触达——这是从 Dispatch 0 起就存在的合同缺口。
  - 两步确认，且确认文案**逐项列出将要丢弃的内容**（改过的商品、增改的选题、已存审计、已完成建议），而不是问一句"确定吗"。
  - `previewDemoReset` 对照 seed 计数，不是对照零：演示自带选题，丢掉它们与丢掉用户自己写的不是一回事。
  - **corrupted 状态单独处理**：读不出来的存储同样返回 seed，但此时 reset 是修复而非损失，不能标为 alreadyClean。
  - 集成测试同时锁定反面：加载、损坏数据、保存失败都**不得**清空存储。
- **导航是跨模块指引的唯一来源。** `NavItem` 增加 `question`（该模块回答的运营问题），Dashboard 的 "Where to go next" 与 About 页的模块表都从 `NAV_ITEMS` 生成，路由不可能悄悄失联。`SECONDARY_NAV_ITEMS` 与模块列表分开，避免把 About 当成"可以继续分析的下一步"。
- **长不可断字符串会撑破窄屏。** 商品详情页的 canonical URL 在 375px 下把页面推宽 81px。`DetailRow` 的值需要 `min-w-0` + `break-words`，标签需要 `shrink-0`。这是继 Dispatch 5 的 `sr-only` 溢出之后第二个同类问题——**任何可能承载 URL 或 slug 的容器都要能断行**。
- **详情路由必须进溢出巡检。** 只扫列表页看不到这个 bug：长字符串都在详情页。`e2e/regression.spec.ts` 在 375/768/1440 三档逐一检查 13 条路由，含 `/products/[id]`、`/seo/[pageId]`、`/geo/[pageId]`、`/content/[id]`。
- **截图与性能测量在门禁之外**（`tools/screenshots/`，独立 config 与独立存储命名空间 `growthos.screenshots`）。截图会写入仓库，绝不能混进质量门禁；性能脚本只打印浏览器自报的导航计时与传输字节，**不对毫秒数设断言**——开发机上的时间阈值只会得到不稳定且无信息量的门禁。
- 全模块实现后删除了无引用的 `ModulePlaceholder`；`NavItem.implemented` 保留，仍驱动侧边栏的 "Soon" 标记。

## 实施记录更新（Dispatch 10）

- **SCHEMA_VERSION 5 → 6**：`DemoState` 增加 `amazonListings` 与 `listingAudits`。
- **两个渠道共享商品，绝不合并指标。** `AmazonListing.productId` 指向已有 `Product`（真实多渠道卖家就是如此），但 Amazon 的会话与独立站的会话是不同的计数单位，**项目中任何地方都不相加**。集成测试与 E2E 各有一条断言：跑完 listing 审计、改完 listing 之后，Dashboard 的全部指标**逐字节不变**。这条不是风格问题——一个把两套口径加起来的作品集比没有这个模块更糟。
- **`ListingAuditResult` 与 `StoredAuditResult` 分开存。** 后者以 `pageId` 为键、由 `PageSnapshot` 生成指纹，listing 两样都没有。塞进同一个数组就得伪造一个 pageId。两者只共用 `AuditCheck` 的形状。
- **抽出 `src/domain/audit-scoring.ts`。** 状态加权计分（pass 1 / warning 0.5 / error 0，unknown 同时排除出分子分母）原本在 `seo-audit/engine.ts`，GEO 服务已经跨模块 import 它的 tally 工具。第三个引擎需要同一套算术时，**CLAUDE.md 明令"不要复制评分公式"**，所以移到中立模块而不是复制。GEO 仍用自己的 0/5/10 分档，那是不同的公式。
- **后台搜索词按 UTF-8 字节而非字符校验。** Amazon 的上限是 250 字节：一个中文字 3 字节、emoji 4 字节，按字符校验会放行一个被 Amazon 静默截断的值——保存成功提示照出，内容丢一半。`byteLength()` 用 `TextEncoder`，规则与表单校验共用。
- **`suppressed` 与商品 `draft` 的降权方向相反。** 草稿没发布，问题影响不了任何东西 → 降权 2 分。**被压制的 listing 曾经在卖、现在正在丢单 → 绝不降权**。搞反会把目录里最紧急的东西压到列表底部。`adjustForListingStatus` 与 `adjustForStatus` 是两个函数，各有测试锁定。
- **跨来源排序把 Quick Win 排在 Strategic 之前，这对被压制的 listing 产生了一个有意思的结果**：在该 listing 内部，"主图不合规"（impact 5 / effort 2）排在"listing 被压制"（impact 5 / effort 3）之前。这不是 bug——**换主图正是解除压制的手段**，所以可执行的根因排在症状之前。详见 dispatch-10.md。
- **`unknown` 在 Amazon 侧同样是一等值**：主图是否纯白背景是图片文件的属性，本项目从不接触图片文件；未品牌备案时 A+ 根本不可用。两者都报 Unknown 并计入覆盖率缺口，不算通过也不算失败。
- 导航顺序是**阅读顺序而非构建顺序**：独立站链路连续，Amazon 作为独立渠道紧邻 Recommendations（汇聚点）。单元测试锁定顺序而不是 dispatch 编号。

## 实施记录更新（Dispatch 11）

- **`SCHEMA_VERSION` 不变（仍是 6）。** Search Term 报表与 Business Report 是**只读事实**，和 `SessionFact` 一样不进 `DemoState`——报表不是用户能编辑的东西。走独立的 `amazon-ads-repository`，浏览器存储里只放用户真正能改的记录。集成测试断言加载广告数据后 `localStorage.length === 0`。
- **Search Term ≠ Target，模型与界面都不合并。** 投放词（你告诉 Amazon 去竞价的）和顾客搜索词（shopper 实际输入的）是两个实体。`searchTermRows` 按 **(term, target) 配对**聚合而不是按 term 聚合：同一个 query 被两个 target 匹配就是两行、两个出价，合并会把"收割"要解决的重复隐藏掉。
- **CVR 的分母是点击，不是会话。** 函数特意叫 `clickConversionRate` 而不是复用 `conversionRate`——共用名字迟早会让人把两者放进同一列。界面上有固定的 `CVR_DENOMINATOR_NOTE`。
- **ACOS 不换算成 ROAS 并排比较。** 数学上 `ROAS = 1/ACOS`，但归因窗口不同，且 ACOS 只覆盖广告销售、TACOS 才覆盖总销售。`ACOS_VS_ROAS_NOTE` 把这件事写在页面上而不只是注释里。
- **fixture 的经济学必须自洽。** `ACOS = CPC ÷ (CVR × AOV)` 是一个等式，四个量不能各自独立挑选。第一版把 CPC、CVR、AOV 分别拍脑袋定，得到 **3.8% 的全站 ACOS 和 2.1% 的 unit session percentage**——没有任何真实卖家账户长这样，规则等于在不可能的数据上演示。改成从 `intendedAcos` 反推 CPC，结果落到 ACOS 23.7% / CVR 6.3% / CPC $2.49 / USP 6.6%。集成测试给这些量加了合理区间断言，防止再次漂移。
- **反例 fixture 必须真的触发被测分支。** "2 person tent" 是用来证明"已有 exact target 的词不被收割"的样例，但第一版它的 ACOS 是 27.12%，**高于收割上限**——就算删掉 exact-target 检查它也不会被收割，测试等于白跑。调高转化倍数让它落到 13.7%，并在测试里**先断言它满足其余全部收割条件**，再断言它没被收割。
- **`organicShare` 在归因销售超过当日总销售时返回 null。** Amazon 把点击归到点击当天而非下单当天，所以单日归因额可能超过当日总额。夹到 0 会撒谎，报负数会暗示一种数据并不具备的精度。
- **导航需要最长前缀匹配。** `/amazon/advertising` 同时匹配 `/amazon`（前缀）和自身（精确），原来的判断会让**两个链接同时带 `aria-current="page"`**。`activeNavHref()` 取最长匹配。
- **Recommendation 卡片现在显示 category。** 一个 source 可以覆盖多类工作——Amazon 同时产出 listing 质量和广告两类任务——只看 source 徽章分不出是哪个引擎提出的。
- 收割与否定**一律是待验证建议**：措辞用 "may"，否定建议明确提示"先读这个词：如果它描述的是本商品但用了 listing 里没有的说法，那是 listing 的问题，否定掉会把真实缺口藏起来"。
- **点击数不足的零转化词单独列出**（"Looked at, no verdict"），而不是静默丢弃——否则运营会奇怪为什么一个明显在烧钱的词不在列表里。
