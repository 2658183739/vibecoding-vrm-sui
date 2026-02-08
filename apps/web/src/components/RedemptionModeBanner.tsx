import { Card } from "@heroui/react";

export function RedemptionModeBanner() {
  return (
    <Card variant="secondary" className="panel-card border border-amber-400/40 bg-amber-500/10">
      <Card.Content className="space-y-2 text-sm text-amber-100">
        <p className="text-base font-semibold text-amber-200">Redemption Notice</p>
        <p>
          Instant redemption has fees and limits; T+1 redemption is free and settles next day.
        </p>
        <p className="font-medium text-amber-200">
          MVP defaults to T+1. Instant is on roadmap but not yet implemented.
        </p>
      </Card.Content>
    </Card>
  );
}
