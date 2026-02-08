# 项目名称：稳流支付站（Stableflow Checkout）

> 一个基于 Sui 的商户收款与稳定币结算 Monorepo（Move 2024 + React dApp + 规则驱动 Agent + 本地自治模块）。

## 一、项目简介

稳流支付站是一个可运行的开源全栈项目，核心目标是把「商户创建账单」「用户链上支付」「USDC 一键铸造后支付」「赎回与商户结算」打通到同一个产品闭环中，并扩展到“本地自治任务编排”能力。

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
- 支持一键连续执行剧本：`建单 -> Mint+Pay -> Burn -> Claim`（自动串行，逐步反馈）

### 6. Quickstart+ 引导体验

- 首页即引导页（`/quickstart`），按步骤完成商户创建、一键支付、赎回、领取
- 自动显示完成度与演示进度，支持一键重置演示状态
- 支持复制“演示链接”，可快速进入 `Smoke` 演示路径

### 7. 本地自治控制台（Track2 起步能力）

- 新增 `/automation` 页面，提供“计划 -> 守卫 -> 执行”三段式本地任务编排
- 任务计划可配置命令白名单、网络权限、Dry Run、风险审批
- 执行过程与结果可导出 Markdown 审计记录
- 与 Sui/stable-layer 主交易路径并行，不替换既有链上能力

### 7. 真实链校验能力（去“玩具感”增强）

- 默认进入 `REAL` 模式，仅 URL 含 `?smoke=1` 才开启 `SMOKE` 模式
- Quickstart 内置“链路健康状态”卡片：展示网络、RPC、checkpoint、关键余额
- 配置缺失时关键交易按钮会自动禁用，并显示缺失项
- 支付页预览明确标注 `REAL/SMOKE`，避免把模拟数据误判为真实链数据

## 三、目录结构

- `apps/web`：前端 dApp（React + TS + Tailwind + HeroUI）
- `apps/local-agent`：本地常驻 Agent 服务（Node.js + TypeScript）
- `packages/move`：Move 2024 合约包 `stableflow_checkout`
- `packages/agent`：规则驱动 Agent 引擎
- `docs`：架构、演示脚本、提交清单
- `ai-disclosure`：AI 工具与 Prompt 披露

## 四、快速启动

```bash
corepack enable
corepack prepare pnpm@10.5.2 --activate
pnpm install
pnpm dev
```

默认访问：`http://localhost:5173/#/quickstart`

Windows 一键命令：

```bat
start-web.bat
check-move.bat
```

- `start-web.bat`：安装依赖并启动前端（自动打开浏览器）。
- `check-move.bat`：使用 `tools/sui/sui.exe` 执行 `move build + move test`。

### 如何启动本地 Agent（apps/local-agent）

0. 安装 OpenClaw CLI（推荐方式见官方文档）：

```bash
npm install -g openclaw
```

官方文档：

- https://docs.openclaw.ai/
- https://docs.openclaw.ai/browser/quick-start

1. 复制环境变量模板（可选配置 LLM）：

```bash
cp apps/local-agent/.env.example apps/local-agent/.env.local
```

2. 启动本地常驻服务（默认 `127.0.0.1:3777`）：

```bash
pnpm --filter @vibesui/local-agent dev
```

或在仓库根目录使用快捷脚本：

```bash
pnpm dev:local-agent
```

3. 健康检查：

```bash
curl http://127.0.0.1:3777/health
```

核心 API：

- `GET /health`
- `GET /config`
- `POST /config`
- `POST /agent/parse`
- `POST /agent/suggest`
- `POST /browser/open`
- `POST /browser/click`（MVP：建议传 OpenClaw 元素 ref）
- `POST /browser/type`（MVP：建议传 OpenClaw 元素 ref + text）

### Local Agent 的 LLM 可选增强（安全兜底）

- 关闭增强（默认）：`LLM_PROVIDER=none` 或 `LLM_API_KEY` 为空
  - `POST /agent/parse` 只走规则引擎（关键词/正则）
- 开启增强：`LLM_PROVIDER=openai|anthropic` 且填写 `LLM_API_KEY`
  - LLM 仅用于 `text -> {intent, slots}` 结构化解析
  - 输出必须通过本地校验（intent 白名单 + slots 类型/来源校验），失败自动回退规则引擎

安全边界（强制）：

- LLM 不会直接生成交易
- LLM 不会决定金额/地址（仅允许解析用户输入中显式出现的值）

快速验证（先打开 dApp，再触发动作）：

```bash
curl http://127.0.0.1:3777/health
curl -X POST http://127.0.0.1:3777/browser/open -H "Content-Type: application/json" -d "{\"url\":\"http://localhost:5173/#/quickstart\"}"
curl -X POST http://127.0.0.1:3777/browser/click -H "Content-Type: application/json" -d "{\"target\":\"e12\",\"url\":\"http://localhost:5173/merchant\"}"
curl -X POST http://127.0.0.1:3777/browser/type -H "Content-Type: application/json" -d "{\"target\":\"e15\",\"text\":\"100\",\"url\":\"http://localhost:5173/merchant\"}"
```

配置持久化：

- 默认写入 `~/.stableclaw/config.json`
- 若主目录不可写，自动回退到项目根目录 `.local/config.json`

安全约束：

- 本地 Agent 仅保存 allowlist 与 LLM 开关配置
- 永远不保存私钥、助记词等钱包敏感信息

## 五、配置说明（apps/web/.env）

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

## 六、合约构建与发布（Move 2024）

若系统未全局安装 `sui`，可把 Windows CLI 解压到 `tools/sui`，然后使用：

```bat
check-move.bat
```

或手动执行：

```bash
cd packages/move
sui move build
sui move test
sui client publish --gas-budget 200000000
```

发布后把 `PACKAGE_ID`、`MERCHANT_ID`、币种 Type 等同步写入 `apps/web/.env`。

## 七、质量验证

```bash
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```

> `pnpm test:e2e` 覆盖核心冒烟链路：Mint+Pay / Burn / Claim。

## 八、参赛合规清单

- [X]  Move 2024：`packages/move/Move.toml` 使用 `edition = "2024.beta"`
- [X]  官方 Sui SDK：核心代码使用官方 `@mysten/sui`
- [X]  stable-layer 核心路径：Mint / Burn / Claim / Supply 均已接入
- [X]  可运行产品：提供完整 Web dApp 与演示文档
- [X]  开源材料：合约、前端、Agent、部署说明齐备
- [X]  AI 披露：`ai-disclosure/tools.md` + `ai-disclosure/prompts/*.md`
