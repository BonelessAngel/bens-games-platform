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
import { avatarFiles } from './lib/avatars.js';
import { patchNotes, renderGamePage, renderNews, validateGameContent } from './lib/game-pages.js';
import { routeOf, seoTags, sitemapRoutes, sitemapXml, siteUrl } from './lib/seo.js';

const src = (path) => fileURLToPath(new URL(`./src/${path}`, import.meta.url));

function loadApps() {
  const apps = JSON.parse(readFileSync(src('data/apps.json'), 'utf8'));
  const errors = validateApps(apps);
  if (errors.length) throw new Error(`apps.json ist ungültig:\n- ${errors.join('\n- ')}`);
  return apps;
}

// Spiel-Seiten und „Was ist neu?“ (src/data/spiele.json, src/data/neuigkeiten.json)
function loadContent(apps) {
  const info = JSON.parse(readFileSync(src('data/spiele.json'), 'utf8'));
  const news = JSON.parse(readFileSync(src('data/neuigkeiten.json'), 'utf8'));
  const errors = validateGameContent(apps, info, news);
  if (errors.length) throw new Error(`Spiel-Inhalte sind ungültig:\n- ${errors.join('\n- ')}`);
  return { info, news };
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
      const apps = loadApps();
      const { info, news } = loadContent(apps);
      const result = fillImpressum(html, env)
        .replace('<!-- HEAD -->', () => `${headTags(mode)}\n  ${seoTags(html, routeOf(ctx.path), mode)}`)
        .replace('<!-- NEUIGKEITEN -->', () => renderNews(news, apps))
        .replace(/<!-- SPIELSEITE:([a-z0-9-]+) -->/, (_, id) => renderGamePage(apps.find((app) => app.id === id), info[id], news, apps))
        .replace('<!-- ENV_BANNER -->', environmentBanner(mode))
        .replace('<!-- ACCOUNT_NAV -->', accountNav(mode))
        .replace('<!-- LIBRARY -->', () => renderLibrary(apps, { pages: Object.keys(info) }))
        .replace('<!-- SPIELSEITEN -->', () => Object.keys(info).join(','))
        .replace('<!-- YEAR -->', String(new Date().getFullYear()));
      assertNoPlaceholders(result, ctx.filename, mode);
      return result;
    },
    generateBundle() {
      const sitemap = mode === 'staging' ? '' : `Sitemap: ${siteUrl(mode)}/sitemap.xml\n`;
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsTxt(mode) + sitemap });
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml(mode, sitemapRoutes(loadApps())) });
      // Patchnotes für die Spiele (docs/spiele-anbindung.md, Abschnitt „Patchnotes“)
      const apps = loadApps();
      this.emitFile({ type: 'asset', fileName: 'neuigkeiten.json', source: JSON.stringify(patchNotes(loadContent(apps).news, apps)) });
      // Profilbilder für die Startbildschirme der Spiele (docs/spiele-anbindung.md)
      for (const file of avatarFiles()) this.emitFile({ type: 'asset', ...file });
    },
  };
}

export default defineConfig(({ mode }) => {
  const input = {
    main: src('index.html'),
    impressum: src('impressum/index.html'),
    datenschutz: src('datenschutz/index.html'),
    ranglisten: src('ranglisten/index.html'),
    // Eigene Fehlerseite (ErrorDocument 404 im .htaccess-Block, siehe deploy/htaccess-site.conf)
    notfound: src('404.html'),
  };
  // Eine Seite pro Spiel (/spiele/<id>/), Inhalt aus src/data/spiele.json
  for (const app of loadApps().filter((a) => a.type === 'game')) input[`spiel_${app.id}`] = src(`spiele/${app.id}/index.html`);
  if (accountsEnabled(mode)) {
    for (const [name, path] of Object.entries(ACCOUNT_PAGES)) input[name] = src(path);
    // Öffentliche Spielerprofile gibt es nur mit Konten.
    input.spieler = src('spieler/index.html');
    input.ruhmeshalle = src('ruhmeshalle/index.html');
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
