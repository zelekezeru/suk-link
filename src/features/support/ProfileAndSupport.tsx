import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { LogOut, HelpCircle, Send, Phone, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '../../components/ui/Cards';
import { Input, Textarea, Select } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ImagePicker } from '../../components/ui/FeedbackAndSheets';
import { useSessionStore } from '../auth/useSession';
import { useUiStore, type ThemeMode } from '../../stores/ui';
import { SUPPORTED_LOCALES } from '../../lib/i18n';
import { useMarket } from '../../lib/useMarket';
import { apiUpdateRow, apiUpsertRow } from '../../lib/supabase';
import { getUserDb } from '../../lib/sync/db';
import { pullTableDelta } from '../../lib/sync/pull';
import type { LocaleCode } from '../../lib/database.types';

export function ProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout, updateLocalProfile } = useSessionStore();
  const { theme, setTheme, locale, setLocale } = useUiStore();
  const { market } = useMarket();

  const [fullName, setFullName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [defaultAddress, setDefaultAddress] = useState(user?.default_address || '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatar_url || null);
  const [saving, setSaving] = useState(false);

  const enabledLocales = SUPPORTED_LOCALES.filter((l) =>
    (market.enabled_locales || ['en', 'am', 'om', 'so', 'ti', 'sw']).includes(l.code)
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      await apiUpdateRow('profiles', {
        id: user.id,
        full_name: fullName,
        phone,
        default_address: defaultAddress,
        avatar_url: avatarUrl,
        locale,
      });
      updateLocalProfile({
        full_name: fullName,
        phone,
        default_address: defaultAddress,
        avatar_url: avatarUrl,
        locale,
      });
      toast.success(t('app.save'));
    } catch (err: any) {
      toast.error(err?.message || 'Error');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/welcome', { replace: true });
  };

  return (
    <div className="space-y-6 max-w-xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t('profile.title')}</h1>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleLogout}
          data-testid="logout-button"
        >
          <LogOut className="w-4 h-4" />
          <span>{t('auth.signOut')}</span>
        </Button>
      </div>

      <Card>
        <form onSubmit={handleSave} className="space-y-4">
          <ImagePicker
            label={t('ui.profile.avatar')}
            value={avatarUrl}
            onChange={(url) => setAvatarUrl(url)}
          />
          <Input
            label={t('auth.fullName')}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
          <Input
            label={t('auth.phone')}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Input
            label={t('profile.defaultAddress')}
            value={defaultAddress}
            onChange={(e) => setDefaultAddress(e.target.value)}
            placeholder={t('ui.examples.address')}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label={t('profile.language')}
              value={locale}
              onChange={(e) => setLocale(e.target.value as LocaleCode)}
              options={enabledLocales.map((l) => ({
                value: l.code,
                label: `${l.nativeName} (${l.englishName})`,
              }))}
            />
            <Select
              label={t('profile.theme')}
              value={theme}
              onChange={(e) => setTheme(e.target.value as ThemeMode)}
              options={[
                { value: 'light', label: t('profile.themeLight') },
                { value: 'dark', label: t('profile.themeDark') },
                { value: 'system', label: t('profile.themeSystem') },
              ]}
            />
          </div>

          <Button type="submit" loading={saving} className="w-full">
            {t('app.save')}
          </Button>
        </form>
      </Card>

      <Card className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HelpCircle className="w-5 h-5 text-primary" />
          <div>
            <div className="text-sm font-semibold">{t('support.title')}</div>
            <div className="text-xs text-muted">{t('support.faqTitle')}</div>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate(user?.role === 'shop_owner' ? '/s/support' : '/c/support')}
        >
          {t('ui.common.open')}
        </Button>
      </Card>
    </div>
  );
}

export function SupportPage() {
  const { t } = useTranslation();
  const user = useSessionStore((s) => s.user);
  const db = getUserDb(user?.id || 'guest');

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const tickets =
    useLiveQuery(async () => {
      if (!user) return [];
      const rows = await db.support_tickets.where('user_id').equals(user.id).toArray();
      return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }, [user?.id]) || [];

  const settings =
    useLiveQuery(async () => {
      const rows = await db.app_settings.toArray();
      const map: Record<string, any> = {};
      for (const r of rows) map[r.key] = r.value;
      return map;
    }, [user?.id]) || {};

  const supportPhone = String(settings.support_phone || '+251911223344').replace(/"/g, '');
  const supportTelegram = String(settings.support_telegram || 'https://t.me/suklink_support').replace(/"/g, '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    try {
      await apiUpsertRow('support_tickets', {
        id: crypto.randomUUID(),
        user_id: user.id,
        subject,
        message,
        status: 'open',
      });
      await pullTableDelta(db, 'support_tickets');
      setSubject('');
      setMessage('');
      toast.success(t('ui.support.ticketSubmitted'));
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit ticket');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">{t('support.title')}</h1>

      {/* Quick Call & Telegram Deep Links */}
      <div className="grid grid-cols-2 gap-3">
        <a
          href={`tel:${supportPhone}`}
          className="p-4 rounded-card bg-surface border border-border flex items-center gap-3 hover:border-primary transition-colors"
        >
          <Phone className="w-5 h-5 text-primary" />
          <div>
            <div className="text-sm font-semibold">{t('support.callSupport')}</div>
            <div className="text-xs text-muted">{supportPhone}</div>
          </div>
        </a>
        <a
          href={supportTelegram}
          target="_blank"
          rel="noreferrer"
          className="p-4 rounded-card bg-surface border border-border flex items-center gap-3 hover:border-primary transition-colors"
        >
          <MessageCircle className="w-5 h-5 text-primary" />
          <div>
            <div className="text-sm font-semibold">{t('support.telegramSupport')}</div>
            <div className="text-xs text-muted">@suklink_support</div>
          </div>
        </a>
      </div>

      {/* Static i18n FAQ */}
      <Card className="space-y-3">
        <h2 className="text-base font-bold">{t('support.faqTitle')}</h2>
        <div className="space-y-2 border-t border-border pt-2">
          <div className="text-sm font-semibold">{t('support.faq1Q')}</div>
          <p className="text-xs text-muted">{t('support.faq1A')}</p>
        </div>
        <div className="space-y-2 border-t border-border pt-2">
          <div className="text-sm font-semibold">{t('support.faq2Q')}</div>
          <p className="text-xs text-muted">{t('support.faq2A')}</p>
        </div>
      </Card>

      {/* Contact Form */}
      <Card>
        <h2 className="text-base font-bold mb-3">{t('support.contactUs')}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label={t('support.subject')}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
          <Textarea
            label={t('support.message')}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
          />
          <Button type="submit" loading={submitting}>
            <Send className="w-4 h-4" />
            <span>{t('support.submitTicket')}</span>
          </Button>
        </form>
      </Card>

      {/* My Tickets */}
      <Card className="space-y-3">
        <h2 className="text-base font-bold">{t('support.myTickets')}</h2>
        {tickets.length === 0 ? (
          <p className="text-xs text-muted">{t('ui.support.noTickets')}</p>
        ) : (
          <div className="space-y-2">
            {tickets.map((tk) => (
              <div key={tk.id} className="p-3 rounded-input bg-surface-muted space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{tk.subject}</span>
                  <span className="px-2 py-0.5 rounded-pill text-xs font-semibold bg-primary-tint text-primary">
                    {tk.status}
                  </span>
                </div>
                <p className="text-xs text-muted">{tk.message}</p>
                {tk.admin_reply && (
                  <p className="text-xs text-primary font-medium pt-1">
                    {t('ui.support.adminReply', { reply: tk.admin_reply })}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
