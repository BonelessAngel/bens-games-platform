import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { imageFor, routeOf, seoTags, sitemapRoutes, sitemapXml } from '../lib/seo.js';
import { formatDay, renderGamePage, renderNews, validateGameContent } from '../lib/game-pages.js';

const read = (path) => JSON.parse(readFileSync(new URL(`../src/data/${path}`, import.meta.url), 'utf8'));
const apps = read('apps.json');
const info = read('spiele.json');
const news = read('neuigkeiten.json');
const games = apps.filter((app) => app.type === 'game');
const exists = (path) => existsSync(new URL(`../public${path}`, import.meta.url));

test('Adressen der Seiten werden aus den HTML-Dateien abgeleitet', () => {
  assert.equal(routeOf('/index.html'), '/');
  assert.equal(routeOf('/ranglisten/index.html'), '/ranglisten/');
  assert.equal(routeOf('spiele/nova-bastion/index.html'), '/spiele/nova-bastion/');
  assert.equal(routeOf('/404.html'), null, 'die Fehlerseite bekommt keine Vorschau');
  assert.equal(imageFor('/spiele/royal-blocks/'), '/og/royal-blocks.jpg');
  assert.equal(imageFor('/ranglisten/'), '/og/start.jpg');
});

test('Link-Vorschau nutzt Titel und Beschreibung der Seite und absolute Adressen', () => {
  const html = '<title>Ranglisten – Bens Games</title>\n<meta name="description" content="Die Besten.">';
  const live = seoTags(html, '/ranglisten/', 'production');
  assert.match(live, /<link rel="canonical" href="https:\/\/bens-games\.de\/ranglisten\/">/);
  assert.match(live, /og:title" content="Ranglisten – Bens Games"/);
  assert.match(live, /og:description" content="Die Besten\."/);
  assert.match(live, /og:image" content="https:\/\/bens-games\.de\/og\/start\.jpg"/);
  assert.match(live, /twitter:card" content="summary_large_image"/);
  assert.match(seoTags(html, '/', 'staging'), /https:\/\/staging\.bens-games\.de\//);
  assert.equal(seoTags(html, null, 'production'), '');
});

test('alle Vorschaubilder und Spielbilder gibt es wirklich', () => {
  assert.ok(exists('/og/start.jpg'));
  for (const game of games) {
    assert.ok(exists(`/og/${game.id}.jpg`), `Vorschaubild für ${game.id} fehlt`);
    for (const image of info[game.id].images) assert.ok(exists(image.src), `Bild fehlt: ${image.src}`);
  }
});

test('jedes Spiel hat eine Spiel-Seite mit Inhalt', () => {
  assert.deepEqual(validateGameContent(apps, info, news), []);
  for (const game of games) {
    assert.ok(existsSync(new URL(`../src/spiele/${game.id}/index.html`, import.meta.url)), `src/spiele/${game.id}/index.html fehlt`);
    const html = renderGamePage(game, info[game.id], news, apps);
    assert.match(html, new RegExp(`href="${game.path}"`), 'Knopf „Jetzt spielen“');
    assert.match(html, /<img [^>]*alt="[^"]+"/, 'Bilder mit Beschreibung');
  }
});

test('Sitemap enthält öffentliche Seiten und Spiel-Seiten, aber keine Konto-Seiten', () => {
  const routes = sitemapRoutes(apps);
  assert.ok(routes.includes('/') && routes.includes('/ranglisten/'));
  for (const game of games) assert.ok(routes.includes(`/spiele/${game.id}/`));
  assert.ok(!routes.some((route) => route.startsWith('/konto/')));
  const xml = sitemapXml('production', ['/'], '2026-10-25');
  assert.match(xml, /<loc>https:\/\/bens-games\.de\/<\/loc><lastmod>2026-10-25<\/lastmod>/);
});

test('Was ist neu: neueste zuerst, höchstens so viele wie gewünscht, Fehler werden erkannt', () => {
  assert.equal(formatDay('2026-10-05'), '5. Oktober 2026');
  const html = renderNews(news, apps, { limit: 2 });
  assert.equal((html.match(/class="news__item"/g) ?? []).length, 2);
  const nova = renderNews(news, apps, { appId: 'royal-blocks', limit: 9 });
  assert.doesNotMatch(nova, /Nova Bastion/);
  const broken = [{ app: 'gibt-es-nicht', date: '25.10.2026', title: '', points: [] }];
  assert.ok(validateGameContent(apps, info, broken).length >= 2);
  const order = [{ ...news[0], date: '2026-01-01' }, { ...news[0], date: '2026-02-01' }];
  assert.match(validateGameContent(apps, info, order).join(), /neueste Einträge zuerst/);
});
