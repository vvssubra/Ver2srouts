import { Badge } from "@/components/ui/badge";
import { INVOICE_STATUSES } from "@/lib/finance/constants";

export function InvoiceStatusBadge({ status }: { status: string }) {
  const config = INVOICE_STATUSES[status] || INVOICE_STATUSES.draft;
  return (
    <Badge variant="outline" className={`text-xs font-semibold px-2.5 py-0.5 ${config.className}`}>
      {config.label}
    </Badge>
  );
}
