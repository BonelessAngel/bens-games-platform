// Hängt einen markierten Block an eine bestehende .htaccess an bzw. ersetzt den alten Block.
// Alles außerhalb des Blocks (z. B. der KAS-Verzeichnisschutz) bleibt Zeichen für Zeichen erhalten.
// Aufruf: node scripts/merge-htaccess.mjs <bestehende .htaccess> <block-datei>  → Ergebnis auf stdout
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const BEGIN = '# BEGIN Bens Games (automatisch, bitte nicht von Hand ändern)';
export const END = '# END Bens Games';

export function mergeHtaccess(existing, block) {
  const pattern = new RegExp(`\\r?\\n?${escape(BEGIN)}[\\s\\S]*?${escape(END)}\\r?\\n?`, 'g');
  const rest = existing.replace(pattern, '\n').replace(/\s+$/, '');
  return `${rest ? `${rest}\n\n` : ''}${BEGIN}\n${block.trim()}\n${END}\n`;
}

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [existingFile, blockFile] = process.argv.slice(2);
  let existing = '';
  try { existing = readFileSync(existingFile, 'utf8'); } catch { existing = ''; }
  process.stdout.write(mergeHtaccess(existing, readFileSync(blockFile, 'utf8')));
}
