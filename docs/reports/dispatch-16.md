# Dispatch 16 — 修掉 E2E 的 hydration 竞态

状态：**PASS**
日期：2026-10-08
范围：readiness 哨兵补全、`e2e/ready.ts` 导航助手、全部 spec 改用它

来源：dispatch-15 推送后 CI 虽绿，annotations 报 `2 flaky`——绿是靠 `retries: 1` 换来的。

---

## 1. 问题

两条在 WebKit 上偶发失败、重试才过：

```
[webkit] e2e/products.spec.ts:56      search matches SKU as well as title
[webkit] e2e/accessibility.spec.ts:261 every form control has an accessible name
```

`products.spec.ts` 那条的报错给出了关键线索：

```
Expected: 1
Received: 17
- waiting for locator('tbody tr')
    14 × locator resolved to 17 elements
```

`toHaveCount` 自带 5 秒轮询，它轮了 **14 次、每次都看到 17 行**。这不是"还没渲染完"——是状态**压根没变**，页面已经稳定在错误答案上。断言重试救不了一个不再变化的 DOM。

### 根因

搜索框是受控 React input（`value={search}` + `onChange`）。测试 `page.goto('/products')` 之后**立刻** `fill()`，中间不等任何东西。实测服务端 HTML：

| testid | 出现在 SSR HTML |
|---|---|
| `product-search`（搜索框） | **1** |
| `products-ready`（哨兵） | **0** |
| `result-count` | **0** |

搜索框在 hydration **之前**就存在于 DOM 中。`fill()` 设了 DOM value，但没有 handler 在听；随后 hydration 把受控 input 重置回 `''`，列表永远停在未过滤的 17 行。

WebKit 在 CI 负载下 hydration 更慢，所以只在那里输。这是本项目**第三次**撞上同一类（Dispatch 5、dispatch-12 各一次）。

---

## 2. 修法

### 2.1 哨兵补全

哨兵必须是只在"hydration 完成 **且** 数据就绪"后才渲染的节点。原有 5 个（dashboard / analytics / funnel / advertising / recommendations），另有 4 个已存在但命名不同、且无人等待（`seo-overview` / `geo-overview` / `amazon-overview` / `listing-detail`）。

新增 6 个：

| 视图 | 哨兵 | 挂载点 |
|---|---|---|
| `products-view` | `products-ready` | ready 分支的 Card |
| `content-list-view` | `content-ready` | ready 分支的 Card |
| `product-detail-view` | `product-detail-ready` | ready 分支的 PageHeader |
| `seo-page-view` | `seo-page-ready` | 同上 |
| `geo-page-view` | `geo-page-ready` | 同上 |
| `content-detail-view` | `content-detail-ready` | 同上 |

两个取舍：

- **products / content 的哨兵挂在表格 Card 上，不是最外层 div。** 外层 div 和搜索框一样是服务端渲染的，等它等于没等。哨兵必须在 `state?.status === 'ready'` 守卫之内。
- **`about-view` 没加。** 它是服务端组件（无 hooks、无 `'use client'`），内容在初始 HTML 里，不存在数据竞态。为对称而加是照猫画虎。

`Card` 和 `PageHeader` 各加了一个 `testId` prop，沿用 `MetricCard` 已有的命名，没有引入第二种写法。

### 2.2 `e2e/ready.ts`

`gotoReady(page, path)` = 导航 + 等该路由的哨兵。路由到哨兵的映射按最长前缀排序，`/products/x` 不会命中 `/products` 的规则。

全部 14 个 spec、共 **230 处** `page.goto` 改为 `gotoReady`。保留 plain `goto` 的 **35 处**全部核对过：30 处是 `demo=` 种子 URL，5 处是故意探测 not-found 分支的未知 id（它们仍会匹配到路由的哨兵，而该哨兵在 not-found 分支不渲染），1 处是 `navigation.spec.ts` 中需要 Response 对象的调用。

---

## 3. 命令与真实结果

| 命令 | 结果 |
|---|---|
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run test -- --run` | PASS — **544 tests** |
| `npm run test:integration -- --run` | PASS — **306 tests** |
| `npm run test:e2e` ×3 | PASS — **777 tests** ×3，本地 `retries: 0` |
| `npm run build` | PASS — 484ms |

---

## 4. 验收证据

### 4.1 哨兵确实在等 hydration

这是本次唯一能在本地给出的决定性证据——竞态本身只在 CI 的 WebKit 上复现，"本地通过"证明不了任何事。

实测生产构建的服务端 HTML（见 §1 表格）：`products-ready` 计数为 **0**，`product-search` 为 **1**。等前者确实是在等客户端渲染，不是在等一个服务端早就吐出来的节点。

### 4.2 连跑三轮，retries 为 0

本地未设 `CI`，`playwright.config.ts` 因此取 `retries: 0`——任何 flake 都会直接记为失败而非悄悄重试通过。三轮全部 777/777。

### 4.3 过程中自己制造又修掉的两个问题

**转换脚本的过滤器检查语法而非语义。** 第一遍只处理字符串字面量，漏掉 51 处模板字符串和变量形式；补第二遍时，跳过条件写的是「参数文本里不含 `?`」，而 `page.goto(url)` 的参数文本是变量名 `url`，看不见循环里那三个全带 `?demo=` 的值。结果 `accessibility.spec.ts:149` 开始在三个引擎上稳定失败。

修法不是改那一个调用点，而是**把规则挪进 helper**：`waitForReady` 现在检查真实 URL 里有没有 `demo=`，有就跳过等待。读真实 URL 的规则不会以那种方式失手。

**注释一度描述了不存在的行为。** 写 `gotoReady` 文档时写了「unknown id 会跳过等待」——不成立：`/products/prd_not_a_real_product` 会匹配到 `product-detail-ready`，而 not-found 分支永远不渲染它，真传进去会挂住。那些调用点本就保留着 plain `goto`，功能没坏，但注释在说假话。已改正。这正是 retro 第 5 条点名的失效模式。

---

## 5. 已知问题

- **CI 上的 flaky 计数尚未复验。** 本地三轮干净且机制已证，但这个竞态的原产地是 CI 的 WebKit，只有那边连续若干次 `0 flaky` 才算真正收口。
- 预 hydration 丢按键对真实用户同样存在：在慢设备上，hydration 完成前的输入会被受控 input 重置。这是 React SSR 的固有特性，**未处理**——MVP 不追这个，但它不是测试的假象。
- `navigation.spec.ts:22` 那条只校验 HTTP 状态和 h1（均服务端渲染），不需要哨兵，保留 plain `goto`。

---

## 6. 下一阶段建议

1. **观察 CI 几次运行的 flaky 计数**，确认归零。
2. **retro 第 2 项：`src/domain/` 变异测试。** 仍是剩下价值最高的机械手段。
3. **retro 第 5 项：`CODING_STANDARDS.md`。** 本阶段又添一条实例——注释声称了代码没有的行为。

---

**本阶段完成。已停止，等待确认下一 Dispatch。**
