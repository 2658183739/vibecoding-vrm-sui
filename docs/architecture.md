# 系统架构说明

## 1. 架构目标

本项目的目标是实现一个可演示、可复核、可部署的 Sui 商户收款闭环：
- 商户链上创建商品与账单
- 用户可直接支付，或通过 USDC 一键 Mint+Pay 支付
- 用户可赎回稳定币
- 商户可 Claim 收益并查看供给指标
- Agent 提供规则驱动的交互与操作建议

## 2. Monorepo 分层

- `apps/web`：前端展示层 + 钱包签名交互 + 交易反馈
- `packages/move`：链上核心业务逻辑（Move 2024）
- `packages/agent`：规则驱动意图引擎
- `docs`：评审与交付文档
- `ai-disclosure`：AI 使用披露与 Prompt 记录

## 3. 链上对象模型（Move）

- `Merchant { owner, name, treasury }`
- `Product { merchant_id, title, price_u64, active }`
- `Invoice { product_id, merchant_id, amount_u64, status, buyer, created_at_ms }`
- `Receipt { invoice_id, buyer, paid_amount_u64, paid_at_ms }`

事件：
- `InvoiceCreated`
- `InvoicePaid`
- `ReceiptMinted`

## 4. 核心交易路径

### 4.1 商户出单
1. 商户调用 `create_product`
2. 商户调用 `create_invoice`
3. 页面生成支付入口 `/pay/:invoiceId`

### 4.2 普通支付
1. 前端读取 Invoice + Product
2. 选择或合并支付 Coin
3. 调用 `pay_invoice<T>(merchant, invoice, payment)`
4. 展示 `digest/status/explorer/receipt`

### 4.3 一键支付（Mint+Pay）
1. `StableLayerClient.buildMintTx({ autoTransfer:false })`
2. 同一笔交易继续调用 `pay_invoice<BrandUSDType>`
3. 用户钱包签名后一次上链完成

### 4.4 赎回与结算
- 赎回：`buildBurnTx({ amount })` 或 `buildBurnTx({ all:true })`
- 商户领取：`buildClaimTx`
- 指标查询：`getTotalSupply` + `getTotalSupplyByCoinType`

## 5. 前端代码职责

- `src/config.ts`：网络、RPC、合约与稳定币类型配置
- `src/lib/sui.ts`：Sui 读链、交易构建、反馈归一化
- `src/lib/tx/*`：Mint+Pay、Burn、选币逻辑
- `src/lib/stablelayer.ts`：stable-layer client 初始化与指标封装
- `src/components/TxFeedbackCard.tsx`：统一交易反馈
- `src/components/AgentDrawer.tsx`：Agent 对话与动作触发

## 6. Agent 集成方式

- Agent 输入：自然语言 + 当前页面上下文（invoiceId、余额、稳定币类型等）
- Agent 输出：`intent + steps + suggestedActions`
- 动作执行：前端通过 toolbox 构建交易，最终由钱包签名

## 7. 安全与运维

- 所有敏感配置放 `.env`，仓库忽略 `.env*`（保留 `.env.example`）
- 禁止在仓库硬编码私钥或助记词
- CI 执行 lint/build/test，保障可回归
- AI 使用与 prompt 全量记录在 `ai-disclosure/`
