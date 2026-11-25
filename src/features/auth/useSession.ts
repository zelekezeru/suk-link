import { create } from 'zustand';
import {
  getStoredSessionUser,
  setStoredSessionUser,
  apiLogin,
  apiRegister,
  type SessionUser,
} from '../../lib/supabase';
import { wipeUserDb } from '../../lib/sync/db';
import { runSyncCycle } from '../../lib/sync/engine';
import { useCartStore } from '../../stores/cart';
import { useUiStore } from '../../stores/ui';
import type { LocaleCode } from '../../lib/database.types';

interface SessionStore {
  user: SessionUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<SessionUser>;
  register: (input: {
    full_name: string;
    email: string;
    phone: string;
    password: string;
    role: 'customer' | 'shop_owner';
    market_code: string;
    locale: LocaleCode;
  }) => Promise<SessionUser>;
  logout: () => Promise<void>;
  updateLocalProfile: (patch: Partial<SessionUser>) => void;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  user: getStoredSessionUser(),
  loading: false,

  login: async (identifier, password) => {
    set({ loading: true });
    try {
      const prevUser = get().user;
      if (prevUser) {
        await wipeUserDb(prevUser.id);
      }
      const user = await apiLogin(identifier, password);
      setStoredSessionUser(user);
      set({ user, loading: false });
      useUiStore.getState().setMarketCode(user.market_code || 'ET');
      if (user.locale) {
        useUiStore.getState().setLocale(user.locale);
      }
      await runSyncCycle(true);
      return user;
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  register: async (input) => {
    set({ loading: true });
    try {
      const prevUser = get().user;
      if (prevUser) {
        await wipeUserDb(prevUser.id);
      }
      const user = await apiRegister(input);
      setStoredSessionUser(user);
      set({ user, loading: false });
      useUiStore.getState().setMarketCode(user.market_code || 'ET');
      void runSyncCycle(true);
      return user;
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  logout: async () => {
    const currentUser = get().user;
    // Clear session first, then wipe user's Dexie DB and carts (Section 4 A & Section 10)
    setStoredSessionUser(null);
    set({ user: null });
    useCartStore.getState().clearAllCarts();
    if (currentUser) {
      await wipeUserDb(currentUser.id);
    }
  },

  updateLocalProfile: (patch) => {
    const current = get().user;
    if (!current) return;
    const updated = { ...current, ...patch };
    setStoredSessionUser(updated);
    set({ user: updated });
  },
}));
