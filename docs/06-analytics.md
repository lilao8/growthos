# Dispatch 6：Analytics

## 目标

展示统一口径的流量、营收、获客成本与渠道表现。

## 前置条件

Dispatch 5 的测试与验收已通过，用户已明确确认执行本阶段。读取此前报告，确认相关接口与当前实现一致。

开始前阅读 `README.md`、`CLAUDE.md`、`docs/00-architecture.md`、本文件与相关代码；以当前项目为准，不假设前序实现。全局愿景不等于本阶段授权。

## 范围

- 统一 90 天确定性数据；渠道 Organic Search、Paid Search、Meta、TikTok、Direct、Email、Referral、AI Referral。
- AI Referral source：ChatGPT、Perplexity、Gemini、Copilot；这些仅为演示 source 标签。展示来源识别可能漏记的限制。
- Sessions、Users、Revenue、Orders、Conversion Rate、AOV、CAC、ROAS，遵循 CLAUDE.md 分母与归因口径。
- Overview、Traffic Trend、Channel Breakdown、Revenue by Channel、Conversion by Channel、AI Referral section。
- 7 / 30 / 90 days，以 demoAsOf 为截止日；过滤范围统一传给所有图表和汇总。先汇总再算比率，users 跨日去重。
- 图表和业务计算分离；Dashboard 六项与商品派生指标切换到统一数据源，并补齐 Organic Revenue、CAC、ROAS、趋势、渠道构成、Top Landing Pages、Top Products。
- 花费数据明确 acquisitionSpend 和 adSpend 的区别；无费用基础的渠道显示 N/A，不伪造“无限 ROAS”。

## 明确禁止提前实现的内容

- 不接 GA/广告 API，不声称实时数据或真实归因精度。
- 不提前实现完整漏斗 UI、统一建议中心、预算自动优化或真实多触点归因。
- 不进入后续 Dispatch；若当前任务依赖尚未实现的后续能力，使用有说明的占位或接口，不扩展实现。

## 验收标准

- unit 覆盖 CVR/AOV/CAC/ROAS 的正常、零分母、缺数据、加权聚合及日期边界。
- 渠道会话/订单/收入可与全站对账；AI source 小计与 AI 渠道总计一致；用户总数使用去重集合。
- Dashboard 与 Analytics 在同一时间段完全一致；更换时间范围所有相关视图同步。
- integration 验证时间过滤和聚合，E2E 验证 7/30/90 切换、空数据及图表文本替代。

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

保存到 `docs/reports/dispatch-06.md`，并在会话输出：

```text
Dispatch 6 — PASS / FAIL / BLOCKED

1. 本次完成内容：对应范围和验收项逐条说明。
2. 修改的核心文件：路径 + 修改目的。
3. 测试结果：命令、实际通过/失败/跳过数量、构建结果；附关键日志或证据位置。
4. 验收证据：关键操作、数据核对、截图或人工检查结果；区分已实测与未运行。
5. 当前已知问题：缺陷、环境限制、必要偏离及原因；没有则明确“无已知阻塞问题”。
6. 下一 Dispatch 建议：Dispatch 7：Conversion Funnel（仅建议，等待用户确认）。
7. 状态：已停止，等待用户确认；如未通过则明确本阶段尚未完成。
```
