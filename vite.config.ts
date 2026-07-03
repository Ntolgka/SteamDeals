import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { gamesApiPlugin } from './server/gamesApi';

/**
 * The Steam Store API does not send CORS headers, so the browser cannot call
 * it directly. Requests to /steam-api/* are proxied through the Vite server
 * to store.steampowered.com (works in both `dev` and `preview`).
 */
const steamProxy = {
  '/steam-api': {
    target: 'https://store.steampowered.com',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/steam-api/, ''),
  },
};

export default defineConfig({
  plugins: [react(), gamesApiPlugin()],
  server: {
    port: 5173,
    proxy: steamProxy,
  },
  preview: {
    port: 4173,
    proxy: steamProxy,
  },
});
