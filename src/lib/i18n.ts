import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../i18n/en.json';
import am from '../i18n/am.json';
import om from '../i18n/om.json';
import so from '../i18n/so.json';
import ti from '../i18n/ti.json';
import sw from '../i18n/sw.json';
import type { LocaleCode } from './database.types';

export const SUPPORTED_LOCALES: {
  code: LocaleCode;
  nativeName: string;
  englishName: string;
  script: 'Latin' | 'Geez';
}[] = [
  { code: 'en', nativeName: 'English', englishName: 'English', script: 'Latin' },
  { code: 'am', nativeName: 'አማርኛ', englishName: 'Amharic', script: 'Geez' },
  { code: 'om', nativeName: 'Afaan Oromoo', englishName: 'Oromo', script: 'Latin' },
  { code: 'so', nativeName: 'Soomaali', englishName: 'Somali', script: 'Latin' },
  { code: 'ti', nativeName: 'ትግርኛ', englishName: 'Tigrinya', script: 'Geez' },
  { code: 'sw', nativeName: 'Kiswahili', englishName: 'Swahili', script: 'Latin' },
];

const savedLocale =
  (typeof window !== 'undefined' && (localStorage.getItem('suklink_locale') as LocaleCode)) || 'en';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    am: { translation: am },
    om: { translation: om },
    so: { translation: so },
    ti: { translation: ti },
    sw: { translation: sw },
  },
  lng: savedLocale,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export function changeAppLanguage(locale: LocaleCode) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('suklink_locale', locale);
    document.documentElement.lang = locale;
  }
  return i18n.changeLanguage(locale);
}

export function translateJsonb(
  nameI18n: Record<string, string> | null | undefined,
  locale: string,
  fallback = ''
): string {
  if (!nameI18n) return fallback;
  return nameI18n[locale] || nameI18n.en || Object.values(nameI18n)[0] || fallback;
}

export default i18n;
