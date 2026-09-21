# Dispatch 8 — PASS

执行日期：2026-09-21　｜　环境：macOS (darwin 25.6.0)、Node v24.18.0、npm 11.16.0

## 1. 本次完成内容

对照 `docs/08-recommendations.md` 的范围与验收标准逐条说明。

**五类来源全部接入，且复用已有引擎、不复制公式：**

| 来源 | 触发条件 | 链接去向 |
|---|---|---|
| SEO | 审计结果中 status 为 error / warning 的检查项 | `/seo/[pageId]` + 商品页 |
| GEO | 得分低于 10 分的规则 | `/geo/[pageId]` + 商品页 |
| Content | 机会分 ≥ 70 且仍停在 Idea 的选题 | `/content/[id]` |
| Analytics | 高流量低转化 / ROAS 低于目标 / CAC 相对 AOV 过高 | `/analytics` |
| Funnel | 低于阈值或最大流失的步骤（每步一条任务，不是每条假设一条） | `/funnel` |

SEO 和 GEO 的判定完全来自各自审计引擎的输出；漏斗任务来自漏斗引擎的分析；Analytics 的渠道行来自 `channel-metrics`。**本模块只决定"什么值得当作任务、大概值多少、去哪里做"，不重算任何一个分数。**

**稳定任务标识。** `id = rec_<source>_<hash(source, ruleId, sourceEntityId)>`。同一页面的同一规则永远是同一个 id；不同页面的同一规则是不同任务；不同来源的同名 ruleId 也不会撞。集成测试验证了重复加载产生完全相同的 id 列表。

**完成状态独立持久化。** `DemoState` 只存 `{ id, status, updatedAt }`，任务本身每次都重新生成，因此不可能过期。撤销完成时**删除记录而不是存 "Open"**——没有决定本身就是 Open 的含义。

**来源消失的处理。** 已完成但来源问题已不存在的任务，移到"Completed, source no longer reporting"区块，标 `active: false`，不再列为待办但保留决定记录。集成测试实测了完整链路：标记完成 → 修好商品元数据 → 重跑审计 → 该条从待办消失、出现在历史区。

**证据变化而标识不变时**展示最新证据并保留既有完成状态（单元测试锁定）。

**Impact / Effort 1–5 档 + 四象限。** 每条规则的权重和**理由**都写在 `config.ts` 里（例如"缺标题：影响 5、工作量 1 —— 页面在搜索结果里没有标题，而修复只是填一个字段"）。象限按 `impact ≥ 4 && effort ≤ 2 = Quick Win` 等规则映射。界面上可展开查看 1–5 档各自的含义，并明确写着**这是估计不是收益保证**。

**Analytics 阈值全部配置化**：最低会话数 300（低于此不产生任何结论）、最低订单数 25（低于此标"仅供参考"）、低转化 1.5%、ROAS 下限 2、CAC 占 AOV 上限 50%。

**验收标准对照：**

| 验收项 | 落实方式 |
|---|---|
| 五类来源各有至少一个可解释 fixture | 集成测试逐源断言 reason / suggestedAction / link / ruleVersion 非空 |
| 无问题输入不制造任务 | 未审计的页面不产生 SEO/GEO 任务；清空内容计划后 content 源静默；低于最低流量的渠道不产生结论 |
| unit 验证生成、去重、稳定 ID、优先级排序、矩阵象限、缺数据与低样本处理 | 42 条单元测试 |
| integration 验证重复刷新/生成后 Done 保留、撤销生效、来源消失处理 | 20 条集成测试 |
| 不把同一规则的不同页面误合并 | 集成断言 keyword-usage 在多个页面上是多条独立任务、id 互不相同 |
| E2E 覆盖筛选→查看证据→完成→刷新→撤销 | 16 条 E2E |
| 所有深链正确 | E2E 逐一点击 SEO / Funnel / Content / 商品链接并断言 URL |

## 2. 修改的核心文件

**新增**

