# 3 分钟 Demo 脚本（评委视角）

## 0. 开场（10 秒）

一句话目标：
> 我们展示的是一个在 Sui 上可运行的商户收款闭环，覆盖出单、支付、一键 Mint+Pay、赎回、商户 Claim、供应指标与 Agent 协助。

## 1. 演示前准备（20 秒）

```bash
pnpm install
pnpm dev
```

打开 `http://localhost:5173`，准备两个钱包：
- 商户钱包（用于创建商品和账单）
- 用户钱包（用于支付和赎回）

## 2. 商户创建商品与账单（40 秒）

1. 进入 `/merchant`
2. 连接商户钱包
3. 输入商品标题和价格，点击 `Create Product`
4. 选择商品，点击 `Create Invoice`
5. 在账单列表中点击某个 invoice，进入 `/pay/:invoiceId`

演示要点：
- 账单 objectId 已生成
- 能看到 amount、status、buyer

## 3. 普通支付（35 秒）

1. 切换到用户钱包
2. 在 `/pay/:invoiceId` 点击 `Pay`
3. 等待链上结果

演示要点：
- 页面显示 `digest`
- 页面显示 `status`
- 可点击 `Explorer` 链接
- 若解析到回执，显示 `Receipt ObjectId`

## 4. 一键支付（Mint+Pay）（35 秒）

1. 展示页面里的 Mint+Pay 预览（将铸造多少、将支付多少、选中哪些 USDC Coin）
2. 点击 `Pay with USDC (Mint+Pay in one TX)`

演示要点：
- 单笔交易完成 `USDC -> BrandUSD -> Pay`
- 明确提到使用了 `buildMintTx(autoTransfer:false)`
- 结果反馈仍完整：`digest/status/explorer`

## 5. 赎回（25 秒）

1. 进入 `/redeem`
2. 展示 Banner：MVP 默认 T+1，Instant 是 roadmap
3. 先演示 `Burn amount`，再演示 `Burn all`（二选一即可）

演示要点：
- 结果区可见 `digest/status/explorer`
- 失败时有清晰错误提示

## 6. 商户 Claim + Metrics（30 秒）

1. 进入 `/merchant/claim`，点击 `Claim Revenue`
2. 进入 `/merchant/metrics`，点击 `Refresh`

演示要点：
- Claim 结果有完整交易反馈
- Metrics 显示 `getTotalSupply` 与 `getTotalSupplyByCoinType`

## 7. 合约与合规补充（30 秒）

可选终端补充：

```bash
cd packages/move
sui move build
sui move test
sui client publish --gas-budget 200000000
```

强调：
- Move 版本为 2024（`edition = "2024.beta"`）
- 使用官方 Sui SDK
- AI 使用已披露（`ai-disclosure/`）

## 8. 收尾（10 秒）

- 项目完整开源（合约 + 前端 + Agent + 文档）
- 可以直接复现演示流程
- 线上版本可按文档部署并提交公开访问链接
