# Dispatch 22 · 客服反馈真实试跑与回放

经用户授权，用当前本地配置的 `gpt-5.6-terra` 录制一条两轮对话。录制前使用替身验证同一场景。真实录制只运行了一次，使用固定的模拟工单和商品目录。

| 轮次 | 真实结果 | 已核对的证据 | 输入 / 输出 token |
|---|---|---|---:|
| 过去 30 天，哪些 SKU 的客服反馈最多？ | 修正一次后仍触发 `raw-number`，降级到 GrowthOS 的工具结果 | Ridgeline 2P 排第一，5 条中 3 条物流、2 条商品质量。回答带有 10 条可核对引用 | 9,747 / 885 |
| 只看 Ridgeline 2P 呢？ | 首次通过 | 日期仍为 2026-08-02 至 2026-08-31；仅 Ridgeline 2P，三条物流工单为 SUP-101、SUP-102、SUP-103 | 7,561 / 238 |

模型返回的用量合计为 17,308 输入 token、1,123 输出 token，来自 6 次返回用量的模型响应。回放如实显示首次通过 1/2。录制只保存校验问题码，无法从回放确定首轮被拦下的具体数字文本。

## 回放与验收

- 在 `/agent/replays/live-support-feedback` 加入真实回放。按各自链接的筛选条件重算 13 条引用，件数和日期都与录制一致。
- 浏览器测试从回放列表打开记录并点进物流工单，确认三条工单实际可见，浏览中没有 `/api/agent` 请求。
- 既有回放保持原样。新录制场景需要明确指定 `REPLAY_SCENARIOS=support-feedback`，原来的默认录制范围保持一致。
- 未改 Vercel 配置、未部署。公开运行仍须保持实时关闭。

## 门禁

验证环境为 macOS、Node v24.18.0、npm 11.16.0。除上述授权的真实试跑之外，测试均使用替身模型或静态回放。

| 检查 | 结果 |
|---|---|
| `npm ci --no-audit --no-fund` | PASS |
| `npm run lint`、`npm run typecheck` | PASS |
| `npm run test -- --run` | PASS，763 项 |
| `npm run test:integration -- --run` | PASS，494 项 |
| `npm run build` | PASS，测试服务使用生产构建 |
| 三浏览器全量 E2E | PASS，Chromium、Firefox、WebKit 共 888 项 |
| 本机生产模式关闭实时功能 | PASS，回放 200，POST 接口 503 live-disabled |

本阶段完成，等待确认下一 Dispatch。