| 文件 | 目的 |
|---|---|
| `src/domain/stable-id.ts` | 规则 + 实体的稳定哈希 |
| `src/domain/recommendations/config.ts` | 每条规则的影响/工作量与理由、象限映射、优先级映射、Analytics 阈值 |
| `src/domain/recommendations/aggregate.ts` | 五个来源的构建器与状态合并 |
| `src/domain/recommendations/sorting.ts` | 筛选、排序、计数 |
| `src/services/recommendation-service.ts` | 调用各引擎、合并决定、读写状态 |
| `src/components/recommendations/recommendations-view.tsx` | 任务中心页面 |

**修改**

| 文件 | 修改目的 |
|---|---|
| `src/domain/types.ts` | 新增象限、状态记录类型；Recommendation 增加 `link` / `quadrant` / `active` |
| `src/domain/schemas.ts` | 状态记录校验 |
| `src/repositories/types.ts` | `DemoState` 增加 `recommendationStatuses`，**SCHEMA_VERSION 4 → 5** |
| `src/components/layout/nav-items.ts` | Recommendations 标记为已实现 |

## 3. 测试结果

`rm -rf node_modules .next` 后逐条捕获退出码：

| 命令 | 结果 | 实际数量 | 相比 Dispatch 7 |
|---|---|---|---|
| `npm ci` | PASS | 428 packages | — |
| `npm run lint` | PASS | 0 problems | — |
| `npm run typecheck` | PASS | 无输出 | — |
| `npm run test -- --run` | PASS | **19 文件 / 360 通过，0 失败 0 跳过** | +42 |
| `npm run test:integration -- --run` | PASS | **12 文件 / 224 通过，0 失败 0 跳过** | +24 |
| `npm run test:e2e` | PASS | **144 通过，0 失败 0 跳过** | +16 |
| `npm run build` | PASS | 19 条路由 | — |
| `OVERALL` | **fail=0** | — | — |

**过程中真实失败 3 次：**

1. **`assertCents` 抓到一个真实缺陷。** 我在生成 Analytics 的说明文字时直接调了要求整数分的 `formatCents`，但 CAC 和 AOV 是除法结果、可能带小数分，21 条集成测试同时炸掉。改用会取整的 `formatMoneyMetric`。**这正是 Dispatch 0 定下的整数分约束存在的意义**——它把一个本来会静默输出错误金额的问题变成了硬错误。
2. typedRoutes：domain 层存的 `link` 是纯字符串（domain 不应该知道 Next 的路由类型），在 UI 边界处转换。
3. lint 的 `eqeqeq`：测试里用了 `== null`，改成显式的 undefined/null 判断。

## 4. 验收证据

**浏览器人工核对**（生产构建 + `next start`，1440px，实际跑完 SEO 与 GEO 审计后打开）：

**Open tasks 130、Critical 42、Quick wins 11、Done 0。**

来源分解核对：SEO 45 条（Dispatch 3 实测 15 error + 30 warning）+ GEO 76 条（Dispatch 4 实测未达标规则数）+ Content / Analytics / Funnel 共 9 条 = 130 ✓。

**首位任务实测：** "Direct answer availability — Summit 20 Down Sleeping Bag"，Critical / GEO / Quick Win，Impact 5 · Effort 2 · geo-1.0.0，证据 `directAnswer: absent`，建议"加一句带数字的、直接回答页面核心问题的话"。这是一条好建议——最差的上架页面，一句话就能修。

**深链实测：** 每条都有"Open the page this is about"和"Open the product"；E2E 点击后分别落到 `/seo/snap_*`、`/geo/snap_*`、`/content/idea_*`、`/funnel`、`/products/prd_*`。

**完成流程实测（E2E）：** 标记完成 → 计数变 1 → 刷新仍为 Done → 按状态筛选能找到 → 撤销 → 刷新回 Open，且存储中记录已被删除。

**未运行：** 截图未落盘（Dispatch 9 范围）；Firefox / WebKit 未跑；未做屏幕阅读器实测；768px 未人工查看。

## 5. 当前已知问题

**本阶段发现并修复的排序缺陷：**

