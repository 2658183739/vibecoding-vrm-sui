import { Navigate, Route, Routes, Link } from "react-router-dom";
import MerchantPage from "./pages/MerchantPage";
import MerchantClaimPage from "./pages/MerchantClaimPage";
import MerchantMetricsPage from "./pages/MerchantMetricsPage";
import PayInvoicePage from "./pages/PayInvoicePage";
import RedeemPage from "./pages/RedeemPage";
import { AgentDrawer } from "./components/AgentDrawer";

export default function App() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-slate-100">
      <header className="border-b border-white/10 bg-black/20">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <p className="text-sm font-semibold tracking-wide text-slate-200">Stableflow Checkout</p>
          <nav className="flex items-center gap-4 text-sm">
            <Link className="text-slate-300 transition hover:text-white" to="/merchant">
              Merchant
            </Link>
            <Link className="text-slate-300 transition hover:text-white" to="/merchant/claim">
              Claim
            </Link>
            <Link className="text-slate-300 transition hover:text-white" to="/merchant/metrics">
              Metrics
            </Link>
            <Link className="text-slate-300 transition hover:text-white" to="/redeem">
              Redeem
            </Link>
          </nav>
        </div>
      </header>

      <Routes>
        <Route path="/" element={<Navigate to="/merchant" replace />} />
        <Route path="/merchant" element={<MerchantPage />} />
        <Route path="/merchant/claim" element={<MerchantClaimPage />} />
        <Route path="/merchant/metrics" element={<MerchantMetricsPage />} />
        <Route path="/pay/:invoiceId" element={<PayInvoicePage />} />
        <Route path="/redeem" element={<RedeemPage />} />
        <Route path="/wallet" element={<Navigate to="/redeem" replace />} />
      </Routes>

      <AgentDrawer />
    </main>
  );
}
