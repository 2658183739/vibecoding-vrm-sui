import { Card } from "@heroui/react";
import type { TxFeedback } from "../lib/sui";

interface Props {
  label: string;
  loading: boolean;
  error: string | null;
  result: TxFeedback | null;
}

export function TxFeedbackCard({ label, loading, error, result }: Props) {
  return (
    <Card variant="secondary">
      <Card.Content className="space-y-2 text-sm">
        <p className="font-semibold text-slate-200">{label}</p>
        {loading && <p className="text-amber-300">Submitting transaction...</p>}
        {error && <p className="text-red-300">{error}</p>}
        {result && (
          <div className="space-y-1 text-slate-200">
            <p>Digest: {result.digest || "-"}</p>
            <p>Status: {result.status}</p>
            {result.receiptObjectId && <p>Receipt ObjectId: {result.receiptObjectId}</p>}
            {result.errorMessage && <p className="text-red-300">Error: {result.errorMessage}</p>}
            {result.explorerUrl && (
              <a
                className="text-emerald-300 underline hover:text-emerald-200"
                href={result.explorerUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open in Explorer
              </a>
            )}
          </div>
        )}
      </Card.Content>
    </Card>
  );
}
