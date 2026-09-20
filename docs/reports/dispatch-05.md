# Dispatch 5 — PASS

执行日期：2026-09-20　｜　环境：macOS (darwin 25.6.0)、Node v24.18.0、npm 11.16.0

## 1. 本次完成内容

对照 `docs/05-content-planner.md` 的范围与验收标准逐条说明。

**字段完整。** id、topic、primaryKeyword、secondaryKeywords、searchIntent、funnelStage、contentType、status、targetProductId、seoOpportunity、geoOpportunity、productRelevance。枚举严格限定：意图 4 种、漏斗 3 层、类型 6 种、状态 5 种。

**Content Opportunity Score 是独立纯函数。**

```
score = 0.35×SEO + 0.25×GEO + 0.20×commercialIntent + 0.20×productRelevance
commercialIntent: Transactional 100 / Commercial 80 / Informational 40 / Navigational 30
```

四项输入均 0–100，权重合计为 1（有专门测试锁定 `weightsSumToOne()`），结果 0–100 取整。`opportunityBreakdown()` 额外返回每项的输入值、权重、贡献值和**来源标记**（`entered` / `derived`），界面按此逐行展示。

**机会分与审计分的区分做在了三个层面**，因为这是本阶段最容易被误读的地方：

1. 代码注释与类型：`opportunity.ts` 文件头写明这不是 Dispatch 3/4 的审计分，也不是关键词工具的搜索量（本项目不接任何关键词工具）。
2. 表单：机会输入放在独立 fieldset 内，说明文字直接写「These are not the SEO or GEO audit scores」。
3. 详情页：**把目标商品的实测审计分并排显示**，并标注「They take no part in the opportunity score above」。集成测试专门验证——跑完 SEO/GEO 审计后实测分出现了，机会分一分不变。

**列表、筛选、创建、编辑、状态流转。** `/content` 提供搜索（匹配 topic 与关键词）与四组筛选（状态、意图、漏斗、类型，字段内并集、字段间交集）、行内状态下拉、新建表单；`/content/[id]` 提供完整编辑与分数拆解。全部持久化到浏览器存储。

**商品关系校验。** 创建与编辑都会验证 targetProductId 存在于目录，不存在则拒绝写入；若存储中已有指向已删除商品的记录，列表与详情显示「Missing product」警示而不是静默当作无目标。

**示例计划可解释优先级。** 10 条选题覆盖全部 4 种意图、3 个漏斗层和 6 种内容类型。按机会分排序后首位是「Best two-person backpacking tents under $400」（82 分）——Commercial 意图 + 高 SEO 机会 + 强商品相关度，压过纯信息类博客。

**验收标准对照：**

| 验收项 | 落实方式 |
|---|---|
| 新建、编辑、筛选、状态切换与刷新持久化可用 | E2E 逐项实测，含刷新后复查 |
| 无效商品、空标题、越界机会分被拒绝 | 单元 + 集成 + E2E 三层覆盖 |
| 相同输入产生相同分数 | 单元测试断言确定性 |
| 权重合计为 1，结果在 0–100 | `weightsSumToOne()` 专项测试；四种意图 × 极值组合全覆盖 |
| unit 覆盖每种意图、极值与非法输入 | 越界、负数、小数、非数字、NaN、Infinity 均有用例 |
| integration 验证内容和商品关系及存储失败 | 悬空商品、存储失败、不存在的 idea 各有用例 |
| E2E 完成创建→编辑→筛选→刷新 | 18 条 E2E |
| 示例计划包含不同意图/漏斗阶段并能解释优先写哪篇 | 集成测试断言意图 4 种、漏斗 3 层齐全；E2E 断言首位选题 |

## 2. 修改的核心文件

**新增 — 领域层（纯函数）**

| 文件 | 目的 |
|---|---|
| `src/domain/content/opportunity.ts` | 权重、意图映射、评分与拆解；文件头写明输入的来源与局限 |
| `src/domain/content/content-validation.ts` | 表单校验、逗号分隔关键词解析、稳定 id 生成 |
| `src/domain/content/content-filters.ts` | 搜索、四维筛选、按机会分排序 |

