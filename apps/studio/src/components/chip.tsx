import { STATUS_LABEL, STATUS_TONE, type ShipStatus } from "@/data/status";
import { cn } from "@/lib/utils";

export function StatusChip({ status }: { status: ShipStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tracking-wide",
        "bg-raised text-muted",
        STATUS_TONE[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
