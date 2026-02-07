# Prompt 记录 002：Move 合约实现

- Prompt ID：002-move-contract
- 日期（UTC）：2026-02-07
- 工具：Codex（GPT-5 类）
- 记录人：项目团队

## 原始提示词（节选）

```text
请在 packages/move 下实现 Move 2024 合约包 stableflow_checkout，包含 Merchant/Product/Invoice/Receipt 与支付事件...
```

## 产出摘要

- 实现对象模型：Merchant / Product / Invoice / Receipt
- 实现入口函数：创建商户、商品、账单、支付
- 增加事件：InvoiceCreated / InvoicePaid / ReceiptMinted
- 增加最小测试

## 人工复核结论

- 合约结构与前端调用目标一致
- 支付参数签名已对齐到 `merchant + invoice + payment`
