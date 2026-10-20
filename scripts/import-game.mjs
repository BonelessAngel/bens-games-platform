// Übernimmt eine gebaute, getaggte Spielversion in die Plattform (PLATTFORM-PLAN.md, Abschnitt 7 und 10).
//
// Aufruf:  npm run import-game -- nova-bastion "C:\Users\buche\Documents\Codex\nova-bastion-codex" v1.1.0
//
// Voraussetzungen im Spiel-Repo: HEAD steht genau auf dem Tag, und die Webseite wurde dort gebaut
// (Webseite-bauen.ps1). Kopiert werden nur die bekannten Spieldateien; Version, Commit und Prüfsummen
// landen in public/games/<id>/VERSION.json.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORBIDDEN_HOSTS, GAMES, normalizeServiceWorker } from '../lib/games.js';

const root = fileURLToPath(new URL('..', import.meta.url));

function fail(message) {
  console.error(`Abbruch: ${message}`);
  process.exit(1);
}

const git = (repo, ...args) =>
  // Nur am Ende kürzen: Bei "git status --porcelain" gehört das führende Leerzeichen zum Format.
  execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();

const [id, repo, tag] = process.argv.slice(2);
if (!id || !repo || !tag) fail('Aufruf: npm run import-game -- <spiel-id> <pfad-zum-spiel-repo> <tag>');

const game = GAMES[id];
if (!game) fail(`Unbekanntes Spiel "${id}". Bekannt: ${Object.keys(GAMES).join(', ')}`);
if (!/^v\d+\.\d+\.\d+$/.test(tag)) fail(`Tag "${tag}" muss die Form v1.2.3 haben.`);

// 1. HEAD muss genau auf dem Tag stehen.
let tagCommit;
try {
  tagCommit = git(repo, 'rev-list', '-n', '1', tag);
} catch {
  fail(`Tag ${tag} existiert in ${repo} nicht.`);
}
const head = git(repo, 'rev-parse', 'HEAD');
if (head !== tagCommit) fail(`${repo} steht nicht auf ${tag} (HEAD ${head.slice(0, 7)}, Tag ${tagCommit.slice(0, 7)}).`);

// 2. Arbeitsbaum sauber – bis auf den Zeitstempel, den der Build in den Service Worker schreibt.
const dirty = git(repo, 'status', '--porcelain')
  .split('\n')
  .filter(Boolean)
  .filter((line) => line.slice(3) !== game.serviceWorker);
if (dirty.length) fail(`Arbeitsbaum ist nicht sauber:\n${dirty.join('\n')}`);

const builtSw = readFileSync(join(repo, game.serviceWorker), 'utf8');
const taggedSw = git(repo, 'show', `${tag}:${game.serviceWorker}`);
if (normalizeServiceWorker(builtSw) !== normalizeServiceWorker(taggedSw)) {
  fail(`${game.serviceWorker} weicht vom Tag ab (mehr als nur der Cache-Zeitstempel).`);
}

// 3. Gebaute Dateien prüfen und kopieren.
const source = join(repo, game.buildDir);
for (const file of game.files) {
  if (!existsSync(join(source, file))) fail(`${file} fehlt in ${source}. Wurde das Spiel gebaut?`);
}
const forbidden = readFileSync(join(source, 'index.html'), 'utf8').match(FORBIDDEN_HOSTS);
if (forbidden) fail(`index.html lädt Inhalte von ${forbidden[1]} – das gibt IP-Adressen an Dritte weiter. Bitte im Spiel-Repo selbst hosten.`);

const target = join(root, 'public', 'games', id);
mkdirSync(target, { recursive: true });
for (const file of game.files) rmSync(join(target, file), { force: true });

const files = {};
for (const file of game.files) {
  copyFileSync(join(source, file), join(target, file));
  files[file] = createHash('sha256').update(readFileSync(join(target, file))).digest('hex');
}

const version = tag.slice(1);
writeFileSync(
  join(target, 'VERSION.json'),
  `${JSON.stringify({ id, version, tag, commit: tagCommit, files }, null, 2)}\n`,
);

// 4. Version im App-Verzeichnis nachziehen.
const appsPath = join(root, 'src', 'data', 'apps.json');
const apps = JSON.parse(readFileSync(appsPath, 'utf8'));
const entry = apps.find((app) => app.id === id);
if (!entry) fail(`${id} fehlt in src/data/apps.json.`);
entry.version = version;
writeFileSync(appsPath, `${JSON.stringify(apps, null, 2)}\n`);

console.log(`${id} ${tag} (${tagCommit.slice(0, 7)}) übernommen nach public/games/${id}/`);
