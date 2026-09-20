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
