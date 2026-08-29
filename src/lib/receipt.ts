// Client-side receipt download wrapper.
// Uses the canonical server renderer for consistency.
import type { OrderDto, SettingsDto } from "@/types/api";
import { renderReceipt } from "@/lib/services/receipt";

/** Download a receipt as a .txt file. */
export function downloadReceipt(order: OrderDto, settings?: SettingsDto): void {
  const text = renderReceipt(order, settings);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `recu-${order.number}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
