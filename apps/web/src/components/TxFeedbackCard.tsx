import { useState } from "react";
import { Card } from "@heroui/react";
import type { TxFeedback } from "../lib/sui";

interface Props {
  label: string;
  loading: boolean;
  error: string | null;
  result: TxFeedback | null;
}

export function TxFeedbackCard({ label, loading, error, result }: Props) {
  const [copiedField, setCopiedField] = useState<"digest" | "receipt" | null>(null);

  async function copyText(value: string, field: "digest" | "receipt"): Promise<void> {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 1200);
    } catch {
      setCopiedField(null);
    }
  }

  return (
    <Card variant="secondary" className="panel-card">
      <Card.Content className="space-y-2 text-sm">
        <p className="font-semibold text-slate-200">{label}</p>
        {loading && <p className="text-amber-300">Submitting transaction, please confirm in wallet...</p>}
        {error && <p className="text-red-300">{error}</p>}
        {result && (
          <div className="space-y-1 text-slate-200">
            <div className="flex flex-wrap items-center gap-2">
              <p className="break-all">Digest：{result.digest || "-"}</p>
              {result.digest && (
                <button
                  type="button"
                  className="rounded border border-slate-500/60 px-2 py-0.5 text-xs text-slate-200 transition hover:border-emerald-400/70 hover:text-emerald-200"
                  onClick={() => copyText(result.digest, "digest")}
                >
                  {copiedField === "digest" ? "Copied" : "Copy"}
                </button>
              )}
            </div>
            <p>Status: {result.status}</p>
            {result.receiptObjectId && (
              <div className="flex flex-wrap items-center gap-2">
                <p className="break-all">Receipt Object ID: {result.receiptObjectId}</p>
                <button
                  type="button"
                  className="rounded border border-slate-500/60 px-2 py-0.5 text-xs text-slate-200 transition hover:border-emerald-400/70 hover:text-emerald-200"
                  onClick={() => copyText(result.receiptObjectId!, "receipt")}
                >
                  {copiedField === "receipt" ? "Copied" : "Copy"}
                </button>
              </div>
            )}
            {result.errorMessage && <p className="text-red-300">Error: {result.errorMessage}</p>}
            {result.explorerUrl && (
              <a
                className="text-emerald-300 underline hover:text-emerald-200"
                href={result.explorerUrl}
                target="_blank"
                rel="noreferrer"
              >
                View in Explorer
              </a>
            )}
          </div>
        )}
      </Card.Content>
    </Card>
  );
}
