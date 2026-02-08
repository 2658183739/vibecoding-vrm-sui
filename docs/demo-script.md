# 2-3 分钟 Demo 脚本（评审视角）

## 演示目标

在 2-3 分钟内完成一条可验证闭环：
- 商户创建账单（Invoice）
- 用户进入支付页
- Local Agent 已连接并可触发 OpenClaw
- 建议动作执行 `Mint+Pay`，钱包签名后展示 `digest + explorer + receiptId`
- 展示安全护栏与 AI 披露材料位置

## 演示前准备（约 15 秒）

```bash
pnpm install
pnpm dev
pnpm dev:local-agent
```

打开 `http://localhost:5173/#/merchant`。  
准备钱包插件（建议至少 1 个可签名账户，演示时可同一钱包完成）。

---

## 逐步脚本（约 2 分 20 秒）

### 1) 打开网站 `/merchant` 创建 invoice（约 35 秒）

1. 在 `/merchant` 点击连接钱包。
2. 填写商品信息：`title`、`price`，点击创建商品。
3. 选择商品，点击创建账单（Create Invoice）。
4. 在账单列表里点击刚创建的 `invoiceId`，跳转到 `/pay/:invoiceId`。

讲解词：
> 这里完成了商户出单，账单是链上对象，后续支付会直接引用这个 invoice object。

### 2) 打开 `/pay/:invoiceId`（约 15 秒）

1. 展示页面上的 `invoiceId`、金额、商品信息。
2. 指出支付区与交易反馈区在同一页面。

讲解词：
> 这个页面同时支持普通支付和一键 Mint+Pay，交易完成后会显示完整链上回执信息。

### 3) 打开 Local Agent 面板并展示已连接（约 20 秒）

1. 点击导航进入 `/agent`（Local Agent 面板）。
2. 展示连接状态为已连接（Connected）。
3. 读一下 Agent 地址：`http://localhost:3777`。
4. 返回 `/pay/:invoiceId`。

讲解词：
> Local Agent 是本地常驻服务，负责建议动作与浏览器自动化，不托管私钥。

### 4) 点击 `Open in controlled browser`（OpenClaw）（约 15 秒）

1. 在支付页的 Local Agent 快捷动作区点击 `Open current invoice in controlled browser`。
2. 展示成功提示（或 fallback 提示）。

讲解词：
> 这是 OpenClaw 控制浏览器能力，且受域名白名单约束，不在白名单的 URL 会被拒绝。

### 5) 点击建议动作 `Mint+Pay`，钱包签名，展示 digest + explorer + receiptId（约 40 秒）

1. 点击 `刷新 Agent 建议动作`。
2. 点击建议动作中的 `Mint+Pay`。
3. 确认交易策略弹窗（展示金额、stableCoinType、invoiceId、package/module/function）。
4. 钱包签名后等待完成。
5. 展示结果区：
   - `digest`
   - `status`
   - `Explorer` 链接
   - `Receipt ObjectId`（若链上返回）

讲解词：
> 这是一笔组合交易：USDC -> BrandUSD -> pay_invoice，在同一笔交易内完成，结果可直接在浏览器复核。

### 6) 展示安全护栏（约 25 秒）

依次展示三点：

1. **域名白名单**
   - 在 `/agent` 页可见并可编辑 allowlist。
   - 说明 `/browser/open` 不在白名单会 `403`。
2. **交易确认弹窗**
   - Mint+Pay 前必须人工确认，超出阈值会二次确认。
3. **审计日志位置**
   - Local Agent 审计日志：`.local/audit.jsonl`
   - 说明记录字段：timestamp/action/url/invoiceId/result（不含密钥）。

### 7) AI 披露目录说明（约 15 秒）

打开仓库目录并指出：
- `ai-disclosure/tools.md`：工具名、模型版本
- `ai-disclosure/prompts/`：提示词记录（可打码敏感信息）

讲解词：
> 项目中的 AI 使用已结构化披露，便于复核开发过程与合规性。

---

## 演示收尾（10 秒）

> 以上完成了从出单到支付再到安全与披露的完整闭环，链上交易有 digest、可跳 Explorer，且本地 Agent 与安全护栏都能现场验证。


