# Dispatch 10 — PASS

执行日期：2026-09-21　｜　环境：macOS (darwin 25.6.0)、Node v24.18.0、npm 11.16.0、Chromium (Playwright 1.63)

## 1. 本次完成内容

对照 `docs/10-amazon-listing.md` 的范围与验收标准逐条说明。

### 数据模型

`AmazonListing` 指向已有的 `Product`（一个 listing 对应一个 SKU），新增 17 条 listing 覆盖全部现有商品。字段按 Seller Central 能导出的形状建模：ASIN、标题、五点描述、A+ 模块、后台搜索词、图片数、主图合规、视频、品类节点、品牌备案、变体关系、评论数与评分、Buy Box 占比、配送方式、状态。

`TriState`（yes / no / **unknown**）是一等值：**主图是否纯白背景是图片文件的属性，本项目从不接触图片文件**。记 Unknown 并报成覆盖率缺口是诚实的，猜 yes 是编造结论。

### 规则引擎 `amazon-listing-1.0.0`

**14 条规则**（方案里写 12 条，实际做到 14 条：把 `listing-status` 与 `buy-box` 从"附带检查"提成独立规则，因为它们各自能单独决定一个 listing 是否在卖）：

`listing-status` · `title-length` · `title-structure` · `bullets-count` · `bullets-length` · `image-count` · `main-image-compliance` · `video-present` · `aplus-content` · `backend-search-terms` · `browse-node` · `variation-relationship` · `review-health` · `buy-box`

**不是把 SEO 那 12 条改名。** canonical、robots、内链在亚马逊上没有意义；五点描述、后台搜索词、变体家族、Buy Box 在独立站上没有意义。两套规则只共用形状。

几条值得单独说的：

- **`backend-search-terms` 按 UTF-8 字节校验，不按字符。** Amazon 上限 250 字节，一个中文字 3 字节、emoji 4 字节。按字符校验会放行一个被 Amazon 静默截断的值——用户看到保存成功，内容丢了一半。规则与表单校验共用同一个 `byteLength()`。
- **`review-health` 拒绝从小样本下结论。** 评分 3.5 但只有 6 条评论时标低置信 warning 并写明"不要据此行动"，而不是判 error。与 Dispatch 6/7 的低样本纪律一致。
- **`aplus-content` 在未品牌备案时返回 unknown**，不是 error——A+ 根本不可用，那不是这个 listing 的过错。
- **`title-structure` 从 `Product` 读品牌名**，不硬编码字符串，所以改名之后规则不会继续断言旧名字（有测试锁定）。

计分沿用 `pass 1 / warning 0.5 / error 0`，**unknown 同时排除出分子与分母**。

### 抽出共享计分（必要的小重构）

状态加权计分原本在 `seo-audit/engine.ts`，GEO 服务已经跨模块 import 它的 tally 工具。第三个引擎需要同一套算术时，**CLAUDE.md 明令「不要复制评分公式」**，所以移到中立的 `src/domain/audit-scoring.ts` 而不是复制一份。移动后全量单元测试 367 条原样通过，证明是行为中性的。GEO 仍用自己的 0/5/10 分档——那是不同的公式，留在 GEO 引擎里。

### 两个渠道共享商品，绝不合并指标

这是本模块被允许存在的前提，所以用测试而不是注释来保证：

- **集成测试**：跑完全部 listing 审计 + 改完一条 listing 之后，`loadDashboard()` 的返回值与之前 `toEqual` 完全相等。
- **E2E**：同一件事在浏览器里再验一遍，比对 Dashboard 全部指标卡的文本。
- **`listingAudits` 与 `auditResults` 分开存**，测试断言跑完 listing 审计后 `auditResults` 仍为空。
- 界面上有固定的 `ChannelSeparationNote`，在概览页和详情页各出现一次。

### 接入 Recommendations

`RECOMMENDATION_SOURCES` 增加 `'amazon'`，新增第六个 builder。**`suppressed` 与商品 `draft` 的降权方向相反**：草稿没发布，问题影响不了任何东西 → 降权 2 分；被压制的 listing 曾经在卖、**现在正在丢单** → 绝不降权。`inactive` 才是草稿的真正对应物。两个函数分开，各有测试锁定。

### 验收标准对照

