# Dispatch 17 — `src/domain` 变异测试

状态：**PASS**
日期：2026-10-08
范围：Stryker 接入、基线测量、修复其暴露的测试缺口、阈值门禁、手动 CI workflow

来源：retro 第 2 项。本项目四次产出「删掉被测代码也会通过」的测试（Dispatch 10 字节溢出 fixture、Dispatch 11 exact-target 反例、A3 `implemented` 断言、Dispatch 13 tally 测试），每次都是人工、事后发现。变异测试把这一类变成机械检查。

---

## 1. 完成内容

### 1.1 范围

`src/domain/**/*.ts`，排除 `types.ts`（无逻辑）与各 `config.ts`。排除 config 的理由：变异一个权重只会产生另一套同样任意的规则，不应有测试逐字断言权重；真正会暴露错误数字的是消费它们的引擎，而引擎在变异范围内。

选 `src/domain` 是因为上述四次全部发生在这里，它按构造是纯函数，且单测约 300ms——这是全量变异负担得起的前提。

### 1.2 官方 vitest runner 不可用

`@stryker-mutator/vitest-runner@10` 声明 peer `vitest >=2.0.0`，是 Vitest 5 发布之前写下的开放区间。在 Vitest 5 上它什么也没驱动：

```
Ran 0.00 tests per mutant on average.
```

每个 mutant 跑了 0 个测试，于是全部记为存活。首次全量得分 **11%**——读起来像一个灾难性的测试套件，而不是一个坏掉的 runner。

没有接受这个数。手动对照实验：把 `metrics.ts` 的 `denominator === 0` 改为 `!== 0`，真实套件 **51 个测试失败、6 个文件挂掉**；同一文件 vitest runner 打分 **0%、27 个存活**。

改用 `command` runner，直接 shell 调用 `npm run test -- --run`，因此不可能与套件实际行为脱节。同一文件得分 **100%**，27 个全部杀死。代价是没有逐测试覆盖映射，每个 mutant 跑整个单测套件——只在套件快的前提下成立。坏 runner 已卸载，原因写在 `stryker.config.mjs` 注释里。

### 1.3 基线

| | 得分 | killed | survived | timeout | 耗时 |
|---|---|---|---|---|---|
| 首次真实全量 | **66.02%** | 2702 | 1394 | 6 | 24m27s |
| 修复后全量 | **68.50%** | 2804 | 1292 | 6 | 24m24s |

### 1.4 修掉的缺口

**`recommendations/sorting.ts`：30.50% → 95.04%**（存活 98 → 7）

- `filterRecommendations` 与 `isRecommendationQueryActive` **没有任何直接单测**。整个函数体替换为空、条件换成 `true`/`false`，全部存活。它们只通过 service 和浏览器间接被走到——在那里，一个悄悄匹配全部的筛选器和没人用过的筛选器看起来一模一样。
- 原有测试「puts open before done, then priority, then quick wins, then least effort」**无法隔离它点名的后两条规则**：它的 Quick Win 那条恰好 effort 也更低，关掉任一个 tie-breaker 顺序都不变。逐个补了只变一个字段、其余全等的用例。
- **`status: 'Ignored'` 且 `ignore: null` 从未被测过。** 去掉 `ignore?.needsReview` 的可选链后变异存活——真出现时会直接抛异常。
- Ignored 组内按 `needsReview` 排序（dispatch 的 Ignored 状态工作中加入）只断言过标记，没断言过**顺序**。

**`schemas.ts`：25.40% → 32.54%**

- slug 正则 `(?:-[a-z0-9]+)*` 的量词可删除而套件全绿——所有用例都恰好不超过两段。补了多段 slug。
- 图片 `src: z.string().min(1)` 可改为 `.max(1)` 而全绿。补了空 src 拒绝与长 src 接受。

新增单测 29 个，544 → 573。

### 1.5 门禁

`thresholds.break: 68`——实测地板，不是目标。低于 68 命令失败，因此分数可以自然上升而无需改配置，但不能悄悄下降。6 个 timeout 合计约 0.15 分，是唯一的非确定性来源，取 68 而非 68.5 以免 timeout 翻转让干净的运行失败。

