// Kopiert die PHP-API nach dist/api/ – ohne Tests und ohne die Konfigurationsvorlage.
// Die echte config.php liegt nie hier, sondern auf dem Server neben dem Webseiten-Ordner (api/src/Config.php).

import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = join(root, 'api');
const target = join(root, 'dist', 'api');

const EXCLUDED = new Set(['tests', 'config.example.php', 'config.php']);

if (!existsSync(join(root, 'dist'))) {
  console.error('dist/ fehlt – zuerst vite build ausführen.');
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
cpSync(source, target, {
  recursive: true,
  filter: (path) => !EXCLUDED.has(basename(path)),
});

// App-Verzeichnis für den Abgleich nach den Migrationen (api/data/ ist per .htaccess nicht direkt abrufbar).
mkdirSync(join(target, 'data'), { recursive: true });
cpSync(join(root, 'src', 'data', 'apps.json'), join(target, 'data', 'apps.json'));

console.log('API nach dist/api/ kopiert.');
