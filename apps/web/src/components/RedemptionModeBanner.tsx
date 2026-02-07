import { Card } from "@heroui/react";

export function RedemptionModeBanner() {
  return (
    <Card variant="secondary" className="border border-amber-400/40 bg-amber-500/10">
      <Card.Content className="space-y-2 text-sm text-amber-100">
        <p className="text-base font-semibold text-amber-200">Redemption Settlement Notice</p>
        <p>
          Instant redemption has fee and cap constraints. T+1 redemption has 0 fee and settles on
          the next day.
        </p>
        <p className="font-medium text-amber-200">
          This MVP defaults to T+1. Instant mode is roadmap only and not implemented yet.
        </p>
      </Card.Content>
    </Card>
  );
}
