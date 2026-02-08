import { lazy, Suspense } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";

const MerchantPage = lazy(() => import("./pages/MerchantPage"));
const MerchantClaimPage = lazy(() => import("./pages/MerchantClaimPage"));
const MerchantMetricsPage = lazy(() => import("./pages/MerchantMetricsPage"));
const PayInvoicePage = lazy(() => import("./pages/PayInvoicePage"));
const RedeemPage = lazy(() => import("./pages/RedeemPage"));
const QuickstartPage = lazy(() => import("./pages/QuickstartPage"));
const AutomationPage = lazy(() => import("./pages/AutomationPage"));
const LocalAgentPage = lazy(() => import("./pages/LocalAgentPage"));
const AgentDrawer = lazy(() =>
  import("./components/AgentDrawer").then((mod) => ({ default: mod.AgentDrawer }))
);

export default function App() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_15%_20%,#1f3b33_0%,transparent_42%),radial-gradient(circle_at_85%_12%,#2a3549_0%,transparent_35%),linear-gradient(160deg,#050711_0%,#0d1423_42%,#101c2a_100%)] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(14,25,42,0.12)_0%,rgba(7,11,18,0.4)_100%)]" />

      <header className="relative border-b border-white/10 bg-slate-950/55 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <div>
            <p className="text-base font-semibold tracking-wide text-emerald-200">稳流支付站</p>
            <p className="text-xs text-slate-400">稳定结算演示平台 · Sui + StableLayer</p>
          </div>
          <nav className="flex flex-wrap items-center gap-2 text-sm md:gap-3">
            <Link className="nav-pill" to="/quickstart">
              引导体验
            </Link>
            <Link className="nav-pill" to="/merchant">
              商户台
            </Link>
            <Link className="nav-pill" to="/merchant/claim">
              领取收益
            </Link>
            <Link className="nav-pill" to="/merchant/metrics">
              指标看板
            </Link>
            <Link className="nav-pill" to="/redeem">
              赎回中心
            </Link>
            <Link className="nav-pill" to="/automation">
              本地自治
            </Link>
            <Link className="nav-pill" to="/agent">
              Local Agent
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative">
        <Suspense
          fallback={
            <div className="mx-auto max-w-6xl px-6 py-10 text-sm text-slate-300">页面加载中...</div>
          }
        >
          <Routes>
            <Route path="/" element={<Navigate to="/quickstart" replace />} />
            <Route path="/quickstart" element={<QuickstartPage />} />
            <Route path="/merchant" element={<MerchantPage />} />
            <Route path="/merchant/claim" element={<MerchantClaimPage />} />
            <Route path="/merchant/metrics" element={<MerchantMetricsPage />} />
            <Route path="/pay/:invoiceId" element={<PayInvoicePage />} />
            <Route path="/redeem" element={<RedeemPage />} />
            <Route path="/wallet" element={<Navigate to="/redeem" replace />} />
            <Route path="/automation" element={<AutomationPage />} />
            <Route path="/agent" element={<LocalAgentPage />} />
          </Routes>
        </Suspense>
      </section>

      <Suspense fallback={null}>
        <AgentDrawer />
      </Suspense>
    </main>
  );
}
