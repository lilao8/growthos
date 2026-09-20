# Dispatch 5：Content Planner

## 目标

建立从关键词、购买意图和目标商品出发的内容计划管理。

## 前置条件

Dispatch 4 的测试与验收已通过，用户已明确确认执行本阶段。读取此前报告，确认相关接口与当前实现一致。

开始前阅读 `README.md`、`CLAUDE.md`、`docs/00-architecture.md`、本文件与相关代码；以当前项目为准，不假设前序实现。全局愿景不等于本阶段授权。

## 范围

- 字段：id、topic、primaryKeyword、secondaryKeywords、searchIntent、funnelStage、contentType、status、targetProduct、seoOpportunity、geoOpportunity；补充 productRelevance 支撑评分。
- Search Intent：Informational / Commercial / Transactional / Navigational；Funnel：TOFU / MOFU / BOFU。
- Content Type：Blog / Buying Guide / Comparison / FAQ / Product Guide / Landing Page。
- 状态采用 Idea / Planned / Writing / Review / Published；MVP 允许手动切换，Published 仅为计划记录，不向外发布。
- Content List、筛选、Create Content Idea、Edit、Status management；持久保存并校验关联商品存在。
- Content Opportunity Score 为独立函数：0.35×SEO + 0.25×GEO + 0.20×commercialIntent + 0.20×productRelevance，输入均 0–100；意图映射 Informational=40、Commercial=80、Transactional=100、Navigational=30。
- SEO/GEO opportunity 是编辑者输入的演示机会判断，不等于审计质量分或真实关键词搜索量；展示权重、来源和局限。

## 明确禁止提前实现的内容

- 不自动写文章、不接关键词工具、不做 CMS 发布或 AI 内容生成。
- 不实现 Analytics、跨模块推荐、排期自动化或团队协作。
- 不进入后续 Dispatch；若当前任务依赖尚未实现的后续能力，使用有说明的占位或接口，不扩展实现。

## 验收标准

- 新建、编辑、筛选、状态切换与刷新持久化可用；无效商品、空标题、越界机会分被拒绝。
- 相同输入产生相同分数；权重合计为 1，结果在 0–100，unit 覆盖每种意图、极值与非法输入。
- integration 验证内容和商品关系及存储失败；E2E 完成创建→编辑→筛选→刷新。
- 示例计划包含不同意图/漏斗阶段，并能解释优先写哪篇内容。

## 测试命令

从应用根目录运行；Dispatch 0 必须先建立这些真实脚本，后续阶段沿用。约定 Vitest 与 Playwright，已有不同框架则按阶段 0 记录使用等价命令。

```bash
npm run lint
npm run typecheck
npm run test -- --run
npm run test:integration -- --run
npm run test:e2e
npm run build
```

按上面的验收场景增加当前阶段测试，同时保留此前回归。命令失败须修复并重新运行；无环境、无测试用例、跳过测试不能计为通过。当前阶段报告中记录实际命令、结果及浏览器验收证据。

## 完成后的汇报格式

保存到 `docs/reports/dispatch-05.md`，并在会话输出：

```text
Dispatch 5 — PASS / FAIL / BLOCKED

1. 本次完成内容：对应范围和验收项逐条说明。
2. 修改的核心文件：路径 + 修改目的。
3. 测试结果：命令、实际通过/失败/跳过数量、构建结果；附关键日志或证据位置。
4. 验收证据：关键操作、数据核对、截图或人工检查结果；区分已实测与未运行。
5. 当前已知问题：缺陷、环境限制、必要偏离及原因；没有则明确“无已知阻塞问题”。
6. 下一 Dispatch 建议：Dispatch 6：Analytics（仅建议，等待用户确认）。
7. 状态：已停止，等待用户确认；如未通过则明确本阶段尚未完成。
```
