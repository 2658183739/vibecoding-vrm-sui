import { useState } from "react";
import { Button, Card } from "@heroui/react";
import { clearRecentTxHistory, loadRecentTxHistory } from "../lib/txHistory";

interface Props {
  title?: string;
  refreshKey: number;
  limit?: number;
}

function formatTime(timestampMs: number): string {
  const date = new Date(timestampMs);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

export function RecentTxHistoryCard({ title = "最近交易记录", refreshKey, limit = 8 }: Props) {
  const [localRefresh, setLocalRefresh] = useState(0);
  void refreshKey;
  void localRefresh;
  const entries = loadRecentTxHistory(limit);

  return (
    <Card variant="secondary" className="panel-card" data-testid="recent-tx-history-card">
      <Card.Content className="space-y-3 text-sm text-slate-200">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-slate-100">{title}</p>
          <Button
            variant="secondary"
            onPress={() => {
              clearRecentTxHistory();
              setLocalRefresh((prev) => prev + 1);
            }}
          >
            清空
          </Button>
        </div>
        {entries.length === 0 && <p className="text-slate-400">暂无本地交易历史。</p>}
        {entries.map((entry) => (
          <div key={entry.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs text-slate-400">{formatTime(entry.timestampMs)}</p>
            <p className="break-all text-xs text-slate-400">场景：{entry.scene}</p>
            <p className="break-all">Digest：{entry.digest || "-"}</p>
            <p>状态：{entry.status}</p>
            {entry.receiptObjectId && <p className="break-all">回执：{entry.receiptObjectId}</p>}
            {entry.errorMessage && <p className="text-red-300">错误：{entry.errorMessage}</p>}
            {entry.explorerUrl && (
              <a
                href={entry.explorerUrl}
                className="text-emerald-300 underline"
                target="_blank"
                rel="noreferrer"
              >
                打开区块浏览器
              </a>
            )}
          </div>
        ))}
      </Card.Content>
    </Card>
  );
}
