# Agent 对话示例

## 示例 1：支付账单

用户输入：
`帮我把这个账单付掉`

Agent 预期输出：
- intent: `PAY`
- steps:
  - 读取账单信息
  - 构建 Mint+Pay 交易
  - 等待钱包签名并提交
- suggestedActions:
  - `一键支付（USDC -> BrandUSD -> Pay）`（`PAY_MINT_AND_PAY`）
  - `打开支付页`（`NAVIGATE`）

动作流：
1. 点击 `一键支付`
2. Agent 调用 `buildMintAndPayTx(invoiceId)`
3. 钱包签名并发送
4. UI 展示 digest/status/explorer

## 示例 2：赎回稳定币

用户输入：
`我想把余额都赎回`

Agent 预期输出：
- intent: `REDEEM`
- steps:
  - 查询余额
  - 构建 Burn 交易
  - 签名并提交
- suggestedActions:
  - `全部赎回`（`REDEEM_ALL`）
  - `按金额赎回`（`REDEEM_AMOUNT`）

## 示例 3：商户领取收益

用户输入：
`帮我领一下商户收益`

Agent 预期输出：
- intent: `CLAIM`
- steps:
  - 权限检查
  - 构建 Claim 交易
  - 签名并提交
- suggestedActions:
  - `领取收益`（`CLAIM_REVENUE`）

## 示例 4：查询交易状态

用户输入：
`帮我查一下这个 digest 的状态`

Agent 预期输出：
- intent: `STATUS`
- steps:
  - 查询链上交易状态
- suggestedActions:
  - `刷新状态`（`CHECK_TX_STATUS`）