**新增 — 数据、服务与 UI**

`src/fixtures/demo-content.ts`（10 条示例选题）、`src/services/content-service.ts`、`src/components/content/{content-form,content-list-view,content-detail-view}.tsx`、`src/app/content/[id]/page.tsx`。

**修改**

| 文件 | 修改目的 |
|---|---|
| `src/domain/schemas.ts` | 新增 `contentIdeaSchema` 与 0–100 机会分 schema |
| `src/repositories/types.ts` | `DemoState` 增加 `contentIdeas`，**SCHEMA_VERSION 3 → 4** |
| `src/fixtures/demo-seed.ts` | 种子数据带上内容计划 |
| `src/components/ui/table.tsx` | 滚动容器加 `relative`（见已知问题 1） |
| `src/app/content/page.tsx`、`nav-items.ts` | 页面与导航接入 |

## 3. 测试结果

`rm -rf node_modules .next` 后按顺序一次跑通。**本次修正了门禁脚本本身**：此前的写法用 `{ ...; } > log` 分组，整体退出码只反映最后一条命令，E2E 失败不会让整体失败。现在逐条捕获退出码并汇总 `fail=`。

| 命令 | 结果 | 实际数量 | 相比 Dispatch 4 |
|---|---|---|---|
| `npm ci` | PASS | 428 packages | — |
| `npm run lint` | PASS | 0 problems | — |
| `npm run typecheck` | PASS | 无输出 | — |
| `npm run test -- --run` | PASS | **15 文件 / 246 通过，0 失败 0 跳过** | +41 |
| `npm run test:integration -- --run` | PASS | **9 文件 / 161 通过，0 失败 0 跳过** | +26 |
| `npm run test:e2e` | PASS | **96 通过，0 失败 0 跳过** | +17 |
| `npm run build` | PASS | 17 条路由 | — |
| `OVERALL` | **fail=0** | — | — |

E2E 另外**连续重跑 3 次，均 96 通过**，确认修复后的稳定性。

**过程中真实失败 5 次：**

1. lint 报未使用的 import → 删除。
2. `getByLabel('Search intent')` 命中 2 个元素（筛选组的 `role="group"` 也叫这个名字）→ 改用 `getByRole('combobox', …)`。
3. `getByText('Choosing between a tarp and a tent')` 命中 2 个（行内状态下拉的 sr-only 标签也含该文本）→ 改用 testid。
4. **375px 横向溢出 452px——真实布局缺陷**，详见已知问题 1。
5. **两类 E2E 竞态**：`goto` 后立即 `count()` 行数，客户端还没渲染就数到 0。内容数据变多后延迟变化把它暴露了。已在 products / content / seo / geo 四个 spec 中统一补上等待。

## 4. 验收证据

**浏览器人工核对**（生产构建 + `next start`）：

- 1440px：`/content` 显示 10/10 条，按机会分降序；首位「Best two-person backpacking tents under $400」82 分，次位「Headlamp runtime」76，第三「Ridgeline 2P vs 3P」73。四组筛选、搜索框、新建按钮布局正常。
- 手工验算首位分数：0.35×82 + 0.25×74 + 0.20×80 + 0.20×95 = 28.7 + 18.5 + 16 + 19 = 82.2 → **82** ✓ 与界面一致。
- 375px：溢出修复后实测 `scrollWidth - clientWidth = 0`，筛选按钮换行正常，表格在容器内横向滚动。

**E2E 实测的关键链路**（非人工但已自动化）：新建选题 → 分数预览实时显示 72 → 保存 → 刷新后仍在；编辑机会分 → 详情分数变 88 → 回列表该行也是 88；行内改状态 → 刷新保持 → 按状态筛选数量 +1；非法输入被拒且输入保留、刷新后未写入；存储失败提示并保留输入。

**未运行：** 截图未落盘（Dispatch 9 范围）；Firefox / WebKit 未跑；未做屏幕阅读器实测；768px 未人工查看。

## 5. 当前已知问题

**本阶段发现并修复的真实缺陷：**

