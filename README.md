# 项目名称：稳流支付站（Stableflow Checkout）

> 一个基于 Sui 的商户收款与稳定币结算 Monorepo（Move 2024 + React dApp + 规则驱动 Agent）。

## 一、项目简介

稳流支付站是一个面向黑客松场景的可运行全栈项目，核心目标是把「商户创建账单」「用户链上支付」「USDC 一键铸造后支付」「赎回与商户结算」打通到同一个产品闭环中。

仓库采用 `pnpm workspace` 管理，包含：
- 前端 dApp（`apps/web`）
- Move 2024 合约（`packages/move`）
- 规则驱动 Agent 引擎（`packages/agent`）
- 架构与演示文档（`docs`）
- AI 使用披露材料（`ai-disclosure`）

## 二、功能描述

### 1. 商户端（Merchant）
- 创建商品（Product）
- 基于商品创建账单（Invoice）
- 查看已创建账单并进入支付页

### 2. 用户支付端（Pay）
- 普通支付：调用 `pay_invoice<T>` 完成付款
- 一键支付：`USDC -> BrandUSD -> Pay` 在同一笔交易中完成（Mint+Pay）
- 支付结果完整反馈：`digest`、`status`、`Explorer 链接`、`Receipt ObjectId`

### 3. 赎回（Redeem）
- 支持 `Burn amount` 与 `Burn all`
- 页面明确提示：MVP 默认 `T+1`，`Instant` 为路线图（未假装已上线）

### 4. 商户结算与指标
- `Claim`：商户可触发收益领取交易
- `Metrics`：读取 `getTotalSupply()` 与 `getTotalSupplyByCoinType(type)`

### 5. Agent 助手
- 输入：自然语言 + 页面上下文
- 输出：意图、步骤、可执行动作
- 动作点击后仍由用户钱包签名，私钥不托管

## 三、项目优点与不足

### 优点
- 业务闭环完整：创建账单、支付、赎回、结算、指标、Agent 都可演示。
- 技术栈统一：Move 2024、官方 `@mysten/sui`、TypeScript 全链路。
- 可验证性强：交易结果统一展示并可跳转浏览器复核。
- 合规意识明确：AI 披露、配置示例、提交检查清单齐全。
- Monorepo 结构清晰：便于团队并行开发与评审定位。

### 不足
- 对外部链上环境依赖较高：RPC 稳定性会直接影响演示体验。
- 目前缺少 E2E 自动化测试，回归主要依赖人工流程。
- stable-layer 相关能力受测试网流动性与权限状态影响较大。
- 线上部署仍需你补充正式域名与演示视频链接（仓库无法代替完成）。

## 四、目录结构

- `apps/web`：前端 dApp（React + TS + Tailwind + HeroUI）
- `packages/move`：Move 2024 合约包 `stableflow_checkout`
- `packages/agent`：规则驱动 Agent 引擎
- `docs`：架构、演示脚本、提交清单
- `ai-disclosure`：AI 工具与 Prompt 披露

## 五、快速启动

```bash
corepack enable
corepack prepare pnpm@10.5.2 --activate
pnpm install
pnpm dev
```

默认访问：`http://localhost:5173`

## 六、配置说明（apps/web/.env）

复制模板：

```bash
cp apps/web/.env.example apps/web/.env
```

关键配置：
- `VITE_SUI_NETWORK`
- `VITE_SUI_RPC_URL`
- `VITE_PACKAGE_ID`
- `VITE_MODULE_NAME`
- `VITE_MERCHANT_ID`
- `VITE_PAY_COIN_TYPE`
- `VITE_STABLE_LAYER_NETWORK`
- `VITE_STABLE_LAYER_STABLE_COIN_TYPE`
- `VITE_STABLE_LAYER_BRAND_USD_TYPE`
- `VITE_STABLE_LAYER_USDC_TYPE`

### 阿里百炼 Key（环境变量方式）

- 复制：`packages/agent/.env.example -> packages/agent/.env.local`
- 填写：
  - `DASHSCOPE_API_KEY`
  - `DASHSCOPE_BASE_URL`（默认 `https://dashscope.aliyuncs.com/compatible-mode/v1`）
  - `DASHSCOPE_MODEL`（默认 `qwen3-max`）
- 安全说明：
  - `packages/agent/.env.local` 已被 `.gitignore` 忽略，不会上传。
  - **不要**把密钥放进 `apps/web/.env` 的 `VITE_*` 变量中，前端构建后会暴露给所有访问者。

## 七、合约构建与发布（Move 2024）

```bash
cd packages/move
sui move build
sui move test
sui client publish --gas-budget 200000000
```

发布后把 `PACKAGE_ID`、`MERCHANT_ID`、币种 Type 等同步写入 `apps/web/.env`。

## 八、质量验证

```bash
pnpm lint
pnpm build
pnpm test
```

## 九、参赛合规清单（对照要求）

- [x] Move 2024：`packages/move/Move.toml` 使用 `edition = "2024.beta"`
- [x] 官方 Sui SDK：核心代码使用官方 `@mysten/sui`
- [x] stable-layer 核心路径：Mint / Burn / Claim / Supply 均已接入
- [x] 可运行产品：提供完整 Web dApp 与演示文档
- [x] 开源材料：合约、前端、Agent、部署说明齐备
- [x] AI 披露：`ai-disclosure/tools.md` + `ai-disclosure/prompts/*.md`

## 十、必须人工确认的两件事

1. **项目创建时间**（比赛硬性条件）
   - 在公开仓库执行并截图：
   - `git log --reverse --format=%aI | head -1`
   - 确保首个提交时间 `>= 2026-01-27`

2. **线上可访问站点**
   - 推荐白嫖方案：GitHub Pages（本仓库已内置自动部署工作流）
   - 推送到 `main` 后，预计访问地址：
   - `https://2658183739.github.io/vibecoding-vrm-sui/`
   - 在提交材料中填写公开 URL + 演示视频

详细演示可看：`docs/项目演示指南.md`

## 十一、免费部署（GitHub Pages）

1. 推送代码到 `main` 分支。
2. 打开 GitHub 仓库 `Settings -> Pages`，确保 `Build and deployment` 使用 `GitHub Actions`。
3. 等待工作流 `deploy-pages` 完成（约 1-3 分钟）。
4. 打开站点：`https://2658183739.github.io/vibecoding-vrm-sui/`。
