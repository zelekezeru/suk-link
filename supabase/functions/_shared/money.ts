// supabase/functions/_shared/money.ts
// Shared money calculation helpers for Edge Functions

export function computeLineTotalMinor(unitPriceMinor: number, quantity: number): number {
  if (!Number.isInteger(unitPriceMinor) || unitPriceMinor < 0) {
    throw new Error('INVALID_UNIT_PRICE');
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
    throw new Error('INVALID_QUANTITY');
  }
  return unitPriceMinor * quantity;
}

export function formatMinor(amountMinor: number, digits = 2): string {
  const factor = Math.pow(10, digits);
  return (amountMinor / factor).toFixed(digits);
}

