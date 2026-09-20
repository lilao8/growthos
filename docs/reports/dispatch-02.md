# Dispatch 2 — PASS

执行日期：2026-09-20　｜　环境：macOS (darwin 25.6.0)、Node v24.18.0、npm 11.16.0

## 1. 本次完成内容

对照 `docs/02-products.md` 的范围与验收标准逐条说明。

**商品目录扩到 17 个 SKU。** 15 个 active + 1 个 draft（TrailCell 台灯）+ 1 个 archived（Trailhead 1P 帐篷），覆盖 7 个品类。价格、成本、库存、关键词之间有业务关系：毛利率统一落在 45–75%（实际 52–67%），便宜快消品库存深（头灯 210、炉头 180）、贵重季节品库存浅（0 度睡袋 18、3P 帐篷 37），每个 active 商品的关键词与标题/描述有词汇重叠。sku、slug、id 三者各自唯一，均有测试锁定。

**Product 字段完整。** 存储字段 13 项；seoScore、geoScore、organicSessions、conversionRate、revenue 是派生视图字段，不落库、不可手改，由 service 从流量事实算出。

**商品列表。** 展示 SKU、商品名、品类、价格、库存、SEO、GEO、转化率、营收。搜索匹配标题 / SKU / slug / 主关键词，大小写不敏感、去首尾空格、内部连续空格归一（`"  RIDGELINE   2p "` 能找到 Ridgeline 2P）。品类与状态多选筛选，字段内取并集、字段间取交集，空选择表示「该字段无约束」。Clear filters 一键重置，无条件时按钮禁用。

**商品详情与 SEO 编辑。** 详情页分四块：商品记录（含毛利率）、派生指标、SEO 元数据表单、页面快照。表单校验三个字段，实时显示字符数与项目建议区间，保存反馈与失败恢复见下。

**PageSnapshot fixture。** 17 个快照，质量刻意参差：缺 H1、缺 canonical、canonical 指向别处、robots 未知、noindex、缺 alt、无内链、无结构化数据、无 FAQ、纯营销话术无事实。同时有 4 个以上完整页面，保证审计引擎既能判错也能判对。**保存编辑会同步快照的 metaTitle/metaDescription，正文内容不动。**

**四种状态。** Loading、Empty（区分「筛选无结果」和「目录为空」两种文案）、Error + Retry。评分一律显示 `Not audited`，其他派生指标标明 Demo 与 90 天窗口。

**验收标准对照：**

| 验收项 | 落实方式 |
|---|---|
| 15 个 SKU 可查看 | 17 个，E2E 断言列表行数 ≥ 15 |
| 搜索大小写与空格处理稳定 | 单元测试 6 例 + E2E 用 `"  RIDGELINE  "` 实测 |
| 多条件取交集 | 单元测试 + E2E：品类 Tents + 状态 archived → 恰好 1 行 |
| 空结果可重置 | E2E：headlamp + Cooking → 空态；Clear filters 恢复全量且输入框清空 |
| 无效商品 ID 显示 not found | E2E：返回 200 且显示 not-found 区块，不是报错 |
| 非法输入不写入 | E2E：空标题保存 → 失败提示 + 输入保留 + 刷新后仍是原值 |
| 合法编辑刷新后仍存在 | E2E + 集成测试 + 浏览器人工实测 |
| service 测试覆盖搜索、联合筛选、校验、保存失败与成功 | `product-service.test.ts` 17 例 |
| integration 覆盖 repository 往返及 PageSnapshot 同步 | 保存后新建 repository 实例重读，快照元数据同步、正文未变 |
| E2E 完成搜索→详情→编辑→刷新验证 | `products.spec.ts` 17 条 |
| 未执行审计不出现评分 | E2E 断言「Not audited」出现次数 = 行数 × 2 |

## 2. 修改的核心文件

**新增 — 数据**

| 文件 | 目的 |
|---|---|
| `src/fixtures/demo-catalogue.ts` | 17 个 SKU 及其页面快照的唯一真相源；快照由紧凑的授权记录 + builder 生成，质量缺口是显式声明的 |

**新增 — 领域层（纯函数）**

| 文件 | 目的 |
|---|---|
| `src/domain/product-metrics.ts` | 商品级派生指标；转化率分母是「浏览过该商品的会话」 |
| `src/domain/product-filters.ts` | 搜索归一化、交集筛选、稳定排序 |
| `src/domain/product-seo.ts` | 编辑校验、长度建议、应用编辑、快照同步 |

**新增 — 服务与 UI**

