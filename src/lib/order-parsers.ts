// Shared safe JSON parsers for order item options/add-ons —
// extracted from receipt-dialog.tsx + orders-view.tsx
// (Phase 7b — pure cleanup, no behavior change).
// Guards receipt/order-detail rendering against malformed
// server JSON (a single corrupt line item shouldn't crash the modal).

export type ParsedOption = { group: string; choice: string; priceModifier?: number };
export type ParsedAddOn = { id?: string | null; name: string; price: number };

export function safeParseOptions(json: string | null): ParsedOption[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as ParsedOption[]) : [];
  } catch {
    return [];
  }
}

export function safeParseAddOns(json: string | null): ParsedAddOn[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as ParsedAddOn[]) : [];
  } catch {
    return [];
  }
}
