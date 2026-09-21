# Dispatch 11：Amazon Search Terms & Advertising Efficiency

> **已实现并通过全部门禁。** 实测结果见 [dispatch-11.md](reports/dispatch-11.md)。
> 下文是当初的范围方案，保留原样作为过程记录——实现与它的差异都写在报告里。

## 目标

补上亚马逊运营的第二半：关键词与广告效率。这是亚马逊运营岗位日常真正在做的事——**收割有效搜索词、否定无效搜索词、按 ACOS/TACOS 调整出价**。

## 前置条件

Dispatch 10 已通过并经用户确认。阅读 Dispatch 6（Analytics）的实现——本阶段与它同构但口径不同，**不得复用渠道口径**。

## 关键设计判断

### 1. ACOS 是主语言，不是 ROAS 的换算

亚马逊运营讲 ACOS 与 TACOS，不讲 CAC。界面用亚马逊的语言，并在口径表里写明与独立站 ROAS 的数学关系（`ROAS = 1 / ACOS`）**以及为什么两者不能并排比较**——归因窗口不同，且 ACOS 只覆盖广告销售，TACOS 才覆盖总销售。

| 指标 | 口径 |
|---|---|
| ACOS | adSpend ÷ adSales |
| TACOS | adSpend ÷ totalSales（含自然单） |
| CTR | clicks ÷ impressions |
| CVR | orders ÷ clicks（**注意：按点击，不是按会话——与独立站的 CVR 分母不同**） |
| CPC | adSpend ÷ clicks |
| Unit Session Percentage | unitsOrdered ÷ sessions（Business Report 口径，**按 ASIN 会话，不是站点会话**） |
| 自然占比 | (totalSales − adSales) ÷ totalSales |

分母为 0 一律返回 `null` → N/A，沿用现有 `safeRatio`。**低于最小点击量的搜索词不产生任何结论**，沿用 Dispatch 6 的低置信标记做法。

### 2. Search Term ≠ Keyword

这是亚马逊运营的基本功，也是最容易在作品集里露怯的地方：**投放的关键词（targeting）与顾客实际搜索的词（customer search term）是两个东西**。数据模型必须把两者分开，界面必须显示"这个搜索词是被哪个投放词匹配到的、匹配类型是什么"。

### 3. 收割与否定是**建议**，不是自动执行

与漏斗建议同样的纪律：给假设、给依据、给验证方式，措辞用 "may"，**不自动改广告、不声称能提升销量**。CLAUDE.md 已禁止自动执行外部动作。

## 范围

### 数据模型

```ts
AdCampaign { id; name; type: 'SP'|'SB'|'SD'; targetingType: 'auto'|'manual'; dailyBudgetCents; status }
AdTarget   { id; campaignId; keyword|asin; matchType: 'broad'|'phrase'|'exact'|'auto'; bidCents }
SearchTermRow {
  date; targetId; customerSearchTerm;
  impressions; clicks; spendCents; adSalesCents; adOrders;
}
AsinDailyReport {   // Business Report 形状
  date; listingId; sessions; pageViews; unitsOrdered; totalSalesCents; buyBoxPercentage;
}
```

同一个 `DEMO_WINDOW`（90 天，UTC），同一个 seed 策略，金额整数分。

**只读事实**，与 `SessionFact` 一样不进 `DemoState`——报表不是用户能编辑的东西。走独立 repository，`SCHEMA_VERSION` 不变。

### 分析引擎（纯函数）

- `amazon/ad-metrics.ts`：按 campaign / target / search term / ASIN 聚合。**先加分子分母再相除**，禁止平均比率。
- `harvest.ts`：收割候选——auto/broad 里点击充足且 ACOS 低于目标、但尚未在 exact 中投放的搜索词。
- `negate.ts`：否定候选——点击充足、花费超过阈值、零转化的搜索词。
- 两者的阈值（最小点击数、目标 ACOS、最小花费）全部配置化，**每条建议显示所依据的点击数与花费**，样本不足标低置信。

### 界面

- `/amazon/advertising`：ACOS/TACOS/CTR/CVR/CPC 指标卡 + 口径表、按 campaign 与按搜索词的表格、收割与否定候选清单、每日趋势图（沿用手写 SVG + 数据表 + 文本摘要）。
- `/amazon/listings/[id]` 增加该 ASIN 的 Unit Session Percentage 与自然占比。

### 接入 Recommendations

`amazonRecommendations()` 扩展：收割候选、否定候选、ACOS 超标、自然占比过低、Buy Box 占比低。

## 明确不做

- 不接 Amazon Advertising API，不爬取。
- 不自动改出价、预算、否定词或任何外部动作。
- 不做 DSP、不做多站点、不做库存/IPI/补货预测。
- 不把 ACOS 与独立站 ROAS 合并成一个"统一广告效率"指标。
- 不声称能预测排名或销量。

## 验收标准

- 搜索词与投放词在模型和界面上明确区分，有测试锁定。
- CVR 的分母是点击而非会话，有测试与界面说明；**与独立站 CVR 并排出现时必须标注口径差异**。
- 收割/否定规则有单元测试，覆盖阈值边界与低样本。
- ACOS/TACOS 与逐行明细可对账（聚合 = 明细加总），有集成测试。
- 全部门禁通过；三档宽度无溢出。

## 完成后的汇报格式

保存到 `docs/reports/dispatch-11.md`，沿用既有七节格式。

---

## 两个阶段完成后，作品集的叙述

- **独立站线**：SEO / GEO / Content / Analytics / Funnel → Recommendations
- **亚马逊线**：Listing Quality / Search Terms / Ad Efficiency → 同一个 Recommendations
- **共同的方法论**：指标口径统一、规则可拆解可反驳、发现变成带证据的任务、模型局限写在明处

这正是面试里最值得讲的一点：**两条线的数据模型不同，但判断方式是同一套**，而且项目能演示为什么它们不能相加。
