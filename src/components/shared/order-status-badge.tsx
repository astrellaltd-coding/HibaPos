import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_LABELS } from "@/lib/order-labels";
import type { OrderDto } from "@/types/api";

/**
 * The order-status badge — L-08 (Batch 7.2).
 *
 * This switch existed TWICE, byte-identical at 21 lines each, in
 * `orders-view.tsx` and `dashboard-view.tsx`. Batch 5.6 had to edit both to
 * remove the « En attente » and « Annulée » arms, and `order-status.test.ts`
 * had to read both files as source text to prove it. One copy is one place to
 * edit and one place to assert.
 *
 * The `default` arm is deliberate and is copied from those two, unchanged:
 * every order is COMPLETED or REFUNDED, so it is unreachable through the
 * types, but `status` arrives over HTTP. It shows what actually came back
 * rather than naming a state the product does not have — which is what
 * « En attente » did, on a screen the manager reads (M-08 / DD-13).
 */
export function OrderStatusBadge({ status }: { status: OrderDto["status"] }) {
  switch (status) {
    case "COMPLETED":
      return (
        <Badge className="bg-emerald-100 text-emerald-700">
          {ORDER_STATUS_LABELS.COMPLETED}
        </Badge>
      );
    case "REFUNDED":
      return <Badge variant="destructive">{ORDER_STATUS_LABELS.REFUNDED}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}
