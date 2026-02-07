# Prompt 记录 003：前端支付页与商户页

- Prompt ID：003-web-pay
- 日期（UTC）：2026-02-07
- 工具：Codex（GPT-5 类）
- 记录人：项目团队

## 原始提示词（节选）

```text
在 apps/web 中实现最小可用前端：/merchant 与 /pay/:invoiceId，使用官方 Sui SDK，交易结果要有 digest/status/explorer...
```

## 产出摘要

- 完成 `/merchant` 与 `/pay/:invoiceId`
- 封装 `lib/sui.ts` 读链与交易构建
- 加入统一交易反馈组件 `TxFeedbackCard`

## 人工复核结论

- 钱包签名链路可跑通
- 交易反馈字段完整可见
