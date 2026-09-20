# GrowthOS 初始总 Prompt

> 下文保留原对话的总 Prompt。执行细节以根目录 `CLAUDE.md` 和当前 Dispatch 为准；此文件描述全局愿景，不授权一次性实现全部模块。
> 原 Prompt 的首次响应仅做只读扫描与规划；用户确认执行 Dispatch 0 后，才初始化最小工程并运行质量门禁。

你现在是这个项目的技术负责人和产品工程师。

我要开发一个用于求职作品集的项目：

GrowthOS — DTC 独立站 SEO / GEO 增长与转化分析工作台

项目目标：
不是简单做一个电商后台，而是模拟一个真实的跨境独立站运营团队如何进行：

1. 商品管理
2. SEO 优化
3. GEO（Generative Engine Optimization）优化
4. 内容运营
5. 流量分析
6. 转化漏斗分析
7. 营收与营销数据分析
8. 页面优化建议

这个项目最终会用于我的跨境电商运营 / 独立站运营 / SEO / GEO / 数据运营相关岗位求职。

我的背景是前端开发，所以项目既需要有真实的业务逻辑，也需要体现较好的前端工程能力、数据建模能力和产品思维。

--------------------------------
一、技术原则
--------------------------------

请优先采用现代、稳定、适合作品集展示的技术栈。

建议：

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui 或同等级组件体系
- PostgreSQL
- Prisma
- Recharts 或类似图表库
- Zod
- React Hook Form
- Vitest / Jest
- Playwright

如果当前项目环境已经存在技术栈，请优先兼容现有架构，不要为了使用上述技术而无意义重构。

代码要求：

- TypeScript strict mode
- 清晰的目录结构
- UI 与业务逻辑分离
- 数据访问层独立
- 公共类型统一管理
- 尽可能避免 any
- 所有核心计算函数必须可测试
- 关键页面必须有 loading / empty / error state
- 不要过度工程化
- 优先保证项目可运行、可展示、可解释

--------------------------------
二、项目核心模块
--------------------------------

项目至少包含：

1. Dashboard
2. Products
3. SEO Audit
4. GEO Audit
5. Content Planner
6. Analytics
7. Conversion Funnel
8. Recommendations

--------------------------------
三、Dashboard
--------------------------------

Dashboard 展示：

- Sessions
- Revenue
- Orders
- Conversion Rate
- Average Order Value
- Organic Traffic
- Organic Revenue
- Add-to-cart Rate
- Checkout Rate
- ROAS
- CAC

同时展示：

- 流量趋势
- 渠道构成
- Top Landing Pages
- Top Products
- SEO Issues
- GEO Issues
- Conversion Alerts

--------------------------------
四、商品模块
--------------------------------

商品字段至少包括：

- id
- sku
- title
- slug
- category
- price
- cost
- status
- inventory
- primaryKeyword
- metaTitle
- metaDescription
- productDescription
- seoScore
- geoScore
- organicSessions
- conversionRate
- revenue

支持：

- 商品列表
- 搜索
- 筛选
- 商品详情
- 编辑 SEO 信息

--------------------------------
五、SEO Audit
--------------------------------

SEO Audit 至少检查：

- title 是否存在
- title 长度
- meta description 是否存在
- meta description 长度
- H1
- canonical
- image alt
- internal links
- structured data
- indexability
- URL slug
- keyword usage

每项输出：

- pass
- warning
- error

并计算 SEO Score。

每个问题需要提供：

- issue
- severity
- explanation
- recommendation

--------------------------------
六、GEO Audit
--------------------------------

这里的 GEO 指 Generative Engine Optimization。

检查页面是否适合生成式搜索系统理解和引用。

检查：

- 页面主题是否明确
- 是否存在直接回答问题的内容
- 是否有 FAQ
- 是否有结构化标题
- 是否有明确产品事实
- 是否有品牌实体信息
- 是否有来源/证据
- 是否有原创内容
- 是否容易提取关键结论
- 是否存在内容模糊或营销话术过多的问题

输出：

- GEO Score
- GEO Issues
- GEO Recommendations

注意：
GEO 评分模型属于本项目自行设计的启发式模型，不要声称它是 Google、OpenAI 或其他公司的官方排名算法。

--------------------------------
七、Content Planner
--------------------------------

可以根据：

- keyword
- search intent
- funnel stage
- target product

管理内容。

字段：

- topic
- primaryKeyword
- secondaryKeywords
- searchIntent
- funnelStage
- contentType
- status
- targetProduct
- seoOpportunity
- geoOpportunity

内容类型包括：

- Blog
- Buying Guide
- Comparison
- FAQ
- Product Guide
- Landing Page

--------------------------------
八、Analytics
--------------------------------

渠道至少包括：

- Organic Search
- Paid Search
- Meta
- TikTok
- Direct
- Email
- Referral
- AI Referral

AI Referral 可以模拟：

- ChatGPT
- Perplexity
- Gemini
- Copilot

Analytics 展示：

- sessions
- users
- revenue
- orders
- conversion rate
- AOV
- CAC
- ROAS

--------------------------------
九、Conversion Funnel
--------------------------------

漏斗：

Sessions
→ Product View
→ Add to Cart
→ Checkout
→ Purchase

需要：

- 每层人数
- 转化率
- Drop-off rate
- 最大流失环节识别

并输出运营建议。

--------------------------------
十、Demo 数据
--------------------------------

这是作品集项目。

不依赖真实 Amazon / Shopify / Google Analytics API。

第一阶段全部使用 seed/mock data。

但是数据结构应该设计得能够未来替换成真实数据。

请构造一个虚拟北美 DTC 品牌。

建议品类：
Outdoor / Pet / Home / Auto Accessories

数据要尽可能符合真实电商业务逻辑，不要使用完全随机、没有商业关系的数据。

--------------------------------
十一、UX
--------------------------------

设计风格：

- 专业 SaaS Dashboard
- 简洁
- 偏数据分析
- 不要花哨
- 桌面端优先
- Responsive

导航：

Dashboard
Products
SEO
GEO
Content
Analytics
Funnel
Recommendations

--------------------------------
十二、开发方式
--------------------------------

非常重要：

不要一次性实现整个项目。

我们采用 dispatch / milestone 方式开发。

每一个 dispatch：

1. 先阅读当前代码
2. 说明本次目标
3. 只完成当前任务
4. 不提前实现后续模块
5. 完成后运行：
   - lint
   - typecheck
   - unit tests
   - relevant integration tests
   - build
6. 如果测试失败：
   - 修复
   - 再测试
7. 所有测试通过以后停止

完成每个 dispatch 后必须输出：

1. 本次完成内容
2. 修改的核心文件
3. 测试结果
4. 当前已知问题
5. 下一 dispatch 建议

未经我的确认，不要自动进入下一 dispatch。

优先完成 MVP，再增强。

不要为了追求功能数量降低代码质量。

--------------------------------
十三、核心原则
--------------------------------

这个项目最重要的不是“功能多”。

而是能够在面试中清楚解释：

为什么独立站运营需要这些数据？
为什么这些指标重要？
SEO/GEO 如何影响流量？
流量如何转化为订单？
如何通过数据发现页面问题？
如何根据数据做运营决策？

因此所有功能必须围绕真实业务决策设计。

现在只进行项目扫描和架构规划。

不要写业务代码。

首先输出：

1. 推荐技术架构
2. 数据模型
3. 页面结构
4. 核心业务实体
5. Dispatch 计划
6. 测试策略
7. MVP 与后续功能边界

完成后停止，等待确认。

