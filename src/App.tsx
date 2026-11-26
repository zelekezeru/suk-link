import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import './lib/i18n';
import { appRouter } from './app/router';
import { startSyncEngine, runSyncCycle } from './lib/sync/engine';
import { initNativeLifecycle } from './lib/native';
import { applyThemeToDom, useUiStore } from './stores/ui';
import { IS_STATIC_DEMO } from './lib/supabase';
import { TestPaymentsRibbon } from './components/ui/FeedbackAndSheets';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15000,
      retry: 1,
    },
  },
});

export function App() {
  const theme = useUiStore((s) => s.theme);
  const [demoReady, setDemoReady] = useState(!IS_STATIC_DEMO);
  const [demoError, setDemoError] = useState<string | null>(null);

  useEffect(() => {
    applyThemeToDom(theme);
  }, [theme]);

  useEffect(() => {
    if (!IS_STATIC_DEMO) return;
    let cancelled = false;
    void import('./lib/browser-gateway/engine')
      .then(({ getBrowserDb }) => getBrowserDb())
      .then(() => {
        if (!cancelled) setDemoReady(true);
      })
      .catch((err: any) => {
        if (!cancelled) setDemoError(err?.message || 'Failed to initialize trial database');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!demoReady) return;
    const stopSync = startSyncEngine();
    initNativeLifecycle(
      () => {
        void runSyncCycle(false);
      },
      (url) => {
        if (url.startsWith('suklink://pay/return')) {
          void runSyncCycle(true);
        }
      }
    );
    return stopSync;
  }, [demoReady]);

  // Static-demo boot screen: shown before i18n and the seeded database are ready.
  /* eslint-disable no-restricted-syntax */
  if (!demoReady) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-card bg-primary text-primary-foreground font-bold text-2xl flex items-center justify-center shadow-soft2 animate-pulse">
            SL
          </div>
          <div className="space-y-1.5">
            <h1 className="text-xl font-bold text-foreground">Starting Suk Link Live Trial</h1>
            <p className="text-sm text-muted">
              {demoError
                ? demoError
                : 'Booting in-browser PostgreSQL & seeding roles, shops, products, orders, and credit ledger…'}
            </p>
          </div>
          {demoError ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-pill bg-primary text-primary-foreground text-sm font-semibold"
            >
              Retry
            </button>
          ) : (
            <div className="w-48 h-1.5 mx-auto rounded-pill bg-surface-muted overflow-hidden">
              <div className="h-full w-1/2 bg-primary rounded-pill animate-pulse" />
            </div>
          )}
        </div>
      </div>
    );
  }
  /* eslint-enable no-restricted-syntax */

  return (
    <QueryClientProvider client={queryClient}>
      <TestPaymentsRibbon />
      <RouterProvider router={appRouter} />
      <Toaster position="top-center" richColors closeButton />
    </QueryClientProvider>
  );
}
