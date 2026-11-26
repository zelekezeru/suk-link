import { describe, it, expect } from 'vitest';
import { marketDayKey, isMarketToday } from '../../src/lib/dates';

describe('market-aware days', () => {
  const ADDIS = 'Africa/Addis_Ababa'; // UTC+3

  it('uses the market day, not the UTC day', () => {
    // 22:30 UTC on 25 Nov is 01:30 on 26 Nov in Addis Ababa.
    expect(marketDayKey('2026-11-25T22:30:00Z', ADDIS)).toBe('2026-11-26');
    expect(marketDayKey('2026-11-25T22:30:00Z', 'UTC')).toBe('2026-11-25');
  });

  it('counts an order placed just after local midnight as today', () => {
    const now = new Date('2026-11-26T09:00:00Z'); // 12:00 in Addis
    expect(isMarketToday('2026-11-25T21:05:00Z', ADDIS, now)).toBe(true); // 00:05 local
    expect(isMarketToday('2026-11-25T20:55:00Z', ADDIS, now)).toBe(false); // 23:55 yesterday
  });

  it('never throws on bad input or an unknown zone', () => {
    expect(marketDayKey('not a date', ADDIS)).toBe('');
    expect(isMarketToday(null, ADDIS)).toBe(false);
    expect(marketDayKey('2026-11-25T22:30:00Z', 'Not/AZone')).toBe('2026-11-25');
  });
});
