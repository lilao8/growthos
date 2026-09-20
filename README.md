# GrowthOS — DTC 独立站增长决策系统

用于求职作品集的 SEO / GEO / 内容 / 流量 / 转化分析工作台。面向具有前端开发背景、希望展示跨境独立站增长运营能力的开发者。

**本包是开发任务文档，不包含已经实现的应用；测试命令是未来实现的验收要求，并非已通过的测试结果。**

## 如何开始

把本目录中的 `README.md`、`CLAUDE.md`、`docs/` 放进 GrowthOS 项目根目录。如已有同名文件，先合并，保留原项目有效说明与配置。

在 Claude Code 中首次输入：

```text
阅读 README.md、CLAUDE.md、docs/MASTER_PROMPT.md 和 docs/00-architecture.md。
先只读扫描当前项目，输出架构、数据模型、页面结构、业务实体、Dispatch 计划、测试策略及 MVP 边界。
暂不写业务代码，也不初始化工程。输出方案后停止，等待我确认执行 Dispatch 0。
```

确认方案后输入：

```text
确认方案。严格执行 docs/00-architecture.md，初始化或兼容现有最小工程。
完成该阶段所有验收与测试后汇报并停止，不进入 Dispatch 1。
```

以后每次只指定一个阶段，例如：

```text
阅读 README.md、CLAUDE.md、docs/00-architecture.md，以及相关代码和此前阶段报告。
执行 docs/03-seo-audit.md。只实现当前阶段，测试通过后汇报并停止，不自动进入下一阶段。
```

## 文件索引与开发顺序

- [长期开发规则](CLAUDE.md)
- [原始总 Prompt](docs/MASTER_PROMPT.md)
- [Dispatch 0：项目架构](docs/00-architecture.md)
- [Dispatch 1：基础框架与 Dashboard](docs/01-dashboard.md)
- [Dispatch 2：商品中心](docs/02-products.md)
- [Dispatch 3：SEO Audit](docs/03-seo-audit.md)
- [Dispatch 4：GEO Audit](docs/04-geo-audit.md)
- [Dispatch 5：Content Planner](docs/05-content-planner.md)
- [Dispatch 6：Analytics](docs/06-analytics.md)
- [Dispatch 7：Conversion Funnel](docs/07-funnel.md)
- [Dispatch 8：统一 Recommendations](docs/08-recommendations.md)
- [Dispatch 9：Portfolio Polish](docs/09-portfolio-polish.md)

共 10 个阶段（0–9）。Dispatch 4 完成后建议先检查 Products + SEO + GEO 的完整体验，再决定是否调整后续计划。每阶段必须经用户明确确认才能进入下一阶段。

## 产品边界

虚拟北美户外 DTC 品牌 **NorthTrail Outdoor**（项目演示名称），至少 15 个 SKU，统一 USD；前期使用可复现的 seed/mock 数据，不连接真实 Shopify、Amazon、GA、广告或 AI API。

业务链路：SEO / GEO / Content → Traffic → Landing Page → Product View → Add to Cart → Checkout → Purchase → Revenue → Recommendations。

SEO 和 GEO 审计都是项目规则与启发式模型；它们不代表官方排名算法，也不保证排名、AI 引用或营收增长。AI Referral 表示演示的引荐流量，不等于 AI 曝光或引用次数。

## 技术与质量约定

默认候选栈：Next.js、TypeScript strict、Tailwind CSS、shadcn/ui、Prisma + PostgreSQL、Recharts、Zod、React Hook Form、Vitest、Playwright。已有项目优先兼容，不为追求技术栈重构。Dispatch 0 明确锁定实际版本、运行环境和包管理器；本文不硬编码易过时版本。

先用 repository/service 接口隔离数据。MVP 默认可用本地 mock repository 和浏览器持久化承接编辑；Prisma/PostgreSQL 是候选正式适配器，不要求在 Dispatch 0 搭建整套数据库。若选择数据库，应在阶段 0 明确连接、迁移、seed、测试隔离和清理步骤。

详细指标、测试脚本合同、存储要求见 [CLAUDE.md](CLAUDE.md)。所有阶段结束后生成 `docs/reports/dispatch-NN.md`，记录实际测试和已知问题。报告由执行该阶段的 Claude 创建，本包不预填“已完成”。

## 整理说明

内容依据引用对话《跨境电商宏观微观分析》中 GrowthOS 总 Prompt、Dispatch 0–9 与开发规则整理。保留原始功能方向，补充阶段边界、数据口径、可执行脚本约定和验收场景。

已统一原方案中的两处歧义：0–9 共 10 个 Dispatch；架构入口使用 `docs/00-architecture.md`，不引用不存在的 `docs/architecture.md`。初次只读规划和确认后的最小工程初始化分开执行。
