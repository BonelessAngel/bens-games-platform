// Spiele, die aus eigenen Repos in die Plattform übernommen werden (scripts/import-game.mjs).

export const GAMES = {
  'nova-bastion': {
    // Ausgabe von Webseite-bauen.ps1 im Nova-Bastion-Repo
    buildDir: 'Webseite',
    // Quelle des Service Workers; der Build schreibt nur den Cache-Zeitstempel hinein
    serviceWorker: 'Webseite/sw.js',
    files: [
      'index.html', 'manifest.webmanifest', 'sw.js', 'icon-180.png', 'icon-192.png', 'icon-512.png',
      // Selbst gehostete Schriften (SIL OFL 1.1) samt Lizenztexten
      'PressStart2P-Regular-latin.woff2', 'VT323-Regular-latin.woff2', 'PressStart2P-OFL.txt', 'VT323-OFL.txt',
    ],
  },
  'royal-blocks': {
    buildDir: 'dist',
    // Der Service Worker wird aus src/sw.js erzeugt und ist deshalb nicht direkt mit dem Tag vergleichbar.
    // Neu bauen: Der reproduzierbare Build ist damit selbst die geprüfte Quelle für den Import.
    buildCommand: ['npm', 'run', 'build'],
    libraryIcon: 'src/icon-512.png',
    files: [
      'index.html', 'style.css', 'main.js', 'game.js', 'poker.js', 'pieces.js', 'audio.js', 'fx.js',
      'storage.js', 'manifest.webmanifest', 'sw.js', 'icon-180.png', 'icon-192.png', 'icon-512.png',
    ],
  },
};

// Externe Quellen, die IP-Adressen der Besucher an Dritte weitergeben (z. B. Google Fonts), sind in Spielen nicht erlaubt.
export const FORBIDDEN_HOSTS = /https?:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|www\.google-analytics\.com|www\.googletagmanager\.com)/;

// Entfernt den Build-Zeitstempel, damit gebauter und getaggter Service Worker vergleichbar sind.
export function normalizeServiceWorker(source) {
  return source.replace(/var CACHE='nova-bastion-[^']*';/, "var CACHE='nova-bastion-';").replace(/\r\n/g, '\n').trim();
}
