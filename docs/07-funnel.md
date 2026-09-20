# Dispatch 7：Conversion Funnel

## 目标

展示同一会话群体的转化损失，生成针对流失位置的局部建议。

## 前置条件

Dispatch 6 的测试与验收已通过，用户已明确确认执行本阶段。读取此前报告，确认相关接口与当前实现一致。

开始前阅读 `README.md`、`CLAUDE.md`、`docs/00-architecture.md`、本文件与相关代码；以当前项目为准，不假设前序实现。全局愿景不等于本阶段授权。

## 范围

- Sessions → Product View → Add to Cart → Checkout → Purchase；每层显示去重会话数，不标成独立人数。
- 使用 Dispatch 6 的时间范围及同一份 SessionFact，保证阶段按序、计数单调不增；非法序列明确报告，不静默截断造假。
- 显示 Stage Conversion Rate、Overall Conversion Rate、Drop-off Rate、流失数及 Largest Drop-off Stage。
- 最大流失按有效相邻层流失比例选取，平局取最早阶段；上层为 0 时 N/A，不进入比较，全零时无最大流失。
- 独立 funnel recommendation engine：Product View→Add to Cart 提示检查价格、价值表达、评论、CTA、图片与配送信息；Checkout→Purchase 检查运费、支付方式、流程复杂度、信任与配送时间。
- 其余阶段也有明确映射；建议是待验证假设，不声称已证明原因。阈值配置化，显示会话样本数，小样本不足时不给高置信结论。
- Dashboard 补充 Add-to-cart Rate、Checkout Rate 和 Conversion Alerts，链接到漏斗。

## 明确禁止提前实现的内容

- 不开发完整统一建议列表、任务完成状态或 Impact vs Effort 矩阵。
- 不做真实结账、支付、自动 A/B 测试、归因因果推断。
- 不进入后续 Dispatch；若当前任务依赖尚未实现的后续能力，使用有说明的占位或接口，不扩展实现。

## 验收标准

- unit 覆盖正常/全零/某层为零/无流失/平局/后层大于前层/重复事件/非法顺序。
- recommendation tests 覆盖各段映射、阈值、小样本和无有效阶段。
- Funnel sessions/purchases 与 Analytics 同期一致；总转化率和各段计算可手动复核。
- integration 验证过滤与有序会话处理，E2E 验证流失高亮和建议导航。

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

保存到 `docs/reports/dispatch-07.md`，并在会话输出：

```text
Dispatch 7 — PASS / FAIL / BLOCKED

1. 本次完成内容：对应范围和验收项逐条说明。
2. 修改的核心文件：路径 + 修改目的。
3. 测试结果：命令、实际通过/失败/跳过数量、构建结果；附关键日志或证据位置。
4. 验收证据：关键操作、数据核对、截图或人工检查结果；区分已实测与未运行。
5. 当前已知问题：缺陷、环境限制、必要偏离及原因；没有则明确“无已知阻塞问题”。
6. 下一 Dispatch 建议：Dispatch 8：统一 Recommendations（仅建议，等待用户确认）。
7. 状态：已停止，等待用户确认；如未通过则明确本阶段尚未完成。
```
