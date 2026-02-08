# Project Name: Stableflow Checkout

> A Sui-based Merchant Checkout & Stablecoin Settlement Monorepo (Move 2024 + React dApp + Rule-based Agent + Local Automation).

## I. Project Introduction

Stableflow Checkout is a production-ready open-source full-stack project. Its core goal is to connect "Merchant Invoice Creation", "User On-chain Payment", "USDC Atomic Mint+Pay", and "Redemption & Merchant Settlement" into a single product loop, extending to "Local Automation Task Orchestration" capabilities.

The repository is managed using `pnpm workspace` and includes:

- Frontend dApp (`apps/web`)
- Move 2024 Contracts (`packages/move`)
- Rule-based Agent Engine (`packages/agent`)
- Architecture & Demo Documentation (`docs`)
- AI Disclosure Materials (`ai-disclosure`)

## II. Features

### 1. Merchant Dashboard
- Create Product
- Create Invoice based on Product
- View created invoices and navigate to payment pages

### 2. User Payment (Pay)
- Standard Pay: Call `pay_invoice<T>` to complete payment
- Atomic Pay: `USDC -> BrandUSD -> Pay` completed in a single transaction (Mint+Pay)
- Full Payment Feedback: `digest`, `status`, `Explorer Link`, `Receipt ObjectId`

### 3. Redemption
- Supports `Burn amount` and `Burn all`
- Page explicit note: MVP defaults to `T+1`, `Instant` is on the roadmap (not faked as live)

### 4. Merchant Settlement & Metrics
- `Claim`: Merchants can trigger yield claim transactions
- `Metrics`: Read `getTotalSupply()` and `getTotalSupplyByCoinType(type)`

### 5. Agent Assistant
- Input: Natural Language + Page Context
- Output: Intent, Steps, Executable Actions
- Actions still require user wallet signature after clicking; private keys are not hosted
- Supports one-click continuous playbook execution: `Invoice -> Mint+Pay -> Burn -> Claim` (Auto-serial, step-by-step feedback)

### 6. Quickstart+ Guided Experience
- Homepage is the guide page (`/quickstart`), connecting merchant creation, atomic payment, redemption, and claiming steps
- Automatically displays completion and demo progress, supports one-click demo state reset
- Supports copying "Demo Link" for quick access to the `Smoke` demo path

### 7. Local Automation Console (Track 2 Starter Capability)
- New `/automation` page providing "Plan -> Guard -> Execute" three-stage local task orchestration
- Task plans configurable with command whitelists, network permissions, Dry Run, and risk approval
- Execution process and results exportable as Markdown audit logs
- Runs parallel to Sui/stable-layer main transaction paths, not replacing existing on-chain capabilities

### 8. Real Chain Verification (De-gamification)
- Defaults to `REAL` mode; `SMOKE` mode only enabled if URL contains `?smoke=1`
- Quickstart built-in "Chain Health" card: Displays Network, RPC, Checkpoint, Key Balances
- Critical transaction buttons automatically disabled if configuration is missing, displaying missing items
- Payment page preview clearly marks `REAL/SMOKE` to avoid mistaking simulated data for real chain data

## III. Directory Structure

- `apps/web`: Frontend dApp (React + TS + Tailwind + HeroUI)
- `apps/local-agent`: Local Persistent Agent Service (Node.js + TypeScript)
- `packages/move`: Move 2024 Contract Package `stableflow_checkout`
- `packages/agent`: Rule-based Agent Engine
- `docs`: Architecture, Demo Scripts, Submission Checklist
- `ai-disclosure`: AI Tools & Prompt Disclosure

## IV. Quick Start

```bash
corepack enable
corepack prepare pnpm@10.5.2 --activate
pnpm install
pnpm dev
```

Default access: `http://localhost:5173/#/quickstart`

Windows One-Click Commands:

```bat
start-web.bat
check-move.bat
```

- `start-web.bat`: Installs dependencies and starts frontend (automatically opens browser).
- `check-move.bat`: Uses `tools/sui/sui.exe` to execute `move build + move test`.

### How to Start Local Agent (apps/local-agent)

0. Install OpenClaw CLI (Recommended, see official docs):

```bash
npm install -g openclaw
```

Official Docs:
- https://docs.openclaw.ai/
- https://docs.openclaw.ai/browser/quick-start

1. Copy Environment Template (Optional LLM Config):

