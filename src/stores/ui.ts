import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LocaleCode } from '../lib/database.types';
import { changeAppLanguage } from '../lib/i18n';

export type ThemeMode = 'system' | 'light' | 'dark';

interface UiStoreState {
  theme: ThemeMode;
  locale: LocaleCode;
  marketCode: string;
  isOnline: boolean;
  isSyncing: boolean;
  pendingOutboxCount: number;
  failedOutboxCount: number;
  soundUnlocked: boolean;
  setTheme: (theme: ThemeMode) => void;
  setLocale: (locale: LocaleCode) => void;
  setMarketCode: (marketCode: string) => void;
  setOnlineStatus: (isOnline: boolean) => void;
  setSyncStats: (stats: {
    isSyncing?: boolean;
    pendingOutboxCount?: number;
    failedOutboxCount?: number;
  }) => void;
  unlockSound: () => void;
}

export function applyThemeToDom(theme: ThemeMode) {
  if (typeof document === 'undefined') return;
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', isDark);
}

export const useUiStore = create<UiStoreState>()(
  persist(
    (set) => ({
      theme: 'light',
      locale: 'en',
      marketCode: 'ET',
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      isSyncing: false,
      pendingOutboxCount: 0,
      failedOutboxCount: 0,
      soundUnlocked: false,

      setTheme: (theme) => {
        applyThemeToDom(theme);
        set({ theme });
      },

      setLocale: (locale) => {
        changeAppLanguage(locale);
        set({ locale });
      },

      setMarketCode: (marketCode) => set({ marketCode }),

      setOnlineStatus: (isOnline) => set({ isOnline }),

      setSyncStats: (stats) =>
        set((state) => ({
          isSyncing: stats.isSyncing ?? state.isSyncing,
          pendingOutboxCount: stats.pendingOutboxCount ?? state.pendingOutboxCount,
          failedOutboxCount: stats.failedOutboxCount ?? state.failedOutboxCount,
        })),

      unlockSound: () => set({ soundUnlocked: true }),
    }),
    {
      name: 'suklink_ui_v1',
      partialize: (state) => ({
        theme: state.theme,
        locale: state.locale,
        marketCode: state.marketCode,
      }),
    }
  )
);
