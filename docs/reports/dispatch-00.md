# Dispatch 0 — PASS

执行日期：2026-09-20　｜　环境：macOS (darwin 25.6.0)、Node v24.18.0、npm 11.16.0

## 1. 本次完成内容

对照 `docs/00-architecture.md` 的范围逐条说明。

**只读规划**（本阶段前半，已在会话中输出并获用户确认）：推荐架构、数据模型、页面结构、业务实体、Dispatch 0–9 计划、测试策略、MVP 边界。用户确认的两项决策：不接数据库、执行 `git init`。

**工程初始化：** Next.js 16.3.5（App Router + Turbopack）、TypeScript strict、Tailwind CSS 4、ESLint flat config、Vitest、Playwright。`git init`（分支 `main`）。lockfile 固定为唯一的 `package-lock.json`。

**strict 配置超出默认：** 除 `strict: true` 外另开 `noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`noImplicitOverride`、`noFallthroughCasesInSwitch`、`verbatimModuleSyntax`。ESLint 层面 `@typescript-eslint/no-explicit-any` 设为 error。全库零 `any`。

**最小启动页：** `/` 渲染品牌、演示数据窗口、fixture 记录数和 8 个模块的「未实现 + 计划阶段」。数据经 `page → service → repository → fixture` 取得，不在 JSX 里硬编码。页面明示 SEO/GEO 分数是内部启发式模型。

**分层划分：** `src/app`（UI）、`src/services`、`src/domain`、`src/repositories`、`src/fixtures`、`tests/`、`e2e/`。依赖方向单向。

**9 个实体已规划：** Product、PageSnapshot、AuditResult、ContentIdea、SessionFact、Order、OrderItem、ChannelSpend、Recommendation，全部在 `src/domain/types.ts` 定义类型。本阶段只有 Product 与 PageSnapshot 进入 fixture 与持久化，其余是后续阶段的契约。

**数据适配器与持久化决策：** 见下方「已知问题/偏离」第 1 条与架构实施记录。`demoAsOf = 2026-08-31`，90 天窗口 2026-06-03 → 2026-08-31（含首尾，UTC）。金额整数分。

**占位路由约定：** 10 条路由（含 `/about-project`）及对应阶段已列表写入架构实施记录，启动页同步展示。本阶段不建任何业务页面。

**架构实施记录：** 已追加到 `docs/00-architecture.md` 末尾，含实际版本、目录与路由图、实体关系、服务接口、指标口径、架构取舍表、测试与启动说明。

## 2. 修改的核心文件

**配置**

| 文件 | 目的 |
|---|---|
| `package.json` | 脚本合同（lint/typecheck/test/test:integration/test:e2e/build）、ESM |
| `tsconfig.json` | strict + 4 项额外严格选项、`@/*` 路径别名 |
| `eslint.config.mjs` | flat config，next 规则 + 项目附加规则 |
| `vitest.config.ts` / `vitest.integration.config.ts` | 单元（node）与集成（jsdom）两套边界 |
| `playwright.config.ts` | 对生产构建跑 E2E，端口 3100，独立存储命名空间 |
| `next.config.ts`、`postcss.config.mjs`、`.gitignore` | 框架与样式配置 |

**领域层（纯函数，可测试）**

| 文件 | 目的 |
|---|---|
| `src/domain/types.ts` | 9 个实体类型；派生字段刻意不进 Product |
| `src/domain/schemas.ts` | Zod 边界校验；漏斗阶段有序前缀规则 |
| `src/domain/metrics.ts` | `safeRatio` 及各指标；null 口径的单一来源 |
| `src/domain/money.ts` | 整数分、折扣分摊、展示层格式化 |
| `src/domain/demo-window.ts` | `demoAsOf`、含首尾窗口计算 |
| `src/domain/seed.ts` | mulberry32 确定性随机源 |

**持久化与数据**

| 文件 | 目的 |
|---|---|
| `src/repositories/types.ts` | `DemoStateRepository` 合同、`SCHEMA_VERSION`、加载状态四态 |
| `src/repositories/serialization.ts` | 编解码与损坏识别，两个适配器共用 |
| `src/repositories/memory-state-repository.ts` | 内存适配器（测试、SSR） |
| `src/repositories/browser-state-repository.ts` | localStorage 适配器，命名空间隔离 |
| `src/fixtures/demo-seed.ts` | 3 SKU + 2 快照，自校验 |
| `src/services/demo-state-service.ts` | 组合 repository 与 fixture，输出视图模型 |

**UI 与测试**

`src/app/layout.tsx`、`src/app/page.tsx`、`src/app/globals.css`；`tests/unit/*.test.ts`（5 个文件）、`tests/integration/*.test.ts`（2 个文件）、`e2e/start-page.spec.ts`。

**文档：** `docs/00-architecture.md` 追加实施记录；本报告。

## 3. 测试结果

全部命令在 `rm -rf node_modules .next` 后按顺序一次跑通，整体退出码 0。完整日志：会话 scratchpad 的 `gates.log`。

| 命令 | 结果 | 实际数量 |
|---|---|---|
| `npm ci` | PASS | 428 packages，3s |
| `npm run lint` | PASS | 28 个文件被检查，0 problems |
| `npm run typecheck` | PASS | 无输出（TS 6.0.3） |
| `npm run test -- --run` | PASS | **5 文件 / 47 用例通过，0 失败 0 跳过** |
| `npm run test:integration -- --run` | PASS | **2 文件 / 27 用例通过，0 失败 0 跳过** |
| `npm run test:e2e` | PASS | **4 用例通过，0 失败 0 跳过**（chromium） |
| `npm run build` | PASS | 编译成功，静态预渲染 `/` 与 `/_not-found` |

lint 的「0 problems」经 `npx eslint . -f json` 核对，确认实际检查了 28 个文件，不是空跑。

**测试覆盖的实质断言（非占位）：**

- 指标：零分母返回 null 而非 Infinity；有效分母零分子返回 0；`aggregateRatio` 先加分子分母（用一组会被"比率平均"算错的数据验证：正确 0.09，平均法约 0.095）；用户跨会话去重。
- 金额：拒绝小数分；折扣分摊后各行之和精确等于总额（1000 分分 3 份 = 334+333+333）。
- 窗口：拒绝 2026-02-30 这类形式合法但不存在的日期；7/30/90 天共用同一结束日；90 天窗口含首尾。
- 种子：同种子序列完全一致，不同种子不同；`pick` 空列表抛错而非返回 undefined。
- Schema：拒绝跳级漏斗序列（session → add_to_cart）与乱序序列；拒绝非法 slug 与未知品类。
- 适配器（两个适配器跑同一套契约）：空态回落 seed；保存后往返；不泄漏 seed 引用；拒绝写入非法状态；reset 回到 seed。
- 浏览器适配器专项：只写自己命名空间的键；reset 不动同源其他键；区分「JSON 损坏」「schemaVersion 过旧」「结构合法但违反领域规则」；storage 不可用时返回 `unavailable` 而非渲染失败，保存时明确报错。
- E2E：启动页 200；窗口文案精确匹配 `2026-06-03 to 2026-08-31 (90 days, UTC)`；8 个模块全部标注未实现；启发式声明可见；**加载零 console error**。

## 4. 验收证据

| 验收项 | 证据 | 状态 |
|---|---|---|
| 架构计划覆盖 8 个模块，0–9 依赖清晰，未实现明确标注 | 架构实施记录路由表 + 启动页 8 条「Not implemented yet」 | 已实测 |
| 全新环境可安装、启动、构建 | `rm -rf node_modules .next` 后 `npm ci` → 6 个门禁全绿 | 已实测 |
| strict 与所有约定脚本真实可用 | 见测试结果表；typecheck 与 lint 均非空跑 | 已实测 |
| 至少一个有实际断言的 unit / integration / 启动页 E2E | 47 + 27 + 4 = 78 个用例 | 已实测 |
| 适配器 fixture 输入校验与读写合同可验证 | 集成测试 27 例，含 4 种损坏输入场景 | 已实测 |
| 浏览器人工核对 | 生产构建 + `next start`，浏览器打开 `http://127.0.0.1:3100/`，页面正确渲染品牌、窗口 `2026-06-03 to 2026-08-31 (90 days, UTC)`、fixture `3 products, 2 page snapshots`、8 个模块状态；Tailwind 样式生效 | 已实测（截图未落盘，Dispatch 9 才建 `docs/screenshots/`） |

**未运行的项目：** 移动端/平板断点未专门验证（Dispatch 1 与 9 的范围）；Firefox/WebKit 未跑（只配 chromium，Dispatch 9 扩展回归时再议）；`npm run dev` 未单独验证（E2E 走生产构建路径）。

## 5. 当前已知问题

**必要偏离与原因：**

1. **不接数据库，也不预留迁移接口。** 经用户确认。理由：演示数据自足，加数据库只增加部署门槛不增加说服力。repository 分层仍保留，但理由改为「SSR 读不到 localStorage」和「测试需要非 localStorage 后端」两个当下问题，而非「未来换库」。不写 Prisma schema、迁移、第二适配器。
2. **TypeScript 固定 6.0.3，未用 7.0。** typescript-eslint 尚不支持 TS 7.0 API，装 7.0 会让 `npm run lint` 直接崩溃（非配置问题，是上游未支持）。等 typescript-eslint 发布 TS 7 支持后可升。
3. **`eslint.config.mjs` 显式声明 `settings.react.version = '19.3'`。** eslint-config-next 内置的 eslint-plugin-react 使用了 ESLint 10 已移除的版本探测 API（`contextOrFilename.getFilename`），显式声明版本可绕过该代码路径。这是上游兼容问题，不是本项目代码缺陷。
4. **E2E 对生产构建运行，而非 dev server。** dev server 的 HMR WebSocket 握手失败会以 console error 形式出现，污染「零 console error」断言。改跑生产构建后断言成立，且更贴近真实产物。代价是每次 E2E 先构建（约多 30 秒）。
5. **规划文档中曾写 90 天窗口起点为 2026-06-02，实际正确值是 2026-06-03。** 含首尾 90 天从 08-31 回推应为 06-03，已由 `daysBetweenInclusive` 断言锁定。文档与代码现已一致。

**环境限制：**

6. Playwright 需要 chromium 1243，本机原有缓存是 1223，已执行 `npx playwright install chromium` 补齐。新环境首次跑 E2E 必须执行该命令，已写入架构实施记录与本报告。
7. `unrs-resolver` 的 postinstall 脚本被 npm 的 allow-scripts 策略拦截，出现 warning。当前 lint 正常工作，未产生实际影响；如后续 import 解析出问题，需 `npm approve-scripts unrs-resolver`。

**未提交的动作：** 已按规则 `git init` 并完成首次提交，**未配置远程、未 push、未部署**。

除上述条目外，**无已知阻塞问题**。

## 6. 下一 Dispatch 建议

Dispatch 1：基础框架与 Dashboard（`docs/01-dashboard.md`）。将搭建 Layout / Sidebar / Header / 导航与基础组件，建立 8 条路由，Dashboard 只显示 Sessions、Revenue、Orders、Conversion Rate、AOV、Organic Traffic 六项，并补充 SessionFact / Order 的小型 fixture 与 summary service。需要新增 shadcn/ui（或等价组件方案）。

仅为建议，等待用户确认。

## 7. 状态

本阶段全部门禁通过，**Dispatch 0 完成**。

已停止，等待用户确认下一 Dispatch。
