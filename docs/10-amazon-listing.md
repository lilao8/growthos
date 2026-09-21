# Dispatch 10：Amazon Listing Quality

> **已实现并通过全部门禁。** 实测结果见 [dispatch-10.md](reports/dispatch-10.md)。
> 下文是当初的范围方案，保留原样作为过程记录——实现与它的差异都写在报告里。

## 目标

在现有工作台中增加**亚马逊运营**这条线的第一半：ASIN 目录与 Listing 质量审计。让作品集在独立站之外，也能证明理解亚马逊站内的运营语言与判断方式。

Dispatch 11 承接第二半（Search Term 与广告效率）。两个阶段分开的理由：本阶段只依赖 Listing 本身的静态字段，下一阶段才引入报表型时间序列数据，两者的数据形状与失败模式完全不同，混在一起会重演"一个 dispatch 里塞两种模型"的问题。

## 前置条件

Dispatch 9 已通过，MVP 完成。开始前阅读 `README.md`、`CLAUDE.md`、`docs/00-architecture.md`、本文件与 Dispatch 3（SEO Audit）的实现与报告——**本阶段的引擎与它同构，但规则完全不同，不得复用其规则内容**。

## 关键设计判断（先说清楚，避免做错方向）

### 1. 亚马逊数据是**独立的一条线**，不与独立站数据混算

亚马逊和独立站在本项目里共享商品实体（同一批 17 个 SKU，符合真实的多渠道卖家），但**指标绝不合并**：

- 不把 Amazon sessions 加进站点 sessions。两者的"会话"定义不同，相加没有意义。
- 不把 ACOS 换算成 ROAS 再和独立站渠道并排。虽然数学上 `ROAS = 1/ACOS`，但口径与归因窗口不同，并排会误导。
- Dashboard **不新增合并指标卡**，只增加一个指向 Amazon 模块的入口。

**如果做不到不混算，就不该做这个模块**——一个把两套口径加起来的作品集，比没有这个模块更扣分。

### 2. 不接 SP-API，不爬取

SP-API 需要真实卖家账号与开发者审核，作品集里接不了；声称接了是硬伤。数据是 fixture，与现有演示数据同一套 seed 与同一个 90 天窗口（`DEMO_WINDOW`）。界面明确标记 Demo data，并说明数据来源本应是 Business Report / Brand Analytics 的哪张报表。

### 3. Listing 审计的规则必须是亚马逊自己的规则

不能把 SEO 的 12 条改个名字。canonical、robots、内链在亚马逊上没有意义。本阶段的规则围绕：标题结构、五点描述、A+ 内容、图片数量与主图合规、后台搜索词、变体关系、品类节点、评论与评分。

### 4. 本项目不声称能预测亚马逊搜索排名

与 SEO/GEO 同样的免责措辞：这是本项目的 listing 编辑规范，不是亚马逊的排名算法，**分数不预测排名、不预测销量**。界面固定展示这句。

## 范围

### 数据模型（新增）

```ts
AmazonListing {
  id; productId;              // 复用现有 Product，不再造一套商品
  asin; marketplace;          // 'ATVPDKIKX0DER' (US)，MVP 只做美国站
  title; bullets: string[];   // 五点描述
  descriptionHtml | aPlusModules;
  backendSearchTerms;         // 后台搜索词（字节上限是硬约束）
  imageCount; mainImageIsWhiteBackground: boolean | 'unknown';
  hasVideo; browseNode; brandRegistered;
  variationParentId: string | null;
  reviewCount; averageRating: number | null;
  buyBoxPercentage: number | null;   // 来自 Business Report
  fulfilment: 'FBA' | 'FBM';
  status: 'active' | 'suppressed' | 'inactive';
}
```

- **`unknown` 是一等值**，与 `PageSnapshot` 同样的原则：演示不臆测主图是否合规、品类节点是否正确。数据不全显示 Unknown，不算通过也不算失败。
- 至少 15 个 listing，一一对应现有 SKU，**刻意写入合理的质量缺陷分布**（和 `demo-catalogue.ts` 同样的做法），其中包含 suppressed 与未品牌备案的情况。

### 规则引擎 `amazon-listing-1.0.0`

与 SEO Audit **同构**：`config.ts`（阈值 + 规则元信息 + 版本号）、`rules.ts`（纯函数，每条返回 `AuditCheck`）、`engine.ts`（组装，复用现有 `scoreChecks` / `tallyChecks`）。

