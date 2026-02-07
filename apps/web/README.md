# apps/web（前端 dApp）

这是项目的用户交互入口，负责：钱包连接、账单支付、稳定币一键支付、赎回、商户 Claim 与指标展示、Agent 交互。

## 页面列表

- `/merchant`：商户创建 Product 与 Invoice
- `/pay/:invoiceId`：支付账单（普通支付 + Mint+Pay）
- `/redeem`（别名 `/wallet`）：BrandUSD 赎回
- `/merchant/claim`：商户收益领取
- `/merchant/metrics`：稳定币供给指标

## 交易反馈标准

所有交易页面都统一展示：
- `digest`
- `status`
- `Explorer 链接`
- `Receipt ObjectId`（若可解析到）

## 环境变量

先复制模板：

```bash
cp apps/web/.env.example apps/web/.env
```

必须配置：
- `VITE_SUI_NETWORK`：`mainnet | testnet | devnet | localnet`
- `VITE_SUI_RPC_URL`
- `VITE_SUI_EXPLORER_TX_BASE`（可选）
- `VITE_PACKAGE_ID`
- `VITE_MODULE_NAME`
- `VITE_MERCHANT_ID`
- `VITE_CREATE_PRODUCT_FN`
- `VITE_CREATE_INVOICE_FN`
- `VITE_PAY_INVOICE_FN`
- `VITE_PAY_COIN_TYPE`
- `VITE_STABLE_LAYER_NETWORK`（`mainnet | testnet`）
- `VITE_STABLE_LAYER_STABLE_COIN_TYPE`
- `VITE_STABLE_LAYER_BRAND_USD_TYPE`
- `VITE_STABLE_LAYER_USDC_TYPE`

## 开发命令

```bash
pnpm --filter @vibesui/web dev
```

## 构建命令

```bash
pnpm --filter @vibesui/web build
```
