# Stableflow Checkout Full Demo Walkthrough (Open Source Version)

> Goal: Completely demonstrate "Merchant Invoice Creation -> User One-Click Payment -> Redemption -> Merchant Claim -> Metrics Verification -> Agent Automation Playbook -> Local Automation Task Execution" within 8-12 minutes.

## 1. Pre-Demo Preparation

1. Start Project:

```bash
corepack pnpm install
corepack pnpm dev
```

2. Open: `http://localhost:5173/#/quickstart`
3. Connect Wallet and verify `.env` configuration:
   - `VITE_PACKAGE_ID`
   - `VITE_MERCHANT_ID`
   - `VITE_STABLE_LAYER_STABLE_COIN_TYPE`
   - `VITE_STABLE_LAYER_BRAND_USD_TYPE`
   - `VITE_STABLE_LAYER_USDC_TYPE`

## 2. Clarify "Real Mode vs Smoke Mode" First

- Default is **Real Chain Mode (REAL)**.
- Only enters **Smoke Demo Mode** when URL contains `?smoke=1`.
- Faststart's "Chain Health" card will explicitly show current mode.

Explanation Advice:
- `REAL`: All balances, checkpoints, and transaction links come from real RPC.
- `SMOKE`: Used for offline flow demonstration; transaction feedback is simulated and not proof of on-chain authenticity.

## 3. Mainline Demo (Manual)

### 3.1 Merchant Create Invoice (`#/merchant`)

1. Enter "Merchant Dashboard".
2. Create Product (Title + Price).
3. Select Product to Create Invoice.
4. Click "Go to Pay" in Invoice List.

Acceptance Criteria:
- New `Invoice objectId` appears.
- Status is "Pending Payment".

### 3.2 User Payment (`#/pay/:invoiceId`)

1. Switch to Buyer Wallet.
2. View "One-Click Payment Preview":
   - Estimated Mint
   - Estimated Payment
   - Selected USDC Total
   - USDC Object List
3. Click `USDC One-Click Pay (Mint+Pay in one tx)`.

Acceptance Criteria:
- Display `digest / status / explorer`.
- `Receipt objectId` visible on success.
- `InvoicePaid` / `ReceiptMinted` events visible in event stream.

### 3.3 Redemption (`#/redeem`)

1. Enter Redeem Page.
2. Show Banner: MVP defaults to T+1, Instant is roadmap only.
3. Execute `Redeem Amount` or `Redeem All`.

Acceptance Criteria:
- Transaction feedback includes `digest / status / explorer`.

### 3.4 Merchant Claim Yield (`#/merchant/claim`)

1. Click "Claim Revenue".
2. If failed, page shows possible reasons (Permission, non-beneficiary, config error, RPC exception).

### 3.5 Metrics Dashboard (`#/merchant/metrics`)

1. Click "Refresh Data".
2. Display:
   - Payment Conversion Rate
   - Paid/Pending GMV
   - `getTotalSupply()`
   - `getTotalSupplyByCoinType(type)`

## 4. Agent Demo (Recommended)

1. Open bottom-right "Smart Assistant".
2. Input: `Please run the playbook continuously`.
3. Click "Run Playbook" in "Recommended Actions".
4. Sign wallets sequentially as prompted.

Playbook executes serially:
- Create Product
- Create Invoice
- Mint+Pay
- Burn
- Claim

## 5. Local Automation Module Demo (New)

1. Open `#/automation` page.
2. Input Task Goal: `Organize Downloads, archive by type and output report`.
3. Confirm Command Whitelist Prefix (e.g., `node,git,ffmpeg,tar,pnpm`).
4. Click "Generate Plan".
5. View "Security Guard Status":
   - Any blocking reasons
   - Any high-risk step approval requirements
6. Click "Execute Plan".
7. Click "Export Markdown".

Explanation:
- This module uses a "Plan -> Guard -> Execute" three-stage architecture.
- Does not replace existing `stable-layer-sdk` & `@mysten/sui` main transaction links.

## 6. History & Export

1. Open Agent's "Timeline/History" panel.
2. Click "Export Markdown".
3. Exported `.md` can be used as demo attachment directly.

Explanation:
- Timeline persisted to `localStorage`.
- Export content is Markdown structure, facilitating review and team collaboration.

## 7. FAQ

### 7.1 Why does the USDC Object List change?

- In Real Chain Mode, coins in wallet might be split/merged; selector recombines coins by balance, so list may change.
- In Smoke Mode, stable simulated coin IDs are used to avoid "jumping around on refresh".

### 7.2 What is Smoke?

- Smoke (Smoke Test) is a minimal link verification mode, focusing on quickly verifying "connectivity".
- It is not proof of production authenticity, only for demonstrating continuity and fault tolerance.

### 7.3 How to prove it's not a toy?

- Key transactions can be clicked to check Explorer.
- Page has REAL/SMOKE mode indicators.
- Key transaction buttons are disabled and prompt gaps when config is incomplete.
- Local Automation module has guard strategies and exportable audit logs.

## 8. Recording Advice

1. Record 30s "Project Positioning + Mode Explanation".
2. Record 3-4 mins Mainline Loop.
3. Record 1 min Agent One-Click Playbook + Markdown Export.
4. Record 1 min Local Automation Console (Plan, Guard, Execute, Export).
5. End video with Explorer page as endorsement of authenticity.
