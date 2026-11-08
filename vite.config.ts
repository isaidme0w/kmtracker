import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const webRoot = resolve(import.meta.dirname, 'web');

// In development, deep links inside the panel (for example /admin/users) must
// load the panel's index.html instead of the client application's.
function adminFallback(): Plugin {
  return {
    name: 'kmtracker-admin-fallback',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? '';
        const path = url.split('?')[0] ?? '';
        if ((path === '/admin' || path.startsWith('/admin/')) && !path.includes('.')) {
          req.url = '/admin/index.html';
        }
        next();
      });
    },
  };
}

export default defineConfig({
  root: webRoot,
  plugins: [react(), tailwindcss(), adminFallback()],
  build: {
    outDir: resolve(import.meta.dirname, 'dist/web'),
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        client: resolve(webRoot, 'index.html'),
        admin: resolve(webRoot, 'admin/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': `http://localhost:${process.env.PORT ?? 3000}`,
    },
  },
});
