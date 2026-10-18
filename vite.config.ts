import { defineConfig } from 'vite';
import { resolve } from 'path';

// Lokale Vorschau (npm run dev, Gerald 18.10.2026): Die Seiten binden ihre
// Programme als "../src/client/…" ein. Beim Bauen passt das, im
// Entwicklungsmodus suchte Vite aber unter public/src → schwarzer Bildschirm.
// Diese Umleitung wirkt nur in der Vorschau, nicht beim Bauen.
const srcPfad = resolve(__dirname, 'src').replace(/\\/g, '/');
const vorschauQuellen = {
  name: 'brett-vorschau-quellen',
  apply: 'serve' as const,
  transformIndexHtml: {
    order: 'pre' as const, // vor Vites eigener Auflösung der Skriptadressen
    handler: (html: string) => html.replace(/src="\.\.\/src\//g, `src="/@fs/${srcPfad}/`),
  },
};

// Brett-Server für die Vorschau: Standard 3000, lokal oft 3001/3002 (Port belegt).
const server = 'http://localhost:' + (process.env.BRETT_SERVER_PORT || '3000');

export default defineConfig({
  root: 'public',
  plugins: [vorschauQuellen],
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'public/index.html'),
        share: resolve(__dirname, 'public/share.html'),
        zuschauer: resolve(__dirname, 'public/zuschauer.html'),
        steuerpult: resolve(__dirname, 'public/steuerpult.html'),
        genogramm: resolve(__dirname, 'public/genogramm.html'),
      },
    },
  },
  server: {
    port: 5173,
    fs: { allow: [resolve(__dirname)] },
    proxy: {
      '/api': server,
      '/auth': server,
      '/presets': server,
      '/share': server,
      '/zuschauer': server,
      '/healthz': server,
      '/sync': { target: server.replace('http', 'ws'), ws: true },
    },
  },
});
