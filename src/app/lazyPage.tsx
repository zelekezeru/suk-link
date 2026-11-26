import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * React.lazy for a named export. Every page in the same module shares one chunk,
 * so a role's screens load together on first visit.
 */
export function lazyPage<M extends Record<string, unknown>>(
  loader: () => Promise<M>,
  name: keyof M & string
) {
  return lazy(async () => {
    const mod = await loader();
    // Pages take differing props, so the shared type is ComponentType<any>.
    return { default: mod[name] as ComponentType<any> };
  });
}

function RouteFallback() {
  const { t } = useTranslation();
  return (
    <div role="status" className="py-12 text-center text-sm text-muted">
      {t('app.loading')}
    </div>
  );
}

export function RouteSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}
