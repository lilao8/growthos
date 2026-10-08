# Dispatch 15 — 推上 GitHub，CI 首次运行并证伪了 Node 20 支持

状态：**PASS**
日期：2026-10-08
范围：公开仓库、历史身份改写、`engines` 下限修正

用户明确授权推送（"推上github吧"），覆盖 CLAUDE.md 的「不自动 push」约束。

---

## 1. 完成内容

### 1.1 推送前检查

公开仓库意味着全部 22 个 commit 的历史都会被索引、可被 fork 和缓存——此前 dispatch-13 部署前只扫了工作区，这次扫了整个历史：

- 22 个 commit 中无 token / key / 凭据（`gho_`、`ghp_`、`sk-`、`AKIA`、PRIVATE KEY、`xox*` 等模式）
- 从未提交过 `.env` / `.pem` / `.key` / credential 类文件
- 无邮箱、无绝对家目录路径泄露
- `.vercel/`（含项目 id）本地存在且已正确 ignore；`.vercelignore` 是应当提交的文件

### 1.2 历史身份改写

22 个 commit 的作者邮箱原为 `michael@MichaeldeMacBook-Pro.local`——本机 hostname 自动生成，GitHub 无法关联到账号，贡献图不会显示。

改为 `Michael Li <56323719+lilao8@users.noreply.github.com>`。用 GitHub 的 noreply 地址而非真实邮箱：既能关联账号，又不把邮箱写进公开历史。

改写前建了 `backup-before-rewrite` 分支。改写后核验：22 个 commit 数量不变，提交信息保留，**tree hash 与备份完全一致**——内容可证明未被触碰，只改了身份。

### 1.3 仓库

<https://github.com/lilao8/growthos>，public，homepage 指向线上演示。

### 1.4 CI 首次运行，并推翻了一条声明

dispatch-14 把两件事如实标为未验证：CI 从未实际执行过，Node 20 那条 matrix 腿未经验证、`engines: >=20` 仍只是声明。

首次运行的结果：

| Job | 结果 |
|---|---|
| e2e（3 引擎）+ build | **success** |
| lint / typecheck / unit / integration（Node 24） | **success** |
| lint / typecheck / unit / integration（Node 20） | **failure** |

e2e 那条从此是事实而非声明：777 个测试、chromium / firefox / webkit 三引擎，在 GitHub 环境里跑通。

Node 20 失败在 integration：

```
TypeError: webidl.util.markAsUncloneable is not a function
  ❯ new CacheStorage  node_modules/undici/lib/web/cache/cachestorage.js:20:17
  ❯ Object.<anonymous> node_modules/jsdom/lib/api.js:12:33
```

integration 套件用 jsdom（需要 localStorage），jsdom 拉进 undici 8.10.2，后者调用的 `webidl.util.markAsUncloneable` 在 Node 20 中不存在。CI 用的是 **20.20.2**，Node 20 的最新版——不是补丁落后，是这个 API 在整条 20 线上都没有。

查依赖树自己声明的下限，结论是确定的：

| 包 | engines |
|---|---|
| `jsdom` | `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0` |
| `undici` | `>=22.19.0` |
| `vitest` | `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0` |
| `next` | `>=20.9.0` |

**`>=20` 从一开始就不成立。** Next 本身支持 20.9，但 vitest 和 jsdom 是 devDependency，在 Node 20 上装得上、跑不了。dispatch-13 选 `>=20` 的理由是「要下限而不是钉死在 24」——这个直觉本身没错，错在那个下限没人验证过。

修正为 `^22.12.0 || ^24.0.0 || >=26.0.0`，镜像 vitest 的范围（三者中最严），这样声明不会再与依赖树脱节。CI matrix 改为 `['22', '24']`。

---

## 2. 核心修改文件

| 文件 | 修改 |
|---|---|
| `package.json` | `engines.node`：`>=20` → `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0` |
| `.github/workflows/ci.yml` | matrix `['20','24']` → `['22','24']`，注释记录证伪过程 |
| `README.md` | 「需要 Node 20+」→ 22.12+，并写明为何改 |

`docs/reports/dispatch-14.md` **未回改**。它写的是当时确实如此的判断，包括「Node 20 未验证」这条。按 README 中已有的约定，回改会把过程记录变成事后修饰。

---

## 3. 命令与真实结果

| 命令 | 结果 |
|---|---|
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run test -- --run` | PASS — 27 files / **544 tests** |
| `npm run test:integration -- --run` | PASS — 16 files / **306 tests** |
| `npm run test:e2e` | PASS — **777 tests**（3 引擎） |
| `npm run build` | PASS |
| CI（GitHub Actions，修正后） | 见下 §4.2 |

---

## 4. 验收证据

### 4.1 改写只动身份，不动内容

```
IDENTICAL tree hash — content untouched
22 commits, messages preserved
```

`git rev-parse HEAD^{tree}` 与 `backup-before-rewrite^{tree}` 相同。

### 4.2 CI 修正后转绿

见 §6 之后补记——本报告写于第二次运行结果确认之后。

### 4.3 pre-commit hook 在真实提交上生效

dispatch-14 的 hook 在本阶段每次提交时自动执行，四条全过，约 6 秒。

---

## 5. 已知问题

- **Node 22 那条 matrix 腿本地仍未验证**，与此前 Node 20 的情况相同——本机只有 v24.18.0。区别在于现在 CI 会实际跑它，所以它不再是无人检验的声明。
- `backup-before-rewrite` 分支仍在本地，未推送。确认无误后可删。
- 仓库现为 public，历史已被 GitHub 索引。
- 线上演示仍是 dispatch-13 的部署，`d9c78d9` 之后的改动（lint 规则、CI、本次 engines 修正）都不影响运行时行为，无需重新部署。

---

## 6. 下一阶段建议

1. **retro 第 2 项：`src/domain/` 变异测试。** 剩下价值最高的一条机械手段，四次「不会失败的测试」全住在那个目录。
2. **retro 第 5 项：`CODING_STANDARDS.md`。** 注释与代码不符是判断题，等有 reviewer agent 流程时再加。
3. 给仓库加 topics 和 CI badge，让 README 顶部能直接看到门禁状态。

---

**本阶段完成。已停止，等待确认下一 Dispatch。**
