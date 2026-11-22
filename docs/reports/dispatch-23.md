# Dispatch 23 · Vercel 公开发布

发布于 2026-11-22。用户授权部署到已有项目 `michaell1/growthos`。发布内容来自通过 Dispatch 22 验收的提交 `75443ee`。

- [稳定演示入口](https://growthos-michaell1.vercel.app)
- [客服反馈回放](https://growthos-michaell1.vercel.app/agent/replays/live-support-feedback)
- [Vercel 部署记录](https://vercel.com/michaell1/growthos/ATJQzPHusmmPCghcjon1WeMom4Xo)

## 发布过程

CLI 登录过期后，由用户重新登录。上传使用 Git 提交的临时副本，仅复制已链接的项目标识。构建和运行均将 `AGENT_LIVE_ENABLED` 设为 `false`。先创建生产目标部署，保留原稳定域名，候选通过线上检查后才切换。

## 线上验收

在候选和稳定域名各用独立 Chromium 会话运行检查，无需登录。两个地址都通过下列检查。

| 验收项 | 结果 |
|---|---|
| Dashboard、回放列表 | 200 |
| 客服反馈回放 | 两轮可见，标记为真实模型录制，首次通过为 1/2，第一轮显示降级 |
| Ridgeline 2P 的物流证据链接 | 保留 30 天、SKU 和物流分类，显示 2026-08-02 至 2026-08-31 的 SUP-101、SUP-102、SUP-103 三条模拟工单 |
| 浏览回放和证据页 | 无 `/api/agent` 请求，无浏览器错误 |
| `POST /api/agent` | 503 `live-disabled` |

生产站使用 `75443ee` 的应用代码及回放。本次提交只把已验证的稳定回放链接和发布报告补到仓库。

本阶段完成，等待确认下一 Dispatch。
