// Impressum-Angaben kommen aus Umgebungsvariablen (GitHub-Variablen oder lokal .env.local),
// damit Name und Anschrift nie in der öffentlichen Git-Historie landen.

import { escapeHtml } from './library.js';
import { PLACEHOLDER } from './environment.js';

export const IMPRESSUM_FIELDS = {
  IMPRESSUM_NAME: 'Vor- und Nachname',
  IMPRESSUM_ADDRESS: 'Anschrift (mehrzeilig)',
  IMPRESSUM_EMAIL: 'E-Mail-Adresse',
};

const placeholder = (label) => `[${PLACEHOLDER}: ${label}]`;

function formatValue(key, value) {
  if (key === 'IMPRESSUM_ADDRESS') {
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(escapeHtml)
      .join('<br>\n      ');
  }
  if (key === 'IMPRESSUM_EMAIL') {
    const email = escapeHtml(value.trim());
    return `<a href="mailto:${email}">${email}</a>`;
  }
  return escapeHtml(value.trim());
}

export function impressumErrors(env) {
  const errors = [];
  for (const [key, label] of Object.entries(IMPRESSUM_FIELDS)) {
    if (!env[key] || !env[key].trim()) errors.push(`${key} fehlt (${label})`);
  }
  const email = env.IMPRESSUM_EMAIL?.trim();
  if (email && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) errors.push('IMPRESSUM_EMAIL ist keine gültige E-Mail-Adresse');
  return errors;
}

// Ersetzt {{IMPRESSUM_…}} im HTML. Fehlende oder ungültige Werte werden zu sichtbaren
// Platzhaltern, an denen der Produktions-Build abbricht.
export function fillImpressum(html, env) {
  const invalid = new Set(impressumErrors(env).map((error) => error.split(' ')[0]));
  return html.replace(/\{\{(IMPRESSUM_[A-Z]+)\}\}/g, (match, key) => {
    if (!(key in IMPRESSUM_FIELDS)) return match;
    return invalid.has(key) ? placeholder(IMPRESSUM_FIELDS[key]) : formatValue(key, env[key]);
  });
}
