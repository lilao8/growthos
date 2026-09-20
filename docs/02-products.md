# Dispatch 2：商品中心

## 目标

构建可搜索、筛选、查看并持久保存 SEO 元数据的商品中心。

## 前置条件

Dispatch 1 的测试与验收已通过，用户已明确确认执行本阶段。读取此前报告，确认相关接口与当前实现一致。

开始前阅读 `README.md`、`CLAUDE.md`、`docs/00-architecture.md`、本文件与相关代码；以当前项目为准，不假设前序实现。全局愿景不等于本阶段授权。

## 范围

- Product 字段：id、sku、title、slug、category、price、cost、inventory、status、primaryKeyword、metaTitle、metaDescription、productDescription，以及派生 seoScore、geoScore、organicSessions、conversionRate、revenue。
- 至少 15 个合理户外 SKU，品类、价格、成本、库存与关键词有业务关系；sku/slug 唯一。
- 商品列表展示 SKU、商品名、品类、价格、库存、SEO/GEO 分数、转化率和营收；支持关键词搜索、category/status 联合筛选与清除条件。
- 商品详情与 SEO Metadata 编辑（primaryKeyword、metaTitle、metaDescription）；表单校验、保存反馈与错误恢复。
- 建立对应 PageSnapshot fixture，供后续审计使用；保存编辑同步快照。
- 展示 Loading/Empty/Error；评分此时 null/Not audited，其他派生指标标明 Demo。

## 明确禁止提前实现的内容

- 不提前实现 SEO/GEO 规则或评分，不手动编造审计结果。
- 不做商品支付、下单、库存采购、批量导入或外部商城同步。
- 不进入后续 Dispatch；若当前任务依赖尚未实现的后续能力，使用有说明的占位或接口，不扩展实现。

## 验收标准

- 15 个 SKU 可查看；搜索大小写与空格处理稳定，多条件取交集，空结果可重置。
- 无效商品 ID 显示 not found；非法输入不写入，合法编辑刷新后仍存在。
- service 测试覆盖搜索、联合筛选、校验、保存失败与成功；integration 覆盖 repository 往返及 PageSnapshot 同步。
- E2E 完成搜索→详情→编辑→刷新验证；未执行审计不出现评分。

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

保存到 `docs/reports/dispatch-02.md`，并在会话输出：

```text
Dispatch 2 — PASS / FAIL / BLOCKED

1. 本次完成内容：对应范围和验收项逐条说明。
2. 修改的核心文件：路径 + 修改目的。
3. 测试结果：命令、实际通过/失败/跳过数量、构建结果；附关键日志或证据位置。
4. 验收证据：关键操作、数据核对、截图或人工检查结果；区分已实测与未运行。
5. 当前已知问题：缺陷、环境限制、必要偏离及原因；没有则明确“无已知阻塞问题”。
6. 下一 Dispatch 建议：Dispatch 3：SEO Audit（仅建议，等待用户确认）。
7. 状态：已停止，等待用户确认；如未通过则明确本阶段尚未完成。
```
