import { describe, it, expect } from 'vitest';
import en from '../../src/i18n/en.json';
import am from '../../src/i18n/am.json';
import om from '../../src/i18n/om.json';
import so from '../../src/i18n/so.json';
import ti from '../../src/i18n/ti.json';
import sw from '../../src/i18n/sw.json';

function flattenKeys(obj: Record<string, any>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(result, flattenKeys(v, fullKey));
    } else {
      result[fullKey] = String(v);
    }
  }
  return result;
}

function extractPlaceholders(str: string): string[] {
  const matches = str.match(/\{\{[^}]+\}\}/g) || [];
  return [...matches].sort();
}

describe('i18n key and interpolation placeholder parity across all 6 locales (Section 8.1 & 13)', () => {
  const enFlat = flattenKeys(en);
  const enKeys = Object.keys(enFlat).sort();

  const locales: Record<string, Record<string, any>> = {
    am,
    om,
    so,
    ti,
    sw,
  };

  for (const [code, data] of Object.entries(locales)) {
    it(`has 100% key and {{placeholder}} parity in ${code}.json`, () => {
      const targetFlat = flattenKeys(data);
      const targetKeys = Object.keys(targetFlat).sort();

      expect(targetKeys).toEqual(enKeys);

      for (const key of enKeys) {
        const expectedPlaceholders = extractPlaceholders(enFlat[key]);
        const actualPlaceholders = extractPlaceholders(targetFlat[key]);
        expect(
          actualPlaceholders,
          `Placeholder mismatch for key "${key}" in locale "${code}"`
        ).toEqual(expectedPlaceholders);
        expect(targetFlat[key].trim().length).toBeGreaterThan(0);
      }
    });
  }
});
