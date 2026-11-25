import type { UserRole, LocaleCode } from './database.types';

export const IS_STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === 'true';

export interface SessionUser {
  id: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  full_name: string;
  locale: LocaleCode;
  market_code: string;
  avatar_url?: string | null;
  default_address?: string | null;
}

const SESSION_STORAGE_KEY = 'suklink_session_user_v1';

export function getStoredSessionUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  try {
    // In static GitHub Pages trial mode, check sessionStorage first so two tabs can
    // stay logged in as different roles (e.g. Customer in Tab 1, Shop Owner in Tab 2).
    const raw = IS_STATIC_DEMO
      ? sessionStorage.getItem(SESSION_STORAGE_KEY) || localStorage.getItem(SESSION_STORAGE_KEY)
      : localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function setStoredSessionUser(user: SessionUser | null): void {
  if (typeof window === 'undefined') return;
  if (!user) {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } else {
    const serialized = JSON.stringify(user);
    if (IS_STATIC_DEMO) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, serialized);
    }
    localStorage.setItem(SESSION_STORAGE_KEY, serialized);
  }
}

async function getBrowserGateway() {
  return await import('./browser-gateway/engine');
}

function getAuthHeaders(): Record<string, string> {
  const user = getStoredSessionUser();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (user) {
    headers['x-user-id'] = user.id;
    headers['x-user-role'] = user.role;
    if (user.email) headers['x-user-email'] = user.email;
  }
  return headers;
}

export async function apiLogin(identifier: string, password: string): Promise<SessionUser> {
  if (IS_STATIC_DEMO) {
    const gw = await getBrowserGateway();
    return gw.browserLogin(identifier, password);
  }
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'INVALID_CREDENTIALS');
  }
  return json.user as SessionUser;
}

export async function apiRegister(input: {
  full_name: string;
  email: string;
  phone: string;
  password: string;
  role: 'customer' | 'shop_owner';
  market_code: string;
  locale: LocaleCode;
}): Promise<SessionUser> {
  if (IS_STATIC_DEMO) {
    const gw = await getBrowserGateway();
    return gw.browserRegister(input);
  }
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'REGISTRATION_FAILED');
  }
  return json.user as SessionUser;
}

export async function apiFetchTable<T = any>(
  table: string,
  since?: string,
  explicitUser?: SessionUser | null
): Promise<T[]> {
  const user = explicitUser !== undefined ? explicitUser : getStoredSessionUser();
  // Guest (unauthenticated) callers can only read public configuration tables
  const publicTables = ['markets', 'payment_methods', 'plans', 'app_settings'];
  if (!user && !publicTables.includes(table)) {
    return [];
  }
  if (IS_STATIC_DEMO) {
    const gw = await getBrowserGateway();
    return gw.browserFetchTable<T>(table, since, user);
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (user) {
    headers['x-user-id'] = user.id;
    headers['x-user-role'] = user.role;
    if (user.email) headers['x-user-email'] = user.email;
  }
  const qs = since ? `?since=${encodeURIComponent(since)}` : '';
  const res = await fetch(`/api/db/${table}${qs}`, {
    method: 'GET',
    headers,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || `FETCH_${table.toUpperCase()}_FAILED`);
  }
  return (json.data || []) as T[];
}

export async function apiUpsertRow<T = any>(
  table: string,
  row: Record<string, any>
): Promise<T> {
  if (IS_STATIC_DEMO) {
    const gw = await getBrowserGateway();
    return gw.browserUpsertRow<T>(table, row, getStoredSessionUser());
  }
  const res = await fetch(`/api/db/${table}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(row),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || `UPSERT_${table.toUpperCase()}_FAILED`);
  }
  return json.data as T;
}

export async function apiUpdateRow<T = any>(
  table: string,
  patch: Record<string, any>,
  matchCol = 'id'
): Promise<T> {
  if (IS_STATIC_DEMO) {
    const gw = await getBrowserGateway();
    return gw.browserUpdateRow<T>(table, patch, matchCol, getStoredSessionUser());
  }
  const res = await fetch(`/api/db/${table}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ ...patch, _matchCol: matchCol }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || `UPDATE_${table.toUpperCase()}_FAILED`);
  }
  return json.data as T;
}

export async function apiCallRpc<T = any>(
  fnName: string,
  args: Record<string, any> = {}
): Promise<T> {
  if (IS_STATIC_DEMO) {
    const gw = await getBrowserGateway();
    return gw.browserCallRpc<T>(fnName, args, getStoredSessionUser());
  }
  const res = await fetch(`/api/rpc/${fnName}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(args),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || `RPC_${fnName.toUpperCase()}_FAILED`);
  }
  return json.data as T;
}

export async function apiInitPayment(input: {
  purpose: 'order' | 'subscription';
  order_id?: string | null;
  subscription_id?: string | null;
  shop_id: string;
  method_code: string;
  idempotency_key: string;
}): Promise<{ payment: any; checkoutUrl: string }> {
  if (IS_STATIC_DEMO) {
    const gw = await getBrowserGateway();
    return gw.browserInitPayment(input, getStoredSessionUser());
  }
  const res = await fetch('/api/functions/payments-init', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'PAYMENT_INIT_FAILED');
  }
  return json;
}

export async function apiConfirmDemoPayment(
  paymentId: string,
  decision: 'approve' | 'decline'
): Promise<any> {
  if (IS_STATIC_DEMO) {
    const gw = await getBrowserGateway();
    return gw.browserConfirmDemoPayment(paymentId, decision);
  }
  const res = await fetch('/api/functions/payments-demo-confirm', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ payment_id: paymentId, decision }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'PAYMENT_CONFIRM_FAILED');
  }
  return json.payment;
}

export async function apiFetchAdminStats(): Promise<any> {
  if (IS_STATIC_DEMO) {
    const gw = await getBrowserGateway();
    return gw.browserFetchAdminStats(getStoredSessionUser());
  }
  const res = await fetch('/api/functions/admin-stats', {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'ADMIN_STATS_FAILED');
  }
  return json;
}
