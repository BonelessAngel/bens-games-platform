import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { renderLibrary, validateApps } from './lib/library.js';
import {
  ACCOUNT_PAGES,
  accountNav,
  accountsEnabled,
  assertNoPlaceholders,
  environmentBanner,
  headTags,
  robotsTxt,
} from './lib/environment.js';
import { fillImpressum } from './lib/impressum.js';

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
  let env;
  return {
    name: 'bens-games-platform',
    configResolved(config) {
      mode = config.mode;
      // Liest IMPRESSUM_* aus der Umgebung (GitHub-Variablen) oder aus .env.local.
      env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'IMPRESSUM_');
    },
    transformIndexHtml(html, ctx) {
      const result = fillImpressum(html, env)
        .replace('<!-- HEAD -->', headTags(mode))
        .replace('<!-- ENV_BANNER -->', environmentBanner(mode))
        .replace('<!-- ACCOUNT_NAV -->', accountNav(mode))
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

export default defineConfig(({ mode }) => {
  const input = {
    main: src('index.html'),
    impressum: src('impressum/index.html'),
    datenschutz: src('datenschutz/index.html'),
  };
  if (accountsEnabled(mode)) {
    for (const [name, path] of Object.entries(ACCOUNT_PAGES)) input[name] = src(path);
  }

  return {
    root: 'src',
    publicDir: '../public',
    plugins: [platform()],
    build: {
      outDir: '../dist',
      emptyOutDir: true,
      rollupOptions: { input },
    },
  };
});
