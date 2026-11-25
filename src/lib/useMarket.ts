import { useEffect, useState } from 'react';
import { getUserDb } from './sync/db';
import { getStoredSessionUser } from './supabase';
import { useUiStore } from '../stores/ui';
import type { MarketRow } from './database.types';
import type { CurrencyConfig } from './money';

export const FALLBACK_ET_MARKET: MarketRow = {
  code: 'ET',
  name_i18n: {
    en: 'Ethiopia',
    am: 'ኢትዮጵያ',
    om: 'Itoophiyaa',
    so: 'Itoobiya',
    ti: 'ኢትዮጵያ',
    sw: 'Ethiopia',
  },
  currency_code: 'ETB',
  currency_symbol: 'Br',
  minor_unit_digits: 2,
  phone_country_code: '+251',
  phone_regex: '^\\+251[79]\\d{8}$',
  timezone: 'Africa/Addis_Ababa',
  default_locale: 'en',
  enabled_locales: ['en', 'am', 'om', 'so', 'ti', 'sw'],
  is_active: true,
  is_default: true,
  created_at: '',
  updated_at: '',
};

export function useMarket(explicitMarketCode?: string): {
  market: MarketRow;
  activeMarkets: MarketRow[];
  currency: CurrencyConfig;
} {
  const user = getStoredSessionUser();
  const uiMarketCode = useUiStore((s) => s.marketCode);
  const [markets, setMarkets] = useState<MarketRow[]>([FALLBACK_ET_MARKET]);

  useEffect(() => {
    let active = true;
    const db = getUserDb(user?.id || 'guest');
    db.markets
      .toArray()
      .then((all) => {
        if (active && all.length > 0) setMarkets(all);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user?.id, explicitMarketCode, uiMarketCode]);

  const activeMarkets = markets.filter((m) => m.is_active);
  const targetCode = explicitMarketCode || user?.market_code || uiMarketCode || 'ET';
  const market =
    markets.find((m) => m.code === targetCode) ||
    markets.find((m) => m.is_default) ||
    FALLBACK_ET_MARKET;

  const currency: CurrencyConfig = {
    currency: market.currency_code,
    symbol: market.currency_symbol,
    digits: market.minor_unit_digits,
  };

  return { market, activeMarkets, currency };
}
