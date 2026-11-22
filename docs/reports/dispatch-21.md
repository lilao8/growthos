# Dispatch 21 · 客服反馈分析

本阶段交付了模拟工单从归类、SKU 归属、统计到 Agent 引用的只读流程。

## 实现

- `src/domain/support-feedback.ts` 统一分类、SKU 归属、去重和排序。工单上的完整商品名必须唯一匹配。操作员可用唯一商品名前缀查询。不同分类同时命中时纳入「待分类」。
- `src/app/support/page.tsx` 提供窗口、SKU 和分类筛选、完整的 SKU 排名和原始模拟工单。未匹配 SKU 单独显示，可点开核对。
- `src/services/agent-tools/support.ts` 注册只读工具，返回排名靠前的 SKU 和主要问题件数，使用现有数值引用。模型只收到计数、分类和必要的商品标识。实际工单摘要留在证据页面。纯客服查询的证据顺序由工具结果决定。
- 复用 Ops Agent 的范围、引用和拒绝写入流程。主动收窄 SKU 的追问保留日期，单次查询自带的筛选参数留在本次调用。

## 验收与实测

- 30 天窗口是 2026-08-02 至 2026-08-31（UTC），共有 12 条模拟工单。Ridgeline 2P Backpacking Tent 排第一，5 条中 3 条物流、2 条商品质量。未匹配 SKU 有 2 条。
- Agent 追问仍使用 30 天窗口。点击 Ridgeline 2P 的物流件数，打开以 SKU 和物流分类筛选的页面，显示 3 条对应工单。
- 已验证窗口两端、重复 ID、未知或歧义 SKU、冲突分类、空结果和拒绝写入。客服工单件数没有订单分母，也没有营销渠道归因。
- 新功能使用替身模型验证。本次未调用真实模型、未录制新回放、未部署。

| 检查 | 结果 |
|---|---|
| `npm ci --no-audit --no-fund` | PASS，锁文件未改动 |
| `npm run lint`、`npm run typecheck` | PASS |
| `npm run test -- --run` | PASS，763 项 |
| `npm run test:integration -- --run` | PASS，493 项 |
| `npm run build` | PASS，Playwright 的测试服务使用生产构建 |
| `npm run test:e2e -- --workers=5 --reporter=list` | PASS，Chromium、Firefox、WebKit 共 885 项 |

验证环境为 macOS、Node v24.18.0、npm 11.16.0。初次检查发现脚本用了项目目标库未提供的数组方法，以及新测试用了不完整的商品 ID。修正后重跑。最终浏览器回归使用收窄后的工具输出，确认减少字段后证据链仍然一致。

本阶段完成，等待确认下一 Dispatch。
