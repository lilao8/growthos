# Dispatch 1：基础框架与 Dashboard

## 目标

搭建专业 SaaS 应用外壳，让 Dashboard 首次可运行、可展示。

## 前置条件

Dispatch 0 的测试与验收已通过，用户已明确确认执行本阶段。读取此前报告，确认相关接口与当前实现一致。

开始前阅读 `README.md`、`CLAUDE.md`、`docs/00-architecture.md`、本文件与相关代码；以当前项目为准，不假设前序实现。全局愿景不等于本阶段授权。

## 范围

- Layout、Sidebar、Header、导航、基础排版/颜色/间距/表格/卡片组件；桌面优先，兼容手机和平板。
- 路由：/dashboard、/products、/seo、/geo、/content、/analytics、/funnel、/recommendations；首页可跳转 Dashboard。
- Dashboard 仅显示 Sessions、Revenue、Orders、Conversion Rate、AOV、Organic Traffic 六项。
- 独立 summary service + 可复现 mock repository；指标从同一份小型 fixture 聚合，不能硬编码在 JSX。
- loading / empty / error / retry 可通过测试适配器验证；后续模块仅展示“尚未实现”的说明。

## 明确禁止提前实现的内容

- 不实现商品列表/编辑、审计、内容、完整趋势分析、漏斗或推荐引擎。
- 不用随机数伪造增长百分比，也不显示未经计算的 SEO/GEO 分数。
- 不进入后续 Dispatch；若当前任务依赖尚未实现的后续能力，使用有说明的占位或接口，不扩展实现。

## 验收标准

- 六个指标与 fixture 和公式一致；零分母、空数据、异常均有正确显示。
- 所有导航可访问且当前项有状态；键盘能操作菜单。
- 在 375、768、1440px 检查布局，无页面级意外横向溢出。
- unit 验证 summary 聚合与零分母；integration 验证数据层与状态传播；E2E 验证主页、导航、错误重试。

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

保存到 `docs/reports/dispatch-01.md`，并在会话输出：

```text
Dispatch 1 — PASS / FAIL / BLOCKED

1. 本次完成内容：对应范围和验收项逐条说明。
2. 修改的核心文件：路径 + 修改目的。
3. 测试结果：命令、实际通过/失败/跳过数量、构建结果；附关键日志或证据位置。
4. 验收证据：关键操作、数据核对、截图或人工检查结果；区分已实测与未运行。
5. 当前已知问题：缺陷、环境限制、必要偏离及原因；没有则明确“无已知阻塞问题”。
6. 下一 Dispatch 建议：Dispatch 2：商品中心（仅建议，等待用户确认）。
7. 状态：已停止，等待用户确认；如未通过则明确本阶段尚未完成。
```
