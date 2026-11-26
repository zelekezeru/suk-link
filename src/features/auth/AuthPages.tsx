import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShoppingBag, Store, Globe, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Cards';
import { SUPPORTED_LOCALES, translateJsonb } from '../../lib/i18n';
import { useUiStore } from '../../stores/ui';
import { useMarket } from '../../lib/useMarket';
import { useSessionStore } from './useSession';
import { getHomeRouteForRole } from '../../app/guards';
import { IS_STATIC_DEMO } from '../../lib/supabase';
import type { LocaleCode } from '../../lib/database.types';

export function WelcomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { locale, setLocale, marketCode, setMarketCode } = useUiStore();
  const { market, activeMarkets } = useMarket(marketCode);

  const enabledLocales = SUPPORTED_LOCALES.filter((l) =>
    (market.enabled_locales || ['en', 'am', 'om', 'so', 'ti', 'sw']).includes(l.code)
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between p-6 max-w-lg mx-auto">
      {/* Top Language & Optional Market Picker (Section 4 A) */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            <Globe className="w-4 h-4 text-primary" />
            <span>{t('welcome.chooseLanguage')}</span>
          </div>

          {activeMarkets.length > 1 && (
            <select
              aria-label={t('welcome.chooseMarket')}
              data-testid="market-selector"
              value={market.code}
              onChange={(e) => setMarketCode(e.target.value)}
              className="px-2.5 py-1 rounded-pill bg-surface border border-border text-xs font-semibold"
            >
              {activeMarkets.map((m) => (
                <option key={m.code} value={m.code}>
                  {translateJsonb(m.name_i18n, locale, m.code)} ({m.currency_code})
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('ui.auth.languageOptions')}>
          {enabledLocales.map((loc) => (
            <button
              key={loc.code}
              type="button"
              onClick={() => setLocale(loc.code)}
              data-testid={`lang-${loc.code}`}
              className={`min-h-[36px] px-3 py-1 rounded-pill text-xs font-semibold border transition-colors ${
                locale === loc.code
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-surface text-foreground border-border hover:bg-surface-muted'
              }`}
            >
              {loc.nativeName}
            </button>
          ))}
        </div>
      </div>

      {/* Hero & Two Primary Choices */}
      <div className="space-y-6 my-8">
        <div className="space-y-3">
          <div className="w-14 h-14 rounded-card bg-primary text-primary-foreground font-bold text-2xl flex items-center justify-center shadow-soft2">
            SL
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            {t('welcome.title')}
          </h1>
          <p className="text-base text-muted leading-relaxed">{t('welcome.subtitle')}</p>
        </div>

        <div className="space-y-3">
          <Card
            role="button"
            tabIndex={0}
            data-testid="welcome-choice-customer"
            onClick={() => navigate('/register?role=customer')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') navigate('/register?role=customer');
            }}
            className="p-5 flex items-center gap-4 cursor-pointer hover:border-primary hover:shadow-soft2 transition-all"
          >
            <div className="w-12 h-12 rounded-card bg-primary-tint text-primary flex items-center justify-center shrink-0">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <div className="text-lg font-bold text-foreground">{t('welcome.iWantToShop')}</div>
              <div className="text-xs text-muted mt-0.5">{t('welcome.iWantToShopDesc')}</div>
            </div>
          </Card>

          <Card
            role="button"
            tabIndex={0}
            data-testid="welcome-choice-shop"
            onClick={() => navigate('/register?role=shop_owner')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') navigate('/register?role=shop_owner');
            }}
            className="p-5 flex items-center gap-4 cursor-pointer hover:border-primary hover:shadow-soft2 transition-all"
          >
            <div className="w-12 h-12 rounded-card bg-accent-tint text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <div className="text-lg font-bold text-foreground">{t('welcome.iOwnAShop')}</div>
              <div className="text-xs text-muted mt-0.5">{t('welcome.iOwnAShopDesc')}</div>
            </div>
          </Card>
        </div>
      </div>

      {/* Footer Login CTA */}
      <div className="space-y-3 pb-4">
        <div className="text-center text-xs text-muted">{t('welcome.alreadyHaveAccount')}</div>
        <Button
          variant="secondary"
          size="lg"
          className="w-full"
          data-testid="welcome-login-btn"
          onClick={() => navigate('/login')}
        >
          {t('welcome.logIn')}
        </Button>

        {/* Static-demo presenter panel: English-only by design. */}
        {/* eslint-disable no-restricted-syntax */}
        {IS_STATIC_DEMO && (
          <div className="pt-2">
            <Card className="p-3.5 bg-surface-muted/70 space-y-2 border-primary/25">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  Interactive Trial Simulation
                </span>
                <span className="text-[11px] font-mono text-muted">Password: Demo@2026</span>
              </div>
              <p className="text-xs text-muted">
                Seeded with all 3 roles (Customer, Shop Owner, Admin), 2 shops, 16 products, 23
                orders, credit ledger (Br 865), notifications &amp; support tickets.
              </p>
              <Button
                variant="primary"
                size="sm"
                className="w-full"
                data-testid="welcome-demo-accounts-btn"
                onClick={() => navigate('/login')}
              >
                Explore Seeded Accounts (1-Click Login)
              </Button>
            </Card>
          </div>
        )}
        {/* eslint-enable no-restricted-syntax */}
      </div>
    </div>
  );
}

export function LoginPage() {
  const { t } = useTranslation();
  const marketCode = useUiStore((s) => s.marketCode);
  const { market } = useMarket(marketCode);
  const navigate = useNavigate();
  const login = useSessionStore((s) => s.login);
  const loading = useSessionStore((s) => s.loading);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const user = await login(identifier, password);
      navigate(getHomeRouteForRole(user.role), { replace: true });
    } catch {
      setError(t('auth.invalidCredentials'));
    }
  };

  const quickLogin = async (email: string) => {
    setIdentifier(email);
    setPassword('Demo@2026');
    setError('');
    try {
      const user = await login(email, 'Demo@2026');
      navigate(getHomeRouteForRole(user.role), { replace: true });
    } catch {
      setError(t('auth.invalidCredentials'));
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-center p-6 max-w-md mx-auto space-y-6">
      <div>
        <Link
          to="/welcome"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('app.back')}</span>
        </Link>
        <h1 className="text-2xl font-bold text-foreground">{t('auth.loginTitle')}</h1>
        <p className="text-sm text-muted mt-1">{t('auth.loginSubtitle')}</p>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label={t('auth.emailOrPhone')}
            data-testid="login-identifier"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder={t('ui.auth.identifierPlaceholder', { code: market.phone_country_code })}
            required
          />

          <div className="relative">
            <Input
              label={t('auth.password')}
              data-testid="login-password"
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-9 text-xs font-medium text-muted hover:text-foreground inline-flex items-center gap-1"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span>{showPw ? t('auth.hidePassword') : t('auth.showPassword')}</span>
            </button>
          </div>

          {error && (
            <p role="alert" className="text-xs font-semibold text-danger">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between text-xs">
            <label className="inline-flex items-center gap-2 text-muted cursor-pointer">
              <input type="checkbox" defaultChecked className="rounded border-border text-primary" />
              <span>{t('auth.rememberMe')}</span>
            </label>
            <Link to="/forgot-password" className="text-primary font-medium hover:underline">
              {t('auth.forgotPassword')}
            </Link>
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            loading={loading}
            data-testid="login-submit"
          >
            {t('auth.signIn')}
          </Button>
        </form>
      </Card>

      {/* Quick Demo Account buttons for smooth testing & presentation (English-only presenter aid) */}
      {/* eslint-disable no-restricted-syntax */}
      <Card className="space-y-2.5 bg-surface-muted/60">
        <div className="text-xs font-bold text-muted uppercase tracking-wider">
          {t('auth.demoAccountsTitle')}
        </div>
        <div className="grid grid-cols-1 gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="quick-login-customer"
            onClick={() => quickLogin('customer@demo.suklink.et')}
          >
            Customer: Selam (customer@demo.suklink.et)
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="quick-login-customer2"
            onClick={() => quickLogin('customer2@demo.suklink.et')}
          >
            Customer 2: Dawit (Credit Br 865)
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="quick-login-shop"
            onClick={() => quickLogin('shop@demo.suklink.et')}
          >
            Shop Owner: Abebe Mini Market (Active Plan)
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="quick-login-shop2"
            onClick={() => quickLogin('shop2@demo.suklink.et')}
          >
            Shop Owner 2: Tsehay Bakery (Free Trial — 5d left)
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="quick-login-admin"
            onClick={() => quickLogin('admin@demo.suklink.et')}
          >
            Admin: Kaleb (admin@demo.suklink.et)
          </Button>
        </div>
      </Card>
      {/* eslint-enable no-restricted-syntax */}
    </div>
  );
}

export function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialRole =
    searchParams.get('role') === 'shop_owner' ? 'shop_owner' : 'customer';

  const register = useSessionStore((s) => s.register);
  const loading = useSessionStore((s) => s.loading);
  const { locale, marketCode } = useUiStore();
  const { market } = useMarket(marketCode);

  const [role, setRole] = useState<'customer' | 'shop_owner'>(initialRole);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState(market.phone_country_code + '9');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');

  const pwStrength =
    password.length < 8
      ? t('auth.passwordStrengthWeak')
      : password.length >= 12 && /[A-Z]/.test(password) && /\d/.test(password)
        ? t('auth.passwordStrengthStrong')
        : t('auth.passwordStrengthGood');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError(t('auth.passwordStrengthWeak'));
      return;
    }
    try {
      const user = await register({
        full_name: fullName,
        email,
        phone,
        password,
        role,
        market_code: market.code,
        locale: locale as LocaleCode,
      });
      if (user.role === 'shop_owner') {
        navigate('/s/setup', { replace: true });
      } else {
        navigate('/c/home', { replace: true });
      }
    } catch (err: any) {
      setError(err?.message || 'Registration failed');
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-center p-6 max-w-md mx-auto space-y-6">
      <div>
        <Link
          to="/welcome"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('app.back')}</span>
        </Link>
        <h1 className="text-2xl font-bold text-foreground">
          {role === 'shop_owner'
            ? t('auth.registerShopTitle')
            : t('auth.registerCustomerTitle')}
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-2 p-1 rounded-input bg-surface-muted border border-border">
        <button
          type="button"
          onClick={() => setRole('customer')}
          className={`min-h-[38px] rounded-input text-xs font-semibold transition-colors ${
            role === 'customer' ? 'bg-primary text-primary-foreground' : 'text-muted'
          }`}
        >
          {t('welcome.iWantToShop')}
        </button>
        <button
          type="button"
          onClick={() => setRole('shop_owner')}
          className={`min-h-[38px] rounded-input text-xs font-semibold transition-colors ${
            role === 'shop_owner' ? 'bg-primary text-primary-foreground' : 'text-muted'
          }`}
        >
          {t('welcome.iOwnAShop')}
        </button>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label={t('auth.fullName')}
            data-testid="register-fullname"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={t('ui.examples.fullName')}
            required
          />

          <Input
            label={`${t('auth.phone')} (${market.phone_country_code})`}
            data-testid="register-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={`${market.phone_country_code}911234567`}
            required
          />

          <Input
            label={t('auth.email')}
            data-testid="register-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            required
          />

          <div className="relative">
            <Input
              label={t('auth.password')}
              data-testid="register-password"
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              hint={pwStrength}
              required
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-9 text-xs font-medium text-muted hover:text-foreground"
            >
              {showPw ? t('auth.hidePassword') : t('auth.showPassword')}
            </button>
          </div>

          {error && (
            <p role="alert" className="text-xs font-semibold text-danger">
              {error}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            loading={loading}
            data-testid="register-submit"
          >
            {t('auth.createAccount')}
          </Button>
        </form>
      </Card>
    </div>
  );
}

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
    toast.success(t('auth.resetPasswordSent'));
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-center p-6 max-w-md mx-auto space-y-6">
      <div>
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('app.back')}</span>
        </Link>
        <h1 className="text-2xl font-bold text-foreground">{t('auth.resetPasswordTitle')}</h1>
      </div>

      <Card>
        {sent ? (
          <div className="space-y-4 text-center py-4">
            <p className="text-sm text-foreground">{t('auth.resetPasswordSent')}</p>
            <Link to="/login">
              <Button variant="primary" className="w-full">
                {t('auth.signIn')}
              </Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={t('auth.email')}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
            />
            <Button type="submit" className="w-full">
              {t('auth.sendResetLink')}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