`src/services/product-service.ts`（列表 / 详情 / 保存的状态分类）、`src/components/products/{products-view,product-detail-view,seo-metadata-form}.tsx`、`src/components/ui/badge.tsx`、`src/app/products/[id]/page.tsx`。

**修改**

| 文件 | 修改目的 |
|---|---|
| `src/domain/types.ts` | SessionFact 新增 `viewedProductIds`（见已知问题 1） |
| `src/domain/schemas.ts` | 新增两条 refine：viewedProductIds 与 product_view 阶段必须一致、不得重复 |
| `src/fixtures/demo-traffic.ts` | 按商品需求权重选落地页、记录浏览商品、订单行只能来自已浏览商品；重新调参使站点转化率落在 2–3% |
| `src/fixtures/demo-seed.ts` | 改为组合 catalogue，不再内联商品数据 |
| `src/repositories/memory-state-repository.ts` | 新增 `createFailingStateRepository` |
| `src/services/demo-data-source.ts` | 新增 `resolveStateRepository` 与 `storage-error` 模式 |
| `src/components/layout/nav-items.ts` | Products 标记为已实现 |
| `src/app/products/page.tsx` | 占位页改为真实目录页 |

## 3. 测试结果

`rm -rf node_modules .next` 后按顺序一次跑通，整体退出码 0。完整日志：scratchpad 的 `gates-d2.log`。

| 命令 | 结果 | 实际数量 | 相比 Dispatch 1 |
|---|---|---|---|
| `npm ci` | PASS | 428 packages | — |
| `npm run lint` | PASS | 0 problems | — |
| `npm run typecheck` | PASS | 无输出 | — |
| `npm run test -- --run` | PASS | **10 文件 / 95 通过，0 失败 0 跳过** | +35 |
| `npm run test:integration -- --run` | PASS | **6 文件 / 93 通过，0 失败 0 跳过** | +36 |
| `npm run test:e2e` | PASS | **38 通过，0 失败 0 跳过** | +17 |
| `npm run build` | PASS | 11 条路由 | — |

**过程中真实失败过 5 次，均修根因后重跑：**

1. 集成测试断言商品数为 3（目录扩容后失效）。改为断言下限 ≥ 15，避免每次扩目录都要改测试。
2. `SessionFact` 加字段后两个既有测试 fixture 类型不完整 → 补齐。
3. E2E 筛选点击超时：筛选项原本是 `sr-only` 复选框套在 label 里，label 拦截了指针事件。**不是加 `force: true` 绕过**，而是改成带 `aria-pressed` 的切换按钮——用户看到的控件就是接收焦点和点击的控件，状态也不再只靠填充色传达。
4. E2E 保存失败用例超时：`?demo=error` 让流量源也失败，详情页直接进错误态，表单根本没渲染。新增 `storage-error` 模式（读取正常、保存失败），语义更准确。
5. 上述修改后筛选测试仍用 `.check()`（只适用于 checkbox），改为 `.click()` 并补充 `aria-pressed` 断言。

**本阶段新增断言要点：**

- 目录业务合理性：毛利率区间、非 active 商品库存为 0、**便宜商品平均库存高于贵重商品**、关键词与标题有词汇重叠、需求权重为正。
- 快照：与商品一一对应、id 由商品 id 派生、URL 由 slug 构成、**存在全部 10 类质量缺口**、同时存在 ≥4 个完整页面、装饰图 alt 为空串且被标记为装饰。
- 商品指标：一个会话浏览多个商品时进入每个商品的分母；浏览未购买是真 0 而非 N/A；**各商品营收之和精确等于订单营收**；数量计入 units sold 而不影响会话计数；跳出会话不算浏览。
- 服务：draft/archived 商品无流量（不是活跃页面）；搜索时同时返回未筛选总数；流量源失败 → error 态；保存非法输入不写入；保存失败不谎报成功；内存适配器的写入不会串到浏览器适配器。
- SEO 编辑：trim、多字段同时报错、非对象输入、超硬上限拒绝；**建议区间之外仍可保存**（建议不是硬规则）；只改三个字段；快照正文不动。

## 4. 验收证据

**浏览器人工核对**（生产构建 + `next start`，1440px）：

- `/products` 显示 17/17，表格 9 列齐全，SEO/GEO 全部 `Not audited`，转化率与营收为真实计算值。
- `/products/prd_summit_20_bag` 详情页：SKU NT-BAG-SMT20、价格 $275.00、成本 $118.00、毛利率 57.1%（手工验算 (275−118)/275 = 57.09% ✓）、浏览会话 172、自然会话 58、转化率 2.33%、营收 $1,072.50、售出 4 件。
- 页面快照区块正确显示该页的缺陷：H1 Missing、Canonical Missing、Indexability「Unknown — not captured」、内链 0、结构化数据 0。这正是为 Dispatch 3/4 准备的低分样本。
- **实际编辑并保存**：把 meta description 改为 121 字符的新文案，字符计数实时变为「121 characters — within the 70–160 guideline」，保存后显示「Saved. This change persists across a page refresh.」，同页快照的 Snapshot meta description 立即同步为新值；**重新导航该 URL 后新值仍在**。

