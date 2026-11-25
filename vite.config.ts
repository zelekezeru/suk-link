import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

const basePath = process.env.VITE_BASE_PATH || '/';
const isStaticDemo = process.env.VITE_STATIC_DEMO === 'true';

const localGatewayPlugin = {
  name: 'suklink-local-postgres-gateway',
  async configureServer(server: any) {
    const { handleApiRequest, getGatewayDb } = await import('./scripts/local-gateway');
    await getGatewayDb();
    server.middlewares.use(async (req: any, res: any, next: any) => {
      const handled = await handleApiRequest(req, res);
      if (!handled) next();
    });
  },
  async configurePreviewServer(server: any) {
    const { handleApiRequest, getGatewayDb } = await import('./scripts/local-gateway');
    await getGatewayDb();
    server.middlewares.use(async (req: any, res: any, next: any) => {
      const handled = await handleApiRequest(req, res);
      if (!handled) next();
    });
  },
};

export default defineConfig({
  base: basePath,
  optimizeDeps: {
    exclude: ['@electric-sql/pglite'],
  },
  worker: {
    format: 'es',
  },
  plugins: [
    react(),
    ...(!isStaticDemo ? [localGatewayPlugin] : []),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'Suk Link — Neighborhood Shop Ordering & Ledger',
        short_name: 'Suk Link',
        description: 'Order from nearby shops and manage sales, payments, and customer credit.',
        theme_color: '#0E7C66',
        background_color: '#0B1412',
        display: 'standalone',
        start_url: './',
        icons: [
          { src: 'icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
          { src: 'icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: { enabled: false, type: 'module' },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    hookTimeout: 90000,
    testTimeout: 60000,
  },
});
