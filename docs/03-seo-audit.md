# Dispatch 3：SEO Audit

## 目标

实现独立 SEO audit engine，把页面问题转成可解释的改进项。

## 前置条件

Dispatch 2 的测试与验收已通过，用户已明确确认执行本阶段。读取此前报告，确认相关接口与当前实现一致。

开始前阅读 `README.md`、`CLAUDE.md`、`docs/00-architecture.md`、本文件与相关代码；以当前项目为准，不假设前序实现。全局愿景不等于本阶段授权。

## 范围

- 检查 meta title（存在/长度）、meta description（存在/长度）、H1、URL slug、canonical、image alt、internal links、structured data、indexability、keyword usage。
- 输入是 PageSnapshot，不是实时抓取网站；每项返回 rule、status(pass/warning/error)、severity、message、explanation、recommendation 和证据字段。
- 项目默认 title 长度建议 30–60 字符、description 70–160 字符；这是英文 demo 的可配置编辑提示，不是搜索引擎硬性排名要求。
- 缺 meta 为 error，长度超建议为 warning；H1 缺失或多个、空 alt、无内链、slug 格式、关键词匹配均有确定规则。装饰图片允许空 alt。canonical 验证可解析和预期 URL；结构化数据验证必填字段与类型，不只检查是否存在。
- 明确 robots 未知与 noindex 的区别；Unknown 输入显示覆盖率和数据缺口，不假定 pass。noindex 提示确认页面用途，不自动改为可索引。
- 独立 pure function 评分：可评估检查等权，pass=1、warning=0.5、error=0，分数为 100×已获分/可评估满分，取整；零可评估项返回 null，显示 coverage 与 ruleVersion。
- SEO Overview、Issue List、Page Detail Audit；Dashboard 加 SEO Score、Critical Issues、Warnings、Passed Checks，同源计算。
- 元数据编辑后标 stale；用户重新运行审计后替换当前结果。

## 明确禁止提前实现的内容

- 不爬真实站点、不自动改站、不接 Search Console、不做真实排名追踪。
- 不实现 GEO 或统一建议中心；仅输出 SEO 局部建议。
- 不进入后续 Dispatch；若当前任务依赖尚未实现的后续能力，使用有说明的占位或接口，不扩展实现。

## 验收标准

- 完整页、缺 title、title 过长、缺 description、缺 alt、无结构化数据、noindex 均有预期规则结果。
- 额外测试长度边界、未知字段、全空输入、评分上下界、装饰图片和重复运行一致性。
- 列表问题可定位具体页面、规则、证据与建议；汇总不重复计数，注明平均分所用页面范围。
- integration 验证 Product 编辑→快照→stale→重跑；E2E 验证详情审计与 Dashboard 链接。

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

保存到 `docs/reports/dispatch-03.md`，并在会话输出：

```text
Dispatch 3 — PASS / FAIL / BLOCKED

1. 本次完成内容：对应范围和验收项逐条说明。
2. 修改的核心文件：路径 + 修改目的。
3. 测试结果：命令、实际通过/失败/跳过数量、构建结果；附关键日志或证据位置。
4. 验收证据：关键操作、数据核对、截图或人工检查结果；区分已实测与未运行。
5. 当前已知问题：缺陷、环境限制、必要偏离及原因；没有则明确“无已知阻塞问题”。
6. 下一 Dispatch 建议：Dispatch 4：GEO Audit（仅建议，等待用户确认）。
7. 状态：已停止，等待用户确认；如未通过则明确本阶段尚未完成。
```
