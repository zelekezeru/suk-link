import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bell, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { getUserDb } from '../../lib/sync/db';
import { subscribeRealtimeEvents } from '../../lib/sync/engine';
import { apiCallRpc } from '../../lib/supabase';
import { useSessionStore } from '../auth/useSession';
import {
  playOrderNotificationSound,
  scheduleLocalOrderNotification,
  triggerHapticImpact,
} from '../../lib/native';
import { BottomSheet } from '../../components/ui/FeedbackAndSheets';
import { Button } from '../../components/ui/Button';

export function useRealtimeNotifications() {
  const user = useSessionStore((s) => s.user);
  const db = getUserDb(user?.id || 'guest');

  const notifications =
    useLiveQuery(async () => {
      if (!user) return [];
      const rows = await db.notifications.where('user_id').equals(user.id).toArray();
      return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }, [user?.id]) || [];

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeRealtimeEvents((evt) => {
      if (evt.table === 'orders' && evt.eventType === 'INSERT' && user.role === 'shop_owner') {
        const ord = evt.record;
        const title = `New Order ${ord?.order_number || ''}`;
        toast.success(title, {
          description: 'Tap Orders to review and accept.',
        });
        playOrderNotificationSound();
        void triggerHapticImpact();
        void scheduleLocalOrderNotification(title, 'A customer just placed an order.');
      } else if (evt.table === 'orders' && evt.eventType === 'UPDATE' && user.role === 'customer') {
        const ord = evt.record;
        if (ord && ord.customer_id === user.id) {
          toast.info(`Order ${ord.order_number}: ${ord.status}`);
        }
      }
    });
    return unsubscribe;
  }, [user]);

  const markAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;
    const nowIso = new Date().toISOString();
    for (const id of unreadIds) {
      await db.notifications.update(id, { read_at: nowIso });
    }
    try {
      await apiCallRpc('mark_notifications_read', { p_ids: unreadIds });
    } catch {
      // ignore if offline
    }
  };

  return { notifications, unreadCount, markAllRead };
}

export function NotificationBell() {
  const { notifications, unreadCount, markAllRead } = useRealtimeNotifications();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Notifications"
        data-testid="notification-bell"
        className="relative w-10 h-10 rounded-pill inline-flex items-center justify-center text-foreground hover:bg-surface-muted transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span
            data-testid="notification-unread-badge"
            className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-pill bg-danger text-white text-[11px] font-bold flex items-center justify-center"
          >
            {unreadCount}
          </span>
        )}
      </button>

      <BottomSheet open={open} onOpenChange={setOpen} title="Notifications">
        <div className="space-y-3">
          {unreadCount > 0 && (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={markAllRead}>
                <CheckCheck className="w-4 h-4" />
                <span>Mark all read</span>
              </Button>
            </div>
          )}

          {notifications.length === 0 ? (
            <p className="text-sm text-muted py-6 text-center">No notifications yet.</p>
          ) : (
            <div className="space-y-2">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-3 rounded-card border ${
                    n.read_at
                      ? 'bg-surface border-border opacity-75'
                      : 'bg-primary-tint/50 border-primary/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{n.title}</span>
                    <span className="text-[11px] text-subtle">
                      {new Date(n.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-muted mt-1">{n.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
