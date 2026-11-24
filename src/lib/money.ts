/**
 * Money and calculation rules for Suk Link (Section 9).
 * All amounts are integers in minor units of the record's currency_code (santim for ETB).
 * Never use floating point math for storage or arithmetic.
 */

export interface CurrencyConfig {
  currency: string;
  symbol: string;
  digits: number;
}

export const DEFAULT_ETB_CURRENCY: CurrencyConfig = {
  currency: 'ETB',
  symbol: 'Br',
  digits: 2,
};

export type SupportedLocale = 'en' | 'am' | 'om' | 'so' | 'ti' | 'sw';

const LOCALE_FALLBACK_CHAIN: Record<string, string[]> = {
  en: ['en-ET', 'en-US', 'en'],
  am: ['am-ET', 'am', 'en'],
  om: ['om-ET', 'om', 'en'],
  so: ['so-ET', 'so-SO', 'so', 'en'],
  ti: ['ti-ET', 'ti', 'en'],
  sw: ['sw-KE', 'sw', 'en'],
};

export function toMinor(decimalInput: string | number, digits = 2): number {
  if (!Number.isInteger(digits) || digits < 0 || digits > 4) {
    throw new Error('INVALID_MINOR_DIGITS');
  }
  const str = typeof decimalInput === 'number' ? String(decimalInput) : decimalInput.trim();
  if (!str) {
    throw new Error('EMPTY_AMOUNT');
  }
  const normalized = str.replace(/,/g, '');
  const regex = digits === 0 ? /^-?\d+$/ : new RegExp(`^-?\\d+(\\.\\d{1,${digits}})?$`);
  if (!regex.test(normalized)) {
    throw new Error('INVALID_MONEY_FORMAT');
  }
  const isNegative = normalized.startsWith('-');
  const clean = isNegative ? normalized.slice(1) : normalized;
  const [wholePart, fracPart = ''] = clean.split('.');
  const factor = Math.pow(10, digits);
  const paddedFrac = digits === 0 ? '0' : (fracPart + '0'.repeat(digits)).slice(0, digits);
  const minor = parseInt(wholePart, 10) * factor + parseInt(paddedFrac, 10);
  return isNegative ? -minor : minor;
}

export function fromMinorToDecimal(amountMinor: number, digits = 2): string {
  if (!Number.isInteger(amountMinor)) {
    throw new Error('MINOR_MUST_BE_INTEGER');
  }
  const isNegative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  if (digits === 0) {
    return `${isNegative ? '-' : ''}${abs}`;
  }
  const factor = Math.pow(10, digits);
  const whole = Math.floor(abs / factor);
  const frac = String(abs % factor).padStart(digits, '0');
  return `${isNegative ? '-' : ''}${whole}.${frac}`;
}

function getSafeNumberFormat(locale: string, digits: number): Intl.NumberFormat {
  const candidates = LOCALE_FALLBACK_CHAIN[locale] || [locale, 'en'];
  for (const tag of candidates) {
    try {
      return new Intl.NumberFormat(`${tag}-u-nu-latn`, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
        numberingSystem: 'latn',
      });
    } catch {
      continue;
    }
  }
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatMoney(
  amountMinor: number,
  currencyConfig: CurrencyConfig = DEFAULT_ETB_CURRENCY,
  locale = 'en'
): string {
  if (!Number.isInteger(amountMinor)) {
    throw new Error('MINOR_MUST_BE_INTEGER');
  }
  const { symbol, digits } = currencyConfig;
  const isNegative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  const factor = Math.pow(10, digits);
  const formatter = getSafeNumberFormat(locale, digits);
  const formattedNumber = formatter.format(abs / factor);
  return isNegative ? `-${symbol} ${formattedNumber}` : `${symbol} ${formattedNumber}`;
}

export function formatDate(
  dateInput: string | Date | number,
  locale = 'en',
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }
): string {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const candidates = LOCALE_FALLBACK_CHAIN[locale] || [locale, 'en'];
  for (const tag of candidates) {
    try {
      const dtf = new Intl.DateTimeFormat(`${tag}-u-ca-gregory-nu-latn`, {
        ...options,
      });
      return dtf.format(date);
    } catch {
      continue;
    }
  }
  return new Intl.DateTimeFormat('en-US', options).format(date);
}

// Backwards-compatible aliases for ETB/santim convenience
export const toSantim = (val: string | number) => toMinor(val, 2);
export const formatETB = (minor: number, locale = 'en') =>
  formatMoney(minor, DEFAULT_ETB_CURRENCY, locale);

export interface LineInput {
  unit_price_minor: number;
  quantity: number;
}

export interface OrderTotalComputation {
  line_totals_minor: number[];
  subtotal_minor: number;
  delivery_fee_minor: number;
  total_minor: number;
}

export function computeLineTotal(unitPriceMinor: number, quantity: number): number {
  if (!Number.isInteger(unitPriceMinor) || unitPriceMinor < 0) {
    throw new Error('INVALID_UNIT_PRICE');
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
    throw new Error('INVALID_QUANTITY');
  }
  return unitPriceMinor * quantity;
}

export function computeCartTotals(
  items: LineInput[],
  deliveryFeeMinor = 0
): OrderTotalComputation {
  if (!Number.isInteger(deliveryFeeMinor) || deliveryFeeMinor < 0) {
    throw new Error('INVALID_DELIVERY_FEE');
  }
  const line_totals_minor = items.map((item) =>
    computeLineTotal(item.unit_price_minor, item.quantity)
  );
  const subtotal_minor = line_totals_minor.reduce((acc, v) => acc + v, 0);
  const total_minor = subtotal_minor + deliveryFeeMinor;
  return {
    line_totals_minor,
    subtotal_minor,
    delivery_fee_minor: deliveryFeeMinor,
    total_minor,
  };
}
