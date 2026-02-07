# Prompt 记录 004：stable-layer 一键支付与赎回

- Prompt ID：004-stable-layer
- 日期（UTC）：2026-02-07
- 工具：Codex（GPT-5 类）
- 记录人：项目团队

## 原始提示词（节选）

```text
请在 apps/web 集成 stable-layer-sdk，实现 USDC->BrandUSD->Pay，一键交易；并增加 Redeem 页面与 Burn 交易...
```

## 产出摘要

- 实现 `buildMintAndPayTx`（`autoTransfer:false`）
- 实现 `buildBurnTx`（按金额与全部）
- 实现 `buildClaimTx` 与 `getTotalSupplyByCoinType`
- 增加预览、错误处理、交易反馈

## 人工复核结论

- 余额不足、找不到币、RPC 异常均有可见错误提示
