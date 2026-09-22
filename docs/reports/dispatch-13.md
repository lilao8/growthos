# Dispatch 13 — 部署上线与 Recommendations tally 口径修正

状态：**PASS**
日期：2026-09-22
范围：Vercel 生产部署、README 演示链接、`tallyRecommendations` 口径统一

---

## 1. 完成内容

### 1.1 部署到 Vercel

用户明确授权部署（"好，部署到 Vercel"），覆盖 CLAUDE.md 的"不自动部署"约束。凭据处理仍然禁止：登录由用户在自己终端完成，本次未接触任何 `VERCEL_TOKEN`。

- 项目 `michaell1/growthos`，稳定别名 **<https://growthos-michaell1.vercel.app>**
- 上传体积 1MB（`.vercelignore` 生效，测试、截图、docs 未进入部署包）
- 首次部署被 Vercel Authentication 拦截，所有请求 302 到 `vercel.com/sso-api` 且带 `x-robots-tag: noindex`。这是新项目默认开启的部署保护，对作品集链接等同于链接失效。由用户在 Dashboard 关闭后恢复公开。

### 1.2 README 演示链接

README 顶部加入在线演示链接，说明无需登录、数据与本地逐位一致、写入仅存在访问者自己的浏览器。

使用稳定别名而非部署 URL：带哈希的 `growthos-2spy2hkpw-michaell1.vercel.app` 只指向单次部署，下次 `vercel --prod` 后即非最新。另注意 `growthos.vercel.app`（不含 `-michaell1`）属于他人项目，会跳转 `/login`，不可使用。

### 1.3 tally 口径修正（本次的实质改动）

**问题**：`tallyRecommendations` 中 `open/done/ignored` 按状态分区，而 `byPriority`/`byQuadrant` 不分状态全量计数。五张卡片并排展示，读者会默认同一口径。关闭全部任务后会出现 `Open 0` 与 `Critical 6` 并列，自相矛盾。违反 CLAUDE.md「单一指标口径」。

**发现方式**：生产环境冒烟检查时，Ignore 一条 Critical findings 后观察到 `OPEN 22→21` 而 `CRITICAL` 仍为 6。

**修法**（用户选定方案 a）：`byPriority`/`byQuadrant` 只统计 Open。理由是这排卡片回答的是"现在还剩多少活"，已完成或已明确搁置的 finding 不属于待办。`total`/`done`/`ignored` 仍提供全量视角。

卡片文案同步更新为 "Open findings that are…"，避免口径对了但说明仍然模糊。

---

## 2. 核心修改文件

| 文件 | 修改 |
|---|---|
| `src/domain/recommendations/sorting.ts` | `byPriority`/`byQuadrant` 移入 open 分支；补充 interface 注释说明取舍 |
| `src/components/recommendations/recommendations-view.tsx` | Critical / Quick wins 两张卡片文案明确限定为 open |
| `tests/unit/recommendation-aggregate.test.ts` | 新增 6 条能区分新旧行为的单测 |
| `e2e/recommendations.spec.ts` | 新增 2 条 E2E |
| `README.md` | 顶部演示链接 |
| `.gitignore` | `.vercel` |

---

## 3. 命令与真实结果

从应用根目录运行：

| 命令 | 结果 |
|---|---|
| `npm run lint` | PASS，无输出 |
| `npm run typecheck` | PASS |
| `npm run test -- --run` | PASS — 27 files / **544 tests** |
| `npm run test:integration -- --run` | PASS — 16 files / **306 tests** |
| `npm run test:e2e` | PASS — **777 tests**（chromium / firefox / webkit），1.2m |
| `npm run build` | PASS — 18 条路由编译通过 |

---

## 4. 验收证据

### 4.1 新测试确实能失败

这是本次最重要的一条验证。已有的那条 tally 测试：

```ts
recommendation({ id: 'a', priority: 'Critical', quadrant: 'Quick Win' }),
recommendation({ id: 'b', priority: 'Low', status: 'Done' }),
expect(tally.byPriority.Critical).toBe(1);
```

在新旧两种实现下都通过——已关闭的那条是 Low 而非 Critical，区分不出任何东西。这是本项目反复出现的一类问题（Dispatch 10 的字节溢出 fixture、Dispatch 11 的 exact-target 反例、A3 的 `implemented` 断言）。

因此新增的 6 条单测全部使用「既是 Critical/Quick Win、又已关闭」的 finding，这是唯一能区分两种规则的形状。并实际验证：将 `sorting.ts` 还原到修改前版本后重跑，**6 条全部失败**，原有那条仍然通过：

```
Test Files  1 failed (1)
     Tests  6 failed | 42 passed (48)
AssertionError: expected 2 to be +0   // byPriority.Critical
```

还原实现后重新验证文件与修改版本一致（`diff -q` 通过）。

### 4.2 E2E 防止测试失效

`closing a critical finding takes it out of the Critical count too` 先断言首张卡片确实是 `data-priority="Critical"`，再执行关闭。没有这条前置断言，fixture 排序一旦变化，该测试会在不再验证任何东西的情况下继续通过。

同时断言刷新后计数保持，以区分乐观更新与真正的持久化。

### 4.3 生产环境冒烟检查

| 检查项 | 结果 |
|---|---|
| 9 条主路由 HTTP | 全 200（`/` 307 → `/dashboard`） |
| 数据与本地一致 | 逐位相同 |
| Console error | 无 |
| 写入持久化 | Ignore 后刷新保持 |
| 375px 横向溢出 | 0px |
| 表格键盘可滚动 | 5/5 在 `tabindex=0` 容器内 |

数据一致性对照 dispatch-11 记录值：ACOS 23.42%、TACOS 10.00%、CTR 0.370%、CVR 6.30%、CPC $2.49、organic share 57.30%、USP 6.56%、ad spend $13,232.24、5,305 clicks——全部吻合，固定 seed 在生产构建下行为不变。

---

## 5. 已知问题

- 部署保护当前仅确认 Production 已公开。若后续推送分支产生 Preview 部署，需确认 Preview 的保护策略是否也要放开。
- `byPriority`/`byQuadrant` 改为 open-only 后，若将来需要「全部 Critical（含已关闭）」的视角，需新增字段而非改回原口径，否则会重新引入本次修复的矛盾。
- 本次未 push 到远端。

---

## 6. 下一阶段建议

优先级从高到低：

1. **Preview 部署的保护策略确认**——一次性设置，影响后续所有分支预览。
2. **D 类设计限制**——退款与毛利建模、多触点归因、Amazon 归因窗口、多站点/多 ASIN 广告结构、暗色模式。均需用户决定是否纳入范围。
3. **E 类不可自动验证项**——真实读屏软件测试、200% 缩放、`prefers-reduced-motion`。

---

**本阶段完成。已停止，等待确认下一 Dispatch。**