1. **草稿商品的问题一度排在列表最前面。** 第一次可视核对时，前两条都是 "TrailCell Rechargeable Lantern" 的元数据缺失——而那是一个 **draft** 商品，页面根本没上线。告诉运营"你最该做的事是修一个未发布草稿的 meta"是糟糕的建议。
   修法：非 active 商品的页面级发现，影响分减 2（下限 1），并在理由里写明"这个商品是 draft/archived，问题真实存在但在发布前不会影响任何指标"。**不隐藏**——一个即将上线的草稿确实该修，只是不该排第一。修复后这些条目从第 1 位降到第 75 位（共 130 条），Critical 从 56 降到 42，首位变成一条真正live页面的 Quick Win。

**必要偏离与原因：**

2. **`SCHEMA_VERSION` 4 → 5**，旧存储回落种子数据。
3. **任务总量偏大（130 条）。** 这是引擎如实报告的结果，不是缺陷，但一次性看到 130 条任务对运营并不友好。当前的答案是筛选器 + Quick wins 计数 + 优先级排序。Dispatch 9 打磨时可以考虑默认只展开 Critical，或按来源分组折叠。
4. **漏斗任务按步骤聚合**（一步一条，假设写在 suggestedAction 里），而不是每条假设一条任务。否则光漏斗就会贡献 11 条，淹没其他来源。
5. **历史区的条目信息很少**——只有 id、完成时间和一句说明。因为一旦来源问题消失，原始的标题、证据和链接就无从恢复（它们本来就不持久化）。要保留完整历史就得把任务快照一起存下来，那会带来"存下来的任务和引擎现在的判断不一致"的老问题。这是刻意的取舍。
6. **影响与工作量是按规则类别定的常量**，不因具体页面的流量或营收而变。一个零流量页面的缺标题和一个高流量页面的缺标题，目前得到相同的影响分（除了上面的草稿降权）。用流量加权是合理的下一步，但需要把商品级流量接进聚合层。
7. **没有"忽略/不适用"状态**，只有 Open / Done。规格只要求这两种。实际使用中"这条不适用于我们"是常见需求。

**上游兼容问题**（不变）：TypeScript 固定 6.0.3；ESLint 显式声明 React 版本；`unrs-resolver` postinstall 被拦截。

**未提交的动作：** 未配置远程、未 push、未部署。

除上述条目外，**无已知阻塞问题**。

## 6. 下一 Dispatch 建议

Dispatch 9：Portfolio Polish（`docs/09-portfolio-polish.md`）——最后一个阶段。

范围要点：

- 统一组件、视觉层级、数字格式、按钮文案与四种状态；修复桌面 / 平板 / 手机布局（**768px 至今没有人工核对过，这是累积的缺口**）。
- 可访问性：键盘、焦点、表单标签、图表摘要、对比度、状态提示。**屏幕阅读器实测至今未做**，需要真正跑一次。
- 性能：生产构建下记录关键页面的测量方法、结果与改进。
- 校验 15+ SKU、90 天数据、审计分数、各页指标、推荐证据与持久化一致；确认无随机漂移。
- Dashboard 跨模块链接完整，展示各阶段已交付的全部指标与摘要。
- 新增 `/about-project`：动机、问题、方法、六个模块的关系、模型局限。
- 扩充根 README：背景、业务问题、目标、功能、实际技术架构、SEO/GEO 设计、数据模型、核心指标、安装运行测试、截图位置、未来规划。
- **截图落盘到 `docs/screenshots/`**（前八个阶段都记为"未运行"，这里要补上），3–5 分钟演示路径与面试讲解提纲。
- 回归流程：商品 SEO 编辑 → 审计 stale → 重跑 SEO/GEO → 内容计划 → Analytics → Funnel → Recommendation 完成并刷新。

另外建议一并处理的历史遗留项：

- Firefox / WebKit 从未跑过 E2E，若要在报告里声称跨浏览器可用需要实测。
- Top Landing Pages / Top Products 目前只在 Analytics（Dispatch 6 的取舍），规格原本列在 Dashboard 补齐项里。
- 各阶段报告中记录的数字随数据集调整而变化过，Dispatch 9 应统一复核一遍最终数值。

仅为建议，等待用户确认。

## 7. 状态

本阶段全部门禁通过，**Dispatch 8 完成**。

已停止，等待用户确认下一 Dispatch。