1. **表格滚动容器缺少 `relative`，导致移动端整页横向溢出 452px。** 行内状态下拉的 `sr-only` 标签是 `position: absolute`，其包含块是根元素而非滚动容器，因此逃出了 `overflow-x: auto` 的裁剪，把根元素的滚动宽度撑大。这是**在浏览器实地测量后定位的**——`getBoundingClientRect` 对被裁剪元素仍返回完整尺寸，靠肉眼和常规排查都看不出来，最后是用逐个隐藏卡片对比 `scrollWidth` 二分定位的。修复是给 `TableWrapper` 加 `relative`，使其成为包含块。**此前的产品 / SEO / GEO 表格也共享这个组件**，虽然当时没有绝对定位的子元素而未暴露，现在一并加固。

**必要偏离与原因：**

2. **`SCHEMA_VERSION` 3 → 4。** 新增 `contentIdeas`，旧存储回落种子数据。
3. **机会分的四项输入里有三项是人填的。** 这是规格要求的设计（编辑者的机会判断），但意味着分数的可信度取决于填写者。界面、注释和详情页都做了区分说明，面试解释时必须主动交代——否则容易被误认为是系统算出来的。
4. **`commercialIntent` 的四个映射值（100/80/40/30）是项目设定**，没有外部依据。集中在 `INTENT_COMMERCIAL_VALUE`，可配置。
5. **内容 id 由 topic 派生**（`idea_<slug>`，冲突时加序号）。好处是可读，代价是改标题后 id 不变、可能与内容不符。选择稳定 id 而非可读性，是因为链接和已保存状态不该因改标题而失效。
6. **没有实现删除。** 规格范围里没有，因此不做。状态可以退回 Idea，但记录无法移除。
7. **`Published` 状态只是计划记录**，不对外发布、不接 CMS。界面上写明「nothing is sent anywhere」。
8. **内容列表的加载失败态与其他模块不完全一致。** `?demo=error` 只让流量源失败，而内容计划读的是 state 仓库，所以该模式下内容列表仍正常显示。E2E 对此只做了弱断言。若要演示内容模块的错误态，需要一个让 state 读取失败的模式——目前 `storage-error` 只让写入失败。这是 QA 接缝的覆盖缺口，不是产品缺陷。

**上游兼容问题**（不变）：TypeScript 固定 6.0.3；ESLint 显式声明 React 版本；`unrs-resolver` postinstall 被拦截。

**未提交的动作：** 未配置远程、未 push、未部署。

除上述条目外，**无已知阻塞问题**。

## 6. 下一 Dispatch 建议

Dispatch 6：Analytics（`docs/06-analytics.md`）。统一 90 天确定性数据，8 个渠道，Sessions / Users / Revenue / Orders / Conversion Rate / AOV / CAC / ROAS，Overview、Traffic Trend、Channel Breakdown、Revenue by Channel、Conversion by Channel、AI Referral 六个区块，7/30/90 天切换且过滤范围统一传给所有图表。

需要一并处理的几件事：

- **补齐 `ChannelSpend` 数据**：目前流量 fixture 只有会话与订单，没有花费记录，CAC 和 ROAS 算不出来。需要区分 `acquisitionSpend`（喂 CAC）与 `adSpend`（喂 ROAS），无花费基础的渠道显示 N/A 而非「无限 ROAS」。
- **Dashboard 要切换到统一数据源**并补齐 Organic Revenue、CAC、ROAS、趋势、渠道构成、Top Landing Pages、Top Products——目前 Dashboard 只有六项指标。
- **会话基数偏小**（90 天 2,805 次会话、72 笔订单），Dispatch 2 报告里已提过，重建完整数据集时可提高日均基数让渠道级数字更稳。
- 需要引入图表库（Recharts），这是本项目第一次装 UI 依赖之外的库。
- AI Referral 的 source 标签只是演示标签，界面需说明真实 AI 引荐流量经常被错误归类或根本不可见。

仅为建议，等待用户确认。

## 7. 状态

本阶段全部门禁通过，**Dispatch 5 完成**。

已停止，等待用户确认下一 Dispatch。