阈值本身验证过会失败：单独变异 `schemas.ts`（32.54%）时命令退出码为 1：

```
ERROR Final mutation score 32.54 under breaking threshold 68, setting exit code to 1
```

### 1.6 CI

新增 `.github/workflows/mutation.yml`，仅 `workflow_dispatch`。不进 `ci.yml` 与 pre-commit：24 分钟挂在每次 push 上代价过高。HTML 报告（每个存活 mutant 及其 diff）作为 artifact 上传——有用的是那张清单，分数只说明有多少。

---

## 2. 核心修改文件

| 文件 | 修改 |
|---|---|
| `stryker.config.mjs` | 新增 |
| `.github/workflows/mutation.yml` | 新增，手动触发 |
| `package.json` / `package-lock.json` | `@stryker-mutator/core`；`test:mutation` 脚本 |
| `eslint.config.mjs` | 忽略 `.stryker-tmp/**`、`reports/**`（沙箱是故意改坏的副本，lint 它报告的都不是真问题） |
| `.gitignore` | 同上 |
| `tests/unit/recommendation-aggregate.test.ts` | +22 |
| `tests/unit/schemas.test.ts` | +7 |
| `CLAUDE.md` | 测试合同下补 1 行指针 |

新增依赖说明：CLAUDE.md 要求「无必要不增加依赖」。变异测试需要一个变异引擎，自写不现实，`@stryker-mutator/core` 是唯一新增；不能用的 vitest-runner 已卸载。

---

## 3. 命令与真实结果

| 命令 | 结果 |
|---|---|
| `npm ci`（清洁环境） | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run test -- --run` | PASS — **573 tests** |
| `npm run test:integration -- --run` | PASS — **306 tests** |
| `npm run test:e2e` | PASS — **777 tests**（3 引擎），1.2m |
| `npm run build` | PASS |
| `npm run test:mutation` | **68.50%**（≥ 68），24m24s |

---

## 4. 已知问题

- **9 个导出 schema 中 7 个仍无单测**：`storedAuditResultSchema`、`opportunityScoreSchema`、`contentIdeaSchema`、`recommendationStatusSchema`、`amazonListingSchema`、`listingAuditResultSchema`，以及本次只补了图片规则的 `pageSnapshotSchema`。它们校验从浏览器存储读回的数据，对应 CLAUDE.md「校验损坏数据」合同。补齐属于另一份工作量，未在本阶段悄悄扩大范围。
- `schemas.ts` 剩余存活者多数是 Zod 错误消息字符串（`message: ''`）。不应断言消息原文，这部分是噪音。未用 `excludedMutations` 排除 `StringLiteral`：同一类变异在 `sorting.ts` 里抓到过真问题（`=== 'Quick Win'` → `=== ''`）。
- 其余低分：`seed.ts` 58.54%、`seo-audit` 65.05%、`amazon` 65.21%、`geo-audit` 67.29%。未逐一审查存活者，不能断言其中多少是真缺口、多少是等价变异。
- `mutation.yml` 在 GitHub 上尚未实际触发过——语法与 `ci.yml` 同构，运行行为未验证。
- 等待全量运行期间曾多出一个只做轮询的后台任务，已停止，未影响结果。
- **本报告首次提交时被 `.gitignore` 吞掉了。** 为忽略 Stryker 的 HTML 输出，加了一行 `reports/`——没有前导斜杠，于是匹配任何位置的 `reports` 目录，包括 `docs/reports/`。已跟踪的 00–16 不受影响，但从本份起每一份新报告都会被静默跳过。`git status` 里没出现本文件才发现，已改为锚定根目录的 `/reports/` 并补提交。

---

## 5. 下一阶段建议

1. **补齐 7 个 schema 的单测。** 存活清单已经给出精确的切入点，且这是与「损坏数据」合同直接相关的一层。
2. 从 Actions 手动触发一次 `Mutation` workflow，把上面最后一条已知问题变成事实。
3. 按存活清单审查 `seo-audit/rules.ts`（229 存活）与 `amazon/rules.ts`（218 存活）。
4. retro 第 5 项：`CODING_STANDARDS.md`。

---

**本阶段完成。已停止，等待确认下一 Dispatch。**
