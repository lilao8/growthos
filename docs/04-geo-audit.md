# Dispatch 4：GEO Audit

## 目标

用透明、可测试的内部启发式模型评估内容的生成式搜索就绪度。

## 前置条件

Dispatch 3 的测试与验收已通过，用户已明确确认执行本阶段。读取此前报告，确认相关接口与当前实现一致。

开始前阅读 `README.md`、`CLAUDE.md`、`docs/00-architecture.md`、本文件与相关代码；以当前项目为准，不假设前序实现。全局愿景不等于本阶段授权。

## 范围

- 10 项规则：topic clarity、direct answer availability、FAQ coverage、heading structure、factual density、entity clarity、structured product facts、source/evidence presence、original information、extractability。
- 对每项定义可观察代理信号：标题与主题词、显式 directAnswer、FAQ 问答对、标题层级、规格事实字段、品牌标识、产品事实完整性、来源 URL/描述、原创材料声明与依据、摘要/列表。
- 不用模糊“AI 判断”实现规则；原创性仅能检查是否提供声明和材料，不能验证原创真伪；来源存在不等于可靠，关键词命中不等于语义理解。标明这些限制。
- 每项返回 status、score、issue、reason、recommendation、evidence；评分函数与 React 分离。默认每项 0/5/10 分，总计 0–100；未提供可选内容计 0，输入根本缺失返回 Unknown/null 并展示覆盖率，不能当成高分。
- 展示 GEO Score、AI Readiness（内容就绪度）、Issues、Recommendations、ruleVersion；明确高分不保证被 AI 引用。
- 页面明显显示：This score is an internal heuristic designed to evaluate content readiness for generative search systems.
- 沿用 PageSnapshot 与 stale/重新审计机制；商品与 Dashboard 显示同源最新评分。

## 明确禁止提前实现的内容

- 不调用 AI API，不模拟“真实 AI 排名”，不以 AI Referral 数据反推引用次数。
- 不实现内容规划或统一建议中心，不声称评分是 Google/OpenAI 等官方算法。
- 不进入后续 Dispatch；若当前任务依赖尚未实现的后续能力，使用有说明的占位或接口，不扩展实现。

## 验收标准

- 好内容、空内容、只有营销话术、缺事实/证据、缺 FAQ、标题混乱、原创材料缺失均有可解释差异。
- unit 测试覆盖全部 10 条、边界、非法输入和稳定性；固定样例展示明确改动与分数变化。
- 页面免责声明、规则证据与缺失数据提示清晰；integration 验证保存/审计一致性，E2E 验证页面可读和重跑。
- 与 SEO 引擎解耦，单个引擎失败不会显示另一个的伪造成功结果。

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

保存到 `docs/reports/dispatch-04.md`，并在会话输出：

```text
Dispatch 4 — PASS / FAIL / BLOCKED

1. 本次完成内容：对应范围和验收项逐条说明。
2. 修改的核心文件：路径 + 修改目的。
3. 测试结果：命令、实际通过/失败/跳过数量、构建结果；附关键日志或证据位置。
4. 验收证据：关键操作、数据核对、截图或人工检查结果；区分已实测与未运行。
5. 当前已知问题：缺陷、环境限制、必要偏离及原因；没有则明确“无已知阻塞问题”。
6. 下一 Dispatch 建议：Dispatch 5：Content Planner（仅建议，等待用户确认）。
7. 状态：已停止，等待用户确认；如未通过则明确本阶段尚未完成。
```
