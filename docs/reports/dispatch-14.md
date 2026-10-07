# Dispatch 14 — 把三条约定变成机械检查

状态：**PASS**
日期：2026-10-07
范围：pre-commit hook、CI workflow、分层边界与 seed 确定性的 lint 规则

来源：对本会话做 retro 后，用户选定执行其中第 1、3、4 项。

---

## 1. 完成内容

三项的共同点：它们原本都是**写在文档里、靠人自觉维持**的约定。这次把它们变成会失败的检查。

### 1.1 Guardrail（retro 第 1 项）

此前状态：六条检查命令全部存在且可用，但 `.github` 不存在、`.husky` 不存在、`core.hooksPath` 未设、`.git/hooks` 下无激活 hook。21 个 commit 全靠手工执行。

实证代价见 `dispatch-09.md:126`——最终门禁跑出 `fail=1`，lint 在一个「上一轮通过之后才加进来」的文件上报错。唯一的防线是当时恰好重跑了一遍；若信了上一轮结果，那份报告会谎报 lint 通过。

- `.githooks/pre-commit`：lint、typecheck、unit、integration。实测合计约 6 秒（2.3 + 1.6 + 0.4 + 1.7）。
- `.github/workflows/ci.yml`：两个 job。快的四条在 Node 20 与 24 上各跑一遍（20 是 `engines` 声明的下限，24 是开发与 Vercel 运行时实际版本；只测一个会让另一个停留在声明而非事实）；e2e 三引擎 + build 只在 24 上跑一次。Playwright 浏览器按版本号 key 做缓存。

**未新增任何依赖。** 没用 husky / lint-staged / prettier——CLAUDE.md 写明「无必要不增加依赖」。改用 `core.hooksPath` 指向受版本控制的 `.githooks/`，经 `package.json` 的 `prepare` 脚本在 `npm install` 时自动挂载，并带 `git rev-parse` 守卫以免在非 git 环境下让安装失败。

两点取舍，写在 hook 的注释里：

- **对工作区检查，不对暂存快照检查。** 用 stash 隔离 index 会在检查中途失败时丢工作，CLAUDE.md 明确禁止覆盖用户修改。部分暂存的提交按磁盘现状检查，提交后的结果由 CI 兜。
- **不自造跳过开关。** `git commit --no-verify` 是 git 自带的出口，不需要第二个。

### 1.2 分层边界（retro 第 3 项）

CLAUDE.md 声明 `app → services → repositories → fixtures`，`domain` 不依赖任何东西。核验结果：`src/domain/` 当前对外零 import，确实干净——但撑着它的只有 13 个 dispatch 的自觉。

写进 `eslint.config.mjs`，每个 zone 只列它不得触及的层。两条现存的反向边给了窄豁免，而不是把规则放宽到无效：

| 边 | 处理 | 理由 |
|---|---|---|
| `fixtures/demo-seed.ts → repositories/types` | 仅放行 `repositories/types` | seed 必须符合存储 schema，该模块实为契约而非 repository |
| `components/dashboard/dashboard-view.tsx → repositories` | 仅放行 type-only | 依赖注入接缝；import 实现才是要防的事 |

### 1.3 seed 确定性（retro 第 4 项）

`src/fixtures/demo-traffic.ts:23` 与 `src/domain/seed.ts:5` 都用散文承诺了确定性，没有任何东西拦着后来的代码破坏它。这条比看起来重要：README 现在对外宣称「线上与本地逐位一致」，那句话在 dispatch-13 里是手工核验的。

`src/**` 下禁用 `Math.random`（`no-restricted-properties`）与 `crypto`（`no-restricted-globals`），报错信息直接指向 `src/domain/seed.ts` 和 `fnv1a`。

---

## 2. 核心修改文件

| 文件 | 修改 |
|---|---|
| `.githooks/pre-commit` | 新增，快四条 |
| `.github/workflows/ci.yml` | 新增，六条 + 浏览器缓存 |
| `eslint.config.mjs` | 34 → 169 行：5 个分层 zone、2 条确定性规则 |
| `package.json` | 新增 `prepare` 脚本 |
| `CLAUDE.md` | 测试脚本合同下补 2 行指针 |

---

## 3. 命令与真实结果

| 命令 | 结果 |
|---|---|
| `npm run lint` | PASS，无输出 |
| `npm run typecheck` | PASS |
| `npm run test -- --run` | PASS — 27 files / **544 tests** |
| `npm run test:integration -- --run` | PASS — 16 files / **306 tests** |
| `npm run test:e2e` | PASS — **777 tests**（chromium / firefox / webkit），1.3m |
| `npm run build` | PASS — 664ms |

---

## 4. 验收证据

### 4.1 每条新规则都验证了「会失败」

retro 第 2 项的结论是本项目反复产出**无法失败的测试**。装一个同样无法失败的检查会是对那条结论的直接重犯，所以每条规则都用故意违规的探针文件实测过：

```
src/components/__probe/bad.ts  error  components take repositories as injected values…
src/domain/__probe/p.ts        error  domain depends on nothing…
src/domain/__probe/rand.ts     error  'Math.random' is restricted…
src/domain/__probe/uuid.ts     error  Unexpected use of 'crypto'…
src/fixtures/__probe/bad.ts    error  fixtures may import repositories/types and nothing else…
✖ 5 problems (5 errors, 0 warnings)
```

同时两个**合法**用例产生零报错——`fixtures → repositories/types`，以及 `components` 对 repositories 的 type-only import。规则既会失败，也没有误杀它该放行的东西。探针文件已删除。

### 4.2 hook 确实拦住提交

不止验证了规则，也验证了 hook：往 `src/domain/` 放一个 `Math.random()` 后尝试提交：

```
pre-commit:
  lint                      FAILED
  1:29  error  'Math.random' is restricted from being used…
pre-commit: lint failed. Fix it, or commit with --no-verify.
```

提交后 `git log -1` 仍为 `d9c78d9`——确认是真的拦下了，不只是打印了警告。

### 4.3 CI workflow 语法

用 `js-yaml` 实际解析通过：2 个 job、Node matrix `["20","24"]`、checks 7 步、e2e 10 步。Playwright 版本号解析命令按 CI 的写法本地跑过，得到 `1.63.0`。

---

## 5. 已知问题

- **CI 从未实际执行过。** 仓库没有 git remote，`.github/workflows/ci.yml` 在推上 GitHub 之前是惰性的。语法已验证，运行行为未验证——不能当作已通过。
- **Node 20 那条 matrix 腿未经本地验证。** 本机只有 v24.18.0，装 Node 20 超出本次范围。`engines: >=20` 目前仍是声明。
- `fixtures → repositories/types` 的豁免是对现状的记录，不是认可。更干净的做法是把存储 schema 移到 `domain` 或独立的契约模块，之后 `fixtures` 可完全不碰 `repositories`——属于重构，未纳入本次范围。
- pre-commit 检查工作区而非暂存快照，理由见 1.1。
- 本次未 push。

---

## 6. 下一阶段建议

1. **推上 GitHub，让 CI 真的跑一次。** 这是把「已知问题」第一条变成事实的唯一方法，也顺带给作品集一个可读的仓库。
2. **retro 第 2 项：`src/domain/` 的变异测试。** 价值最高的一条，也是唯一还没动的机械手段。限定在 `src/domain/`（纯函数、单测 414ms），四次「不会失败的测试」全部住在这里。
3. **retro 第 5 项：`CODING_STANDARDS.md`。** 注释与代码不符属于判断题，没有 linter 能替代，等有 reviewer agent 流程时再加。

---

**本阶段完成。已停止，等待确认下一 Dispatch。**