| 验收项 | 结果 |
|---|---|
| 15+ listing，缺陷分布合理可解释 | 17 条，分数 21–96 |
| `unknown` 真实存在且被正确处理 | 5 处 unknown，集成测试断言其数量 > 0 |
| 14 条规则各有单元测试，覆盖四种结果与边界值 | 51 条单元测试 |
| 后台搜索词按字节计算，有多字节用例 | 有；含一条 246 字符 / 261 字节的 fixture |
| 编辑 → stale → 重新审计 → 清除 | 集成 + E2E 各一条 |
| suppressed 不被降权 | 单元测试锁定 |
| 两渠道指标不相加 | 集成 + E2E 各一条 |
| 375 / 768 / 1440 无溢出 | E2E 逐档巡检两条路由 |
| 全部门禁通过 | 见下 |

## 2. 修改的核心文件

**新增**

| 文件 | 目的 |
|---|---|
| `src/domain/audit-scoring.ts` | 抽出的共享状态加权计分 |
| `src/domain/amazon/config.ts` | 阈值、14 条规则元信息、版本号、免责声明 |
| `src/domain/amazon/rules.ts` | 14 条纯函数规则 + `byteLength` |
| `src/domain/amazon/engine.ts` | 组装、指纹、staleness、upsert |
| `src/domain/amazon/listing-validation.ts` | 表单校验（字节上限） |
| `src/services/amazon-service.ts` | 读取、审计、保存 |
| `src/fixtures/demo-amazon.ts` | 17 条 listing |
| `src/components/amazon/*` | 概览、详情、免责与渠道分离说明 |
| `src/app/amazon/page.tsx`、`[listingId]/page.tsx` | 路由 |

**修改**：`types.ts`（Amazon 类型 + `'amazon'` 来源）、`schemas.ts`、`repositories/types.ts`（**SCHEMA_VERSION 5 → 6**）、`demo-seed.ts`、`recommendations/{config,aggregate}.ts`、`recommendation-service.ts`、`nav-items.ts`、`seo-audit/engine.ts` 与两个 service（改 import）、`about-view.tsx`、`README.md`、三个 E2E 巡检清单。

## 3. 测试结果

`rm -rf node_modules .next` 后逐条捕获退出码：

| 命令 | 结果 | 实际数量 | 相比 Dispatch 9 |
|---|---|---|---|
| `npm ci` | PASS | 428 packages | — |
| `npm run lint` | PASS | 0 problems | — |
| `npm run typecheck` | PASS | 无输出 | — |
| `npm run test -- --run` | PASS | **22 文件 / 435 通过，0 失败 0 跳过** | +68 |
| `npm run test:integration -- --run` | PASS | **14 文件 / 263 通过，0 失败 0 跳过** | +27 |
| `npm run test:e2e` | PASS | **185 通过，0 失败 0 跳过** | +19 |
| `npm run build` | PASS | 17 条路由 | +2 |
| `OVERALL` | **fail=0** | — | — |

### 过程中真实失败 4 次

1. **保存失败时的措辞放错了层。** 我把"你的改动还在"写进 service 的 fallback 文案，但 `messageFrom` 只在 cause 不是 Error 时才用 fallback——底层错误有自己的 message 时，这句安慰永远出不来。改成 service 只报原因、**UI 负责补这句**，与商品表单既有的分工一致（UI 才是真正还握着用户输入的那一层）。
2. **一个我自己假设错的测试。** 我断言被压制的 listing 应该排在整个任务清单第 1 位，实际是第 2 位。见第 5 节——这是设计张力，不是 bug，我改的是断言而不是权重。
3. 单元测试里商品类别写了 `'Tents'`，实际枚举是 `'Tents & Shelters'`。
4. **fixture 没达到我自己的设计意图。** 雨衣的后台搜索词我本想做成"字符数看着没超、字节数超了"的样例，第一次写出来是 207 字符 / 217 字节——**根本没超 250 字节限制，规则不会触发**。重新调到 246 字符 / 261 字节。如果不实测这一条，这个 fixture 会一直假装在演示一个它并没有触发的规则。

**门禁全部通过后才写本报告。没有删测试、跳过用例或弱化断言。**

## 4. 验收证据

**浏览器人工核对**（生产构建 + `next start`）：