**数据核对：** 站点整体 sessions 2,805、orders 72、revenue $12,949.80、转化率 2.57%、AOV $179.86。各商品营收之和 $12,949.80，与订单营收完全一致 ✓。商品转化率分布符合业务直觉：头灯 4.95%、美利奴内衣 5.17%（便宜）；2P 帐篷 1.44%、0 度睡袋 2.25%（贵）。

**未运行：** 截图未落盘（Dispatch 9 范围）；Firefox / WebKit 未跑；未做屏幕阅读器实测；768px 与 375px 仅由 E2E 断言无横向溢出，未逐屏人工查看（1440px 已人工核对）。

## 5. 当前已知问题

**必要偏离与原因：**

1. **`SessionFact` 新增了 `viewedProductIds` 字段。** `CLAUDE.md` 规定商品转化率 =「包含该商品购买的会话数 ÷ 该商品访问会话数」，但原模型只有 `landingPageId`，无法知道一个会话浏览过哪些商品。用落地页近似会错：落地页只是入口。新字段加了两条 schema 约束——只有到达 `product_view` 阶段才能非空、不得重复。这同时为 Dispatch 6/7 的商品级漏斗做好准备。
2. **落地页与商品浏览是两个事件。** `landingPageId` 记录会话入口，`viewedProductIds` 记录商品浏览事件。一个跳出会话有落地页但没有商品浏览。这与 GA4 的 `view_item` 语义一致，已写在类型注释里，但需要在面试时能解释清楚。
3. **新增 `storage-error` QA 模式。** `error` 表示数据加载失败，`storage-error` 表示读取正常但保存失败。两者语义不同，合并会测不到「保存失败且保留输入」这条路径。
4. **审计 stale 标记未实现。** `docs/00-architecture.md` 要求「SEO 编辑应同步对应 PageSnapshot；已有审计标记 stale」。快照同步已实现，但 `AuditResult` 目前不存在于持久化状态中（Dispatch 3 才建），因此无处标记 stale。**这是 Dispatch 3 必须补上的一环**，已在此记录以免遗漏。
5. **筛选控件从复选框改为 `aria-pressed` 切换按钮。** 原写法把真实 input 藏在 label 里，可点击的是 label 而非控件本身。改后语义更贴近「筛选开关」，也避免了隐藏控件与可视控件不一致的问题。
6. **订单量偏小。** 90 天 72 笔订单（约 0.8 单/天），对应 2,805 次会话。比例真实（2.57%），但绝对量像一个很早期的品牌。Dispatch 6 重建完整数据集时可提高日均会话基数。

**上游兼容问题**（不变，详见 Dispatch 0 报告）：TypeScript 固定 6.0.3；ESLint 显式声明 React 版本；`unrs-resolver` postinstall 被拦截但不影响 lint。

**未提交的动作：** 未配置远程、未 push、未部署。

除上述条目外，**无已知阻塞问题**。

## 6. 下一 Dispatch 建议

Dispatch 3：SEO Audit（`docs/03-seo-audit.md`）。以 PageSnapshot 为输入实现 12 条规则的纯函数审计引擎，输出 rule / status / severity / message / explanation / recommendation / evidence，等权评分（pass=1、warning=0.5、error=0，零可评估项返回 null），建 SEO Overview、Issue List、Page Detail Audit 三个视图，并把 SEO Score、Critical Issues、Warnings、Passed Checks 同源接入 Dashboard。

两处需要一并处理：

- **补上 stale 机制**（本阶段已知问题 4）：`AuditResult` 进入持久化状态后，商品 SEO 编辑需把对应审计标记为 stale 并提供重新审计入口。
- 本阶段的 17 个快照已经按缺陷类型布好，可以直接作为规则的测试样本：`snap_summit_20_bag` 是最差样本，`snap_ridgeline_2p_tent` 与 `snap_traverse_55` 是完整样本，`snap_traverse_35` 的 meta title 超长（warning），`snap_emberlite_cookset` 的 canonical 指向别的页面。

仅为建议，等待用户确认。

## 7. 状态

本阶段全部门禁通过，**Dispatch 2 完成**。

已停止，等待用户确认下一 Dispatch。
