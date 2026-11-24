/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare let self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();

precacheAndRoute(self.__WB_MANIFEST);

// Cache product & shop images (CacheFirst, 30 days, max 300 entries)
// Never cache authenticated API responses.
registerRoute(
  ({ request, url }) =>
    request.destination === 'image' ||
    url.pathname.includes('/storage/v1/object/public/') ||
    url.pathname.startsWith('/seed-images/'),
  new CacheFirst({
    cacheName: 'suklink-images-v1',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 300,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      }),
    ],
  })
);

self.addEventListener('sync', (event: any) => {
  if (event.tag === 'suklink-outbox-sync') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: 'TRIGGER_OUTBOX_SYNC' });
        }
      })
    );
  }
});
