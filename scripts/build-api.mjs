// Kopiert die PHP-API nach dist/api/ – ohne Tests und ohne die Konfigurationsvorlage.
// Die echte config.php liegt nie hier, sondern auf dem Server neben dem Webseiten-Ordner (api/src/Config.php).

import { cpSync, existsSync, rmSync } from 'node:fs';
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

console.log('API nach dist/api/ kopiert.');
