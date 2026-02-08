import { Card } from "@heroui/react";

export function RedemptionModeBanner() {
  return (
    <Card variant="secondary" className="panel-card border border-amber-400/40 bg-amber-500/10">
      <Card.Content className="space-y-2 text-sm text-amber-100">
        <p className="text-base font-semibold text-amber-200">赎回结算提示</p>
        <p>
          即时赎回（Instant）存在手续费和额度上限；T+1 赎回手续费为 0，次日结算。
        </p>
        <p className="font-medium text-amber-200">
          当前 MVP 默认采用 T+1。Instant 仅在路线图中，尚未实现。
        </p>
      </Card.Content>
    </Card>
  );
}