```bash
cp apps/local-agent/.env.example apps/local-agent/.env.local
```

2. Start Local Persistent Service (Default `127.0.0.1:3777`):

```bash
pnpm --filter @vibesui/local-agent dev
```

Or use the shortcut script in the root directory:

```bash
pnpm dev:local-agent
```

3. Health Check:

```bash
curl http://127.0.0.1:3777/health
```

Core APIs:
- `GET /health`
- `GET /config`
- `POST /config`
- `POST /agent/parse`
- `POST /agent/suggest`
- `POST /browser/open`
- `POST /browser/click` (MVP: Suggest passing OpenClaw element ref)
- `POST /browser/type` (MVP: Suggest passing OpenClaw element ref + text)

### Local Agent Optional LLM Enhancement (Safety Fallback)

- Disable Enhancement (Default): `LLM_PROVIDER=none` or empty `LLM_API_KEY`
  - `POST /agent/parse` only uses rule engine (Keywords/Regex)
- Enable Enhancement: `LLM_PROVIDER=openai|anthropic` and fill `LLM_API_KEY`
  - LLM only used for `text -> {intent, slots}` structured parsing
  - Output must pass local validation (Intent Whitelist + Slots Type/Source Validation), failure auto-fallbacks to rule engine

Safety Boundaries (Mandatory):
- LLM will NOT directly generate transactions
- LLM will NOT determine amounts/addresses (Only allows parsing values explicitly present in user input)

Quick Verification (Open dApp first, then trigger action):

```bash
curl http://127.0.0.1:3777/health
curl -X POST http://127.0.0.1:3777/browser/open -H "Content-Type: application/json" -d "{\"url\":\"http://localhost:5173/#/quickstart\"}"
curl -X POST http://127.0.0.1:3777/browser/click -H "Content-Type: application/json" -d "{\"target\":\"e12\",\"url\":\"http://localhost:5173/merchant\"}"
curl -X POST http://127.0.0.1:3777/browser/type -H "Content-Type: application/json" -d "{\"target\":\"e15\",\"text\":\"100\",\"url\":\"http://localhost:5173/merchant\"}"
```

Configuration Persistence:
- Defaults to writing to `~/.stableclaw/config.json`
- If home directory is unwritable, auto-fallbacks to project root `.local/config.json`

Safety Constraints:
- Local Agent only saves allowlist and LLM switch configs
- NEVER saves private keys, mnemonics, or other sensitive wallet info

## V. Configuration (apps/web/.env)

Copy Template:

```bash
cp apps/web/.env.example apps/web/.env
```

Key Configs:
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

### Alibaba DashScope Key (Env Var Way)

- Copy: `packages/agent/.env.example -> packages/agent/.env.local`
- Fill:
  - `DASHSCOPE_API_KEY`
  - `DASHSCOPE_BASE_URL` (Default `https://dashscope.aliyuncs.com/compatible-mode/v1`)
  - `DASHSCOPE_MODEL` (Default `qwen3-max`)
- Safety Note:
  - `packages/agent/.env.local` is ignored by `.gitignore` and will not be uploaded.
  - **DO NOT** put keys into `apps/web/.env` `VITE_*` variables, as frontend builds will expose them to all visitors.

## VI. Contract Build & Publish (Move 2024)

If `sui` is not installed globally, verify Windows CLI is unzipped to `tools/sui`, then use:

```bat
check-move.bat
```

Or manually execute:

```bash
cd packages/move
sui move build
sui move test
sui client publish --gas-budget 200000000
```

After publishing, sync `PACKAGE_ID`, `MERCHANT_ID`, Coin Types, etc., to `apps/web/.env`.

## VII. Quality Verification

```bash
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```

> `pnpm test:e2e` covers core smoke paths: Mint+Pay / Burn / Claim.

## VIII. Competition Compliance Checklist

- [X] Move 2024: `packages/move/Move.toml` uses `edition = "2024.beta"`
- [X] Official Sui SDK: Core code uses official `@mysten/sui`
- [X] Stable Layer Core Path: Mint / Burn / Claim / Supply all integrated
- [X] Runnable Product: Provides complete Web dApp & Demo Docs
- [X] Open Source Materials: Contracts, Frontend, Agent, Deployment Instructions ready
- [X] AI Disclosure: `ai-disclosure/tools.md` + `ai-disclosure/prompts/*.md`
