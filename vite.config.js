import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { renderLibrary, validateApps } from './lib/library.js';
import { assertNoPlaceholders, environmentBanner, headTags, robotsTxt } from './lib/environment.js';

const src = (path) => fileURLToPath(new URL(`./src/${path}`, import.meta.url));

function loadApps() {
  const apps = JSON.parse(readFileSync(src('data/apps.json'), 'utf8'));
  const errors = validateApps(apps);
  if (errors.length) throw new Error(`apps.json ist ungültig:\n- ${errors.join('\n- ')}`);
  return apps;
}

// Setzt Bibliothek und umgebungsabhängige Teile beim Build direkt ins HTML,
// damit die Seiten ohne JavaScript vollständig sind.
function platform() {
  let mode;
  return {
    name: 'bens-games-platform',
    configResolved(config) {
      mode = config.mode;
    },
    transformIndexHtml(html, ctx) {
      const result = html
        .replace('<!-- HEAD -->', headTags(mode))
        .replace('<!-- ENV_BANNER -->', environmentBanner(mode))
        .replace('<!-- LIBRARY -->', () => renderLibrary(loadApps()))
        .replace('<!-- YEAR -->', String(new Date().getFullYear()));
      assertNoPlaceholders(result, ctx.filename, mode);
      return result;
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsTxt(mode) });
    },
  };
}

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  plugins: [platform()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: src('index.html'),
        impressum: src('impressum/index.html'),
      },
    },
  },
});
