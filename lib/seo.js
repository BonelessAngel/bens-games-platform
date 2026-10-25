// Link-Vorschau (Open Graph) und Sitemap. Wird beim Build (vite.config.js) und in den Tests verwendet.
import { escapeHtml } from './library.js';

export const SITE_URLS = { production: 'https://bens-games.de', staging: 'https://staging.bens-games.de' };
export const DEFAULT_IMAGE = '/og/start.jpg';

export function siteUrl(mode) {
  return mode === 'staging' ? SITE_URLS.staging : SITE_URLS.production;
}

/** Aus dem Pfad der HTML-Datei (z. B. /ranglisten/index.html) die Adresse der Seite machen (/ranglisten/). */
export function routeOf(htmlPath) {
  const path = `/${String(htmlPath).replace(/\\/g, '/').replace(/^\/+/, '')}`;
  if (path === '/404.html') return null;
  return path.replace(/index\.html$/, '');
}

/** Bild für die Link-Vorschau: eigenes Bild je Spiel-Seite, sonst das allgemeine. */
export function imageFor(route) {
  const game = /^\/spiele\/([a-z0-9-]+)\/$/.exec(route ?? '');
  return game ? `/og/${game[1]}.jpg` : DEFAULT_IMAGE;
}

/**
 * Meta-Tags für die Link-Vorschau (WhatsApp, Discord, Signal, Google).
 * Titel und Beschreibung kommen aus der Seite selbst, damit beides nie auseinanderläuft.
 */
export function seoTags(html, route, mode) {
  if (route === null) return '';
  const base = siteUrl(mode);
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1]?.trim() ?? 'Bens Games';
  const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? '';
  const url = `${base}${route}`;
  const image = `${base}${imageFor(route)}`;
  const tags = [
    `<link rel="canonical" href="${escapeHtml(url)}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Bens Games">',
    '<meta property="og:locale" content="de_DE">',
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${escapeHtml(url)}">`,
    `<meta property="og:image" content="${escapeHtml(image)}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta name="twitter:card" content="summary_large_image">',
  ];
  return tags.join('\n  ');
}

/** Seiten, die Suchmaschinen kennen sollen (Konto-Seiten und Profile gehören nicht dazu). */
export function sitemapRoutes(apps) {
  const games = apps.filter((app) => app.type === 'game' && app.visibility === 'all' && app.status !== 'private');
  return ['/', '/ranglisten/', ...games.map((game) => `/spiele/${game.id}/`), '/impressum/', '/datenschutz/'];
}

export function sitemapXml(mode, routes, lastmod = new Date().toISOString().slice(0, 10)) {
  const base = siteUrl(mode);
  const urls = routes.map((route) => `  <url><loc>${base}${route}</loc><lastmod>${lastmod}</lastmod></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}
