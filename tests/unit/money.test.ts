import { describe, it, expect } from 'vitest';
import {
  toMinor,
  fromMinorToDecimal,
  formatMoney,
  formatDate,
  computeLineTotal,
  computeCartTotals,
  DEFAULT_ETB_CURRENCY,
  SupportedLocale,
} from '../../src/lib/money';

const ALL_LOCALES: SupportedLocale[] = ['en', 'am', 'om', 'so', 'ti', 'sw'];

describe('Money and calculation rules (Section 8.1 & Section 9)', () => {
  it('converts decimal currency strings and numbers to integer minor units', () => {
    expect(toMinor('12.50', 2)).toBe(1250);
    expect(toMinor('12.5', 2)).toBe(1250);
    expect(toMinor('0', 2)).toBe(0);
    expect(toMinor('1,245.00', 2)).toBe(124500);
    expect(toMinor(75, 2)).toBe(7500);
    expect(toMinor('0.05', 2)).toBe(5);
    expect(toMinor('500', 0)).toBe(500);
  });

  it('rejects more decimals than the currency allows or invalid strings', () => {
    expect(() => toMinor('12.555', 2)).toThrow('INVALID_MONEY_FORMAT');
    expect(() => toMinor('12.5', 0)).toThrow('INVALID_MONEY_FORMAT');
    expect(() => toMinor('abc', 2)).toThrow('INVALID_MONEY_FORMAT');
    expect(() => toMinor('', 2)).toThrow('EMPTY_AMOUNT');
  });

  it('formats minor units for all six locales and multiple market currencies without throwing', () => {
    const markets = [
      DEFAULT_ETB_CURRENCY,
      { currency: 'KES', symbol: 'KSh', digits: 2 },
    ];

    for (const locale of ALL_LOCALES) {
      for (const market of markets) {
        const out = formatMoney(124500, market, locale);
        expect(typeof out).toBe('string');
        expect(out).toContain(market.symbol);
        expect(out).toContain('1,245.00');
      }
      const dateStr = formatDate('2026-11-25T08:00:00Z', locale);
      expect(typeof dateStr).toBe('string');
      expect(dateStr.length).toBeGreaterThan(0);
      expect(dateStr).toContain('2026');
    }

    expect(formatMoney(1250, DEFAULT_ETB_CURRENCY, 'en')).toBe('Br 12.50');
    expect(formatMoney(-86500, DEFAULT_ETB_CURRENCY, 'en')).toBe('-Br 865.00');
    expect(fromMinorToDecimal(1250, 2)).toBe('12.50');
  });

  it('computes line_total, subtotal, and total accurately', () => {
    // 2x Sugar (140 ETB) + 1x Cooking oil (690 ETB) = 970.00 ETB (97000 minor)
    const totals = computeCartTotals([
      { unit_price_minor: 14000, quantity: 2 },
      { unit_price_minor: 69000, quantity: 1 },
    ]);
    expect(totals.line_totals_minor).toEqual([28000, 69000]);
    expect(totals.subtotal_minor).toBe(97000);
    expect(totals.delivery_fee_minor).toBe(0);
    expect(totals.total_minor).toBe(97000);
    expect(formatMoney(totals.total_minor, DEFAULT_ETB_CURRENCY, 'en')).toBe('Br 970.00');
  });

  it('validates quantity range 1..999 and non-negative unit prices', () => {
    expect(() => computeLineTotal(1000, 0)).toThrow('INVALID_QUANTITY');
    expect(() => computeLineTotal(1000, 1000)).toThrow('INVALID_QUANTITY');
    expect(() => computeLineTotal(-100, 1)).toThrow('INVALID_UNIT_PRICE');
  });
});