计划 12 条规则：

| 规则 | 判据要点 |
|---|---|
| `title-length` | 品类标题字符上限；过长会被截断 |
| `title-structure` | 品牌开头、关键属性是否出现、是否堆砌符号 |
| `bullets-count` | 五点是否补齐 |
| `bullets-length` | 每点长度区间，过短无信息、过长被折叠 |
| `image-count` | 图片数量下限 |
| `main-image-compliance` | 纯白背景；未知即 Unknown |
| `video-present` | 有无视频（warning 级，不是必须） |
| `aplus-content` | 品牌备案下是否使用 A+ |
| `backend-search-terms` | **字节上限**是硬约束；重复词、与标题重复都是浪费 |
| `browse-node` | 品类节点是否填写 |
| `variation-relationship` | 应归入变体却独立挂靠 |
| `review-health` | 评分与评论数；**低于最小样本量时标低置信而不是下结论** |

计分沿用 `pass 1 / warning 0.5 / error 0`，**Unknown 同时排除出分子与分母**（与 SEO 一致，理由相同）。

### 服务与界面

- `amazon-listing-service.ts`：列表、单条详情、运行审计、批量审计。复用 `auditInputFingerprint` 的 stale 机制——**listing 字段一改，已有审计自动标 stale**。
- `/amazon` 概览：平均分、critical/warning/passed、suppressed 数量、按分数排序的 listing 表。
- `/amazon/[listingId]` 详情：逐条检查项 + 证据 + 规则理由 + 版本号，与 `/seo/[pageId]` 同样的信息密度。
- 四态（loading / empty / error / retry）、键盘可达、表格文本摘要，与现有页面一致。
- 侧边栏新增 Amazon 分组入口；Dashboard 的 "Where to go next" 自动包含（它从 `NAV_ITEMS` 生成）。

### 接入 Recommendations

`RECOMMENDATION_SOURCES` 增加 `'amazon'`，`aggregate.ts` 增加第六个 builder。这是本阶段最便宜的一步——Recommendations 本就是来源无关的。

需要注意：`adjustForStatus` 目前按 `ProductStatus` 降权未发布商品。Amazon 的 `suppressed` 语义相反——**被压制的 listing 是最紧急的,不能降权**，要单独处理并写测试锁定。

### 存储

`DemoState` 增加 `amazonListings`，`SCHEMA_VERSION` 5 → 6。listing 的可编辑字段（标题、五点、后台搜索词）跨刷新保存，与商品 SEO 编辑同样的合同。

## 明确不做

- 不接 SP-API、不爬取亚马逊、不调用任何外部 API。
- 不做广告、Search Term、ACOS/TACOS、库存/IPI——**那是 Dispatch 11**。
- 不做多站点/多国家，只做美国站。
- 不把亚马逊数据与独立站指标合并计算。
- 不声称预测排名、销量或 Buy Box 归属。
- 不改动 Dispatch 1–9 已交付的任何指标口径。

## 验收标准

- 15+ listing，质量缺陷分布合理且可解释；`unknown` 字段真实存在且被正确处理。
- 12 条规则各有单元测试，覆盖 pass / warning / error / unknown 四种结果与边界值；**后台搜索词按字节而非字符计算**，需有多字节测试用例。
- 编辑 listing → 已有审计标 stale → 重新审计 → stale 清除，有 E2E。
- suppressed listing 在 Recommendations 中**不被降权**，有测试锁定。
- 亚马逊与独立站指标在任何页面都不相加，有测试断言 Dashboard 站点指标不受 listing 数据影响。
- 375 / 768 / 1440 三档无横向溢出（注意 ASIN、后台搜索词是长不可断字符串，**参考 Dispatch 9 的 `break-words` 教训**）。
- 全部门禁通过：lint、typecheck、unit、integration、e2e、build。

## 测试命令

```bash
npm run lint
npm run typecheck
npm run test -- --run
npm run test:integration -- --run
npm run test:e2e
npm run build
```

## 完成后的汇报格式

保存到 `docs/reports/dispatch-10.md`，并按既有七节格式汇报：完成内容 / 核心文件 / 测试结果 / 验收证据 / 已知问题 / 下一阶段建议 / 状态。没有实测不能标 PASS。
