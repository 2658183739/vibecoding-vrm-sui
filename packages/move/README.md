# stableflow_checkout（Move 2024 合约包）

## 合约版本

- Move Edition：`2024.beta`
- 配置文件：`packages/move/Move.toml`

## 能力概述

- 商户创建：`create_merchant`
- 商品创建：`create_product`
- 账单创建：`create_invoice`
- 账单支付：`pay_invoice<T>`、`pay_invoice_and_transfer<T>`
- 事件：`InvoiceCreated`、`InvoicePaid`、`ReceiptMinted`

## 构建

```bash
cd packages/move
sui move build
```

## 测试

```bash
cd packages/move
sui move test
```

## 发布

```bash
cd packages/move
sui client publish --gas-budget 200000000
```

发布后建议记录：
- `PACKAGE_ID`
- 关键对象 ID（Merchant/Product/Invoice）
- 发布交易 `digest`
