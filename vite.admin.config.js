// Build der Zentrale (admin.bens-games.de / admin-staging.bens-games.de) nach dist-admin/.
// Eigene Seite, eigene Adresse, keine Kontoseiten und keine Spiele.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { environmentBanner } from './lib/environment.js';

function zentrale() {
  let mode;
  return {
    name: 'bens-games-zentrale',
    configResolved(config) {
      mode = config.mode;
    },
    transformIndexHtml(html) {
      return html.replace('<!-- ENV_BANNER -->', environmentBanner(mode));
    },
    generateBundle() {
      // Die Zentrale soll nie in Suchmaschinen auftauchen – auch nicht auf der Live-Adresse.
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: 'User-agent: *\nDisallow: /\n' });
    },
  };
}

export default defineConfig({
  root: 'admin-src',
  publicDir: false,
  plugins: [zentrale()],
  // Für den Bereich „Technik“: wann und aus welchem Code-Stand diese Zentrale gebaut wurde.
  define: {
    __ZENTRALE_BUILD__: JSON.stringify({ time: new Date().toISOString(), commit: (process.env.GITHUB_SHA ?? 'lokal').slice(0, 7) }),
  },
  build: {
    outDir: '../dist-admin',
    emptyOutDir: true,
    rollupOptions: {
      input: { zentrale: fileURLToPath(new URL('./admin-src/index.html', import.meta.url)) },
    },
  },
});
