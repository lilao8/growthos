# Dispatch 8：统一 Recommendations

## 目标

聚合现有规则与数据，形成可解释、可排序、可完成的运营任务中心。

## 前置条件

Dispatch 7 的测试与验收已通过，用户已明确确认执行本阶段。读取此前报告，确认相关接口与当前实现一致。

开始前阅读 `README.md`、`CLAUDE.md`、`docs/00-architecture.md`、本文件与相关代码；以当前项目为准，不假设前序实现。全局愿景不等于本阶段授权。

## 范围

- 聚合 SEO、GEO、Content、Analytics、Funnel；复用已有引擎，不复制公式或用 AI API。
- Recommendation 字段：id、source、ruleId、sourceEntityId、title、category、priority、impact、effort、reason、suggestedAction、relatedProduct（可空）、status、evidence、ruleVersion。
- priority：Critical / High / Medium / Low；status：Open / Done。列表、优先级/类别筛选、Mark as Done，允许撤销完成。
- 使用稳定规则 ID + 来源实体生成稳定任务标识，重复生成不重复建任务。完成状态独立持久保存；来源问题消失时不再列为 active，保留历史状态；证据变化但标识相同时展示最新证据及既有完成状态。
- Impact 与 Effort 使用解释明确的 1–5 档估计；高影响>=4、低工作量<=2：Quick Wins；高影响高工作量：Strategic；低影响低工作量：Low Priority；低影响高工作量：Defer。不是保证收益。
- 每条建议链接到具体页面/商品/图表和证据；没有商品关系时跳转来源模块。
- Analytics 的“流量高转化低”等规则阈值、最低样本量、优先级映射写入配置；无效/缺失数据不生成确定性结论。

## 明确禁止提前实现的内容

- 不调用 AI API，不执行自动改内容/调广告/发消息等外部动作。
- 不做团队分配、复杂项目管理、营收预测或新审计引擎。
- 不进入后续 Dispatch；若当前任务依赖尚未实现的后续能力，使用有说明的占位或接口，不扩展实现。

## 验收标准

- 五类来源各有至少一个可解释 fixture；无问题输入不制造任务。
- unit 验证生成、去重、稳定 ID、优先级排序、矩阵象限、缺数据与低样本处理。
- integration 验证重复刷新/生成后 Done 保留、撤销生效、来源消失处理；不把同一规则的不同页面误合并。
- E2E 覆盖筛选→查看证据→完成→刷新→撤销；所有深链正确。

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

保存到 `docs/reports/dispatch-08.md`，并在会话输出：

```text
Dispatch 8 — PASS / FAIL / BLOCKED

1. 本次完成内容：对应范围和验收项逐条说明。
2. 修改的核心文件：路径 + 修改目的。
3. 测试结果：命令、实际通过/失败/跳过数量、构建结果；附关键日志或证据位置。
4. 验收证据：关键操作、数据核对、截图或人工检查结果；区分已实测与未运行。
5. 当前已知问题：缺陷、环境限制、必要偏离及原因；没有则明确“无已知阻塞问题”。
6. 下一 Dispatch 建议：Dispatch 9：Portfolio Polish（仅建议，等待用户确认）。
7. 状态：已停止，等待用户确认；如未通过则明确本阶段尚未完成。
```