- 跑完全部审计后：**平均分 83、suppressed 1、critical 18、warnings 40**，与独立探针脚本的输出逐项一致。
- **分数分布 21–96**：最差是 Summit 20 睡袋（标题只有 "Sleeping Bag"、无五点、无后台词、无品类节点、2 张图、Buy Box 62%），最好是 Emberlite 炉具 96 分。
- 详情页实测：14 条检查全部渲染，含状态徽章、严重度、发现、建议与证据；未审计时显示 "Not audited" 而非 0。
- 编辑表单实测：字节计数器实时显示 `118 of 250 bytes (118 characters)`；填入 246 字符的西语串后显示 `261 of 250 bytes` 并提示超限。
- Recommendations 实测：Amazon 任务带 Amazon 徽章、Critical/Quick Win 标记、证据含 ASIN、深链回 `/amazon/lst_*`。

**自动化证据**：渠道不混算（集成 + E2E）、编辑→stale→重审计、字节上限拒绝保存且保留输入、suppressed 不降权、三档宽度无溢出、零 console error。

**未运行**：截图未更新（`docs/screenshots/` 仍是 Dispatch 9 的 14 张，不含 Amazon 页）；Firefox / WebKit 未跑；屏幕阅读器未实测。

## 5. 当前已知问题

**一个值得单独说的设计张力（已确认是正确行为，不是缺陷）：**

在被压制的 TrailCell 灯上，任务排序把 **`main-image-compliance`（impact 5 / effort 2 → Quick Win）排在 `listing-status`（impact 5 / effort 3 → Strategic）之前**。我最初以为这是排序 bug，查下去发现是对的：**这个 listing 正是因为主图不合规才被压制的，换主图就是解除压制的手段**。跨来源排序在同优先级下把 Quick Win 排在 Strategic 之前，结果恰好让「可执行的根因」排在「症状」之前。

我把断言改成了实际正确的行为（两条都是 Critical、都排在该 listing 其他任务之前），而**没有去调权重让我原来的假设成真**。这类"先有假设、再被数据纠正"的地方，改假设比改数据诚实。

**相关但未解决的**：被压制的 listing 在**全站**任务清单里不是第 1 位——一个高流量 live 页面的 Quick Win 会排在它前面。可以论证"整体停售"应该压过任何 Quick Win，但那需要在共享排序里引入"停售"概念，会影响其余五个来源，**超出本阶段范围**。Amazon 概览页的问题表按严重度排序，压制问题在那里确实是第一条。两处排序回答的是不同问题。

**其余已知问题：**

1. **`SCHEMA_VERSION` 5 → 6**，旧存储回落种子数据。
2. **只有美国站**，`AMAZON_MARKETPLACES` 目前只有一个值。多站点需要按站点分别存 listing 与审计。
3. **规则阈值是本项目自定的**，不是 Amazon 的公布要求——真实的标题字符上限、图片要求按 browse node 变化，fixture 表达不了这种差异。界面固定声明了这一点。
4. **一个 listing 对应一个商品**，没有建模一个 SKU 多 ASIN 或一个 ASIN 多 SKU（捆绑）的情况。
5. **变体关系靠 `expectedVariationSiblings` 声明**，而不是从商品目录推导。真实场景应该由品类 + 属性推导出"这些应该是一家人"。
6. **截图未覆盖 Amazon 页**，README 的截图索引仍是 14 张。
7. 上游兼容（不变）：TypeScript 固定 6.0.3；ESLint 显式声明 React 版本。

**未提交的动作**：未配置远程、未 push、未部署。

除上述条目外，**无已知阻塞缺陷**。

## 6. 下一 Dispatch 建议

**Dispatch 11：Amazon Search Terms & Advertising Efficiency**（`docs/11-amazon-advertising.md`，方案已写好待确认）。

核心内容：Search Term 与投放词分离建模、ACOS / TACOS / CTR / CVR / CPC、Unit Session Percentage、收割与否定候选。

**两个口径陷阱在方案里已经写明，实现时必须守住：**

- **Amazon 的 CVR 分母是点击，独立站的 CVR 分母是会话。** 这两个数如果同屏出现而不标注口径差异，就是本项目一直在反对的那类错误。
- **ACOS 不能静默换算成 ROAS 再和独立站渠道并排。** 数学上 `ROAS = 1 / ACOS`，但归因窗口不同，且 ACOS 只覆盖广告销售、TACOS 才覆盖总销售。

**建议一并处理（小）**：补跑 `npm run screenshots` 覆盖 Amazon 两个页面，并更新 README 截图索引——本阶段没做。

仅为建议，等待用户确认。

## 7. 状态

本阶段全部门禁通过，**Dispatch 10 完成**。

已停止，等待用户确认下一 Dispatch。
