import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { SplashScreen } from '@capacitor/splash-screen';
import { App as CapApp } from '@capacitor/app';
import { Network } from '@capacitor/network';

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export async function triggerHapticImpact(style: ImpactStyle = ImpactStyle.Light): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    await Haptics.impact({ style });
  } catch {
    // ignore on unsupported devices
  }
}

export async function scheduleLocalOrderNotification(title: string, body: string): Promise<void> {
  try {
    if (isNativePlatform()) {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Date.now() % 100000),
            title,
            body,
            schedule: { at: new Date(Date.now() + 250) },
          },
        ],
      });
    } else if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted' &&
      document.visibilityState === 'hidden'
    ) {
      new Notification(title, { body });
    }
  } catch {
    // ignore notification errors
  }
}

/**
 * Plays a pleasant notification chime using Web Audio API (no external audio asset required).
 */
export function playOrderNotificationSound(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.38);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // Browser autoplay policy may block until user interacts
  }
}

export function initNativeLifecycle(onResumeOrOnline: () => void, onDeepLink?: (url: string) => void) {
  if (!isNativePlatform()) return;

  void SplashScreen.hide().catch(() => {});

  void CapApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      onResumeOrOnline();
    }
  });

  void CapApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      void CapApp.exitApp();
    }
  });

  void CapApp.addListener('appUrlOpen', ({ url }) => {
    if (onDeepLink) onDeepLink(url);
  });

  void Network.addListener('networkStatusChange', (status) => {
    if (status.connected) {
      onResumeOrOnline();
    }
  });
}
