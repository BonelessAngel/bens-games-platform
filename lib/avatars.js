// Profilbilder: fertige Avatare zum Auswählen (kein Upload) – Motiv plus Hintergrundfarbe.
// Motive als SVG im 24×24-Raster, weiß auf farbigem Kreis. Wird von Webseite, Ranglisten und Tests genutzt.

export const AVATAR_COLORS = [
  { id: 'indigo', name: 'Indigo', value: '#6366f1' },
  { id: 'teal', name: 'Türkis', value: '#14b8a6' },
  { id: 'rose', name: 'Rosé', value: '#f43f5e' },
  { id: 'amber', name: 'Bernstein', value: '#f59e0b' },
  { id: 'violet', name: 'Violett', value: '#8b5cf6' },
  { id: 'sky', name: 'Himmelblau', value: '#0ea5e9' },
  { id: 'emerald', name: 'Smaragd', value: '#10b981' },
  { id: 'slate', name: 'Schiefer', value: '#475569' },
];

const EVENODD = 'fill-rule="evenodd" clip-rule="evenodd"';

export const AVATARS = [
  { id: 'crown', name: 'Krone', svg: '<path d="M3 18h18v2.5H3zM3 7l4.5 4L12 4l4.5 7L21 7l-2 9.5H5z"/>' },
  { id: 'star', name: 'Stern', svg: '<path d="M12 2l3 6.6 7 .7-5.3 4.8 1.6 7L12 17.4 5.7 21.1l1.6-7L2 9.3l7-.7z"/>' },
  { id: 'heart', name: 'Herz', svg: '<path d="M12 21s-8.5-5.3-8.5-11.3A4.7 4.7 0 0 1 12 7a4.7 4.7 0 0 1 8.5 2.7C20.5 15.7 12 21 12 21z"/>' },
  { id: 'bolt', name: 'Blitz', svg: '<path d="M13.5 2 4 14h7l-1.5 8L20 10h-7z"/>' },
  { id: 'rocket', name: 'Rakete', svg: `<path ${EVENODD} d="M12 2c3.2 2.2 5 6 5 10.2L15.2 16H8.8L7 12.2C7 8 8.8 4.2 12 2zm0 5.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/><path d="M7 13l-3 4 3.5.5zM17 13l3 4-3.5.5zM10 17h4l-.8 4h-2.4z"/>` },
  { id: 'castle', name: 'Burg', svg: '<path d="M3 21V9h2.5V5.5H8V9h2V5.5h4V9h2V5.5h2.5V9H21v12h-6.5v-5a2.5 2.5 0 0 0-5 0v5z"/>' },
  { id: 'shield', name: 'Schild', svg: `<path ${EVENODD} d="M12 2l8.5 3.2v6.3c0 5.3-3.7 9.3-8.5 10.5-4.8-1.2-8.5-5.2-8.5-10.5V5.2zm0 3.3L6.5 7.4v4.1c0 3.6 2.3 6.4 5.5 7.4z"/>` },
  { id: 'gem', name: 'Kristall', svg: `<path ${EVENODD} d="M6.5 3h11l4.5 6.2L12 22 2 9.2zM8 9.2l4 9 4-9z"/>` },
  { id: 'planet', name: 'Planet', svg: '<circle cx="12" cy="12" r="6"/><path d="M2.6 16.8c-1-1.8 2.3-5 7.4-7.3 5.2-2.3 9.8-2.6 10.8-.8.4.8-.1 1.9-1.2 3.1-.1-.6-.2-1.1-.4-1.6.4-.5.5-.8.4-1-.4-.8-4.1-.4-8.6 1.6-4.5 2-7.3 4.6-6.9 5.4.1.2.5.3 1.1.3.4.4.8.8 1.2 1.1-2 .3-3.4 0-3.8-.8z"/>' },
  { id: 'moon', name: 'Mond', svg: '<path d="M15.5 2.5A9.5 9.5 0 1 0 21.5 18 8 8 0 0 1 15.5 2.5z"/>' },
  { id: 'sun', name: 'Sonne', svg: '<circle cx="12" cy="12" r="4.5"/><path d="M11 1h2v4h-2zM11 19h2v4h-2zM1 11h4v2H1zM19 11h4v2h-4zM4.2 5.6l1.4-1.4 2.8 2.8-1.4 1.4zM15.6 17l1.4-1.4 2.8 2.8-1.4 1.4zM4.2 18.4l2.8-2.8 1.4 1.4-2.8 2.8zM15.6 7l2.8-2.8 1.4 1.4L17 8.4z"/>' },
  { id: 'flame', name: 'Flamme', svg: '<path d="M12 2c.8 4 6.5 6.3 6.5 12.3a6.5 6.5 0 0 1-13 0c0-3.2 2-5.6 3.3-6.7 0 2.2 1 3.4 2.3 3.4C11 7.2 12 5 12 2z"/>' },
  { id: 'ghost', name: 'Geist', svg: `<path ${EVENODD} d="M12 2.5a7.5 7.5 0 0 0-7.5 7.5v11.5L7.2 19.4l2.4 2.1 2.4-2.1 2.4 2.1 2.4-2.1 2.7 2.1V10A7.5 7.5 0 0 0 12 2.5zM9.3 8.5a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zm5.4 0a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z"/>` },
  { id: 'cat', name: 'Katze', svg: `<path ${EVENODD} d="M3.5 3l4.8 4.6h7.4L20.5 3v10a8.5 8.5 0 0 1-17 0zM9 11.5a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zm6 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zM10.6 16h2.8L12 17.6z"/>` },
  { id: 'fox', name: 'Fuchs', svg: `<path ${EVENODD} d="M2.5 3.5L8 8h8l5.5-4.5L20 13l-8 8.5L4 13zM8.7 11a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zm6.6 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zM10.5 16.5h3L12 18.3z"/>` },
  { id: 'owl', name: 'Eule', svg: `<path ${EVENODD} d="M4 3l4 3h8l4-3v10.5A8 8 0 0 1 4 13.5zM8.5 8.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm7 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm-7 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm7 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2zM12 14.5l1.2 1.8h-2.4z"/>` },
  { id: 'robot', name: 'Roboter', svg: `<path ${EVENODD} d="M11 2h2v3h4.5A2.5 2.5 0 0 1 20 7.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 15.5v-8A2.5 2.5 0 0 1 6.5 5H11zM8.8 9a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4zm6.4 0a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4zM9 14v1.6h6V14z"/><path d="M1.5 9h1.5v5H1.5zM21 9h1.5v5H21zM8 19h3v3H8zM13 19h3v3h-3z"/>` },
  { id: 'alien', name: 'Alien', svg: `<path ${EVENODD} d="M12 2C7 2 4 5.6 4 10c0 5 4.5 10.5 8 12 3.5-1.5 8-7 8-12 0-4.4-3-8-8-8zM6.8 10.2c1.8-.2 3.6.9 4 2.6-1.8.3-3.7-.7-4-2.6zm10.4 0c-.3 1.9-2.2 2.9-4 2.6.4-1.7 2.2-2.8 4-2.6z"/>` },
  { id: 'spade', name: 'Pik', svg: '<path d="M12 2C9.3 6 3.5 8.6 3.5 13.3a4.3 4.3 0 0 0 7.4 3L9.8 22h4.4l-1.1-5.7a4.3 4.3 0 0 0 7.4-3C20.5 8.6 14.7 6 12 2z"/>' },
  { id: 'diamond', name: 'Karo', svg: '<path d="M12 1.5 19.5 12 12 22.5 4.5 12z"/>' },
  { id: 'club', name: 'Kreuz', svg: '<circle cx="12" cy="6.8" r="4.3"/><circle cx="6.8" cy="13" r="4.3"/><circle cx="17.2" cy="13" r="4.3"/><path d="M11 12h2l1.2 10H9.8z"/>' },
  { id: 'dice', name: 'Würfel', svg: `<path ${EVENODD} d="M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zm2 3.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-4 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-4 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/>` },
  { id: 'gamepad', name: 'Controller', svg: `<path ${EVENODD} d="M7 6h10a5 5 0 0 1 4.9 6l-1.2 5.4a2.6 2.6 0 0 1-4.5 1.1L14 16h-4l-2.2 2.5a2.6 2.6 0 0 1-4.5-1.1L2.1 12A5 5 0 0 1 7 6zm0 3v1.5H5.5V12H7v1.5h1.5V12H10v-1.5H8.5V9zm9.5.2a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zm-2 2.4a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z"/>` },
  { id: 'note', name: 'Musik', svg: '<path d="M9 3.5v11.1a3.5 3.5 0 1 0 2 3.2V8.3l8-2v6.3a3.5 3.5 0 1 0 2 3.2V1.8z"/>' },
];

export function findAvatar(id) {
  return AVATARS.find((a) => a.id === id) ?? null;
}

export function findColor(id) {
  return AVATAR_COLORS.find((c) => c.id === id) ?? AVATAR_COLORS[0];
}

/** Farbe für Konten ohne gewählten Avatar – fest aus dem Namen abgeleitet. */
export function defaultColor(name = '') {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function escapeText(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/**
 * SVG-Markup eines Profilbilds. Ohne Avatar: Anfangsbuchstabe des Namens.
 * Gibt nur feste Motive bzw. maskierten Text aus – sicher für innerHTML.
 */
export function avatarSvg({ avatar, color, name = '' } = {}, size = 40) {
  const motif = findAvatar(avatar);
  const background = motif ? findColor(color).value : defaultColor(name).value;
  const inner = motif
    ? `<g transform="translate(5.6 5.6) scale(0.533)" fill="#fff">${motif.svg}</g>`
    : `<text x="12" y="16.2" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#fff">${escapeText(([...name.trim()][0] ?? '?').toUpperCase())}</text>`;
  return `<svg class="avatar" viewBox="0 0 24 24" width="${size}" height="${size}" role="img" aria-label="${escapeText(motif ? motif.name : name)}"><circle cx="12" cy="12" r="12" fill="${background}"/>${inner}</svg>`;
}

/** Profilbilder als eigene Dateien /avatars/<motiv>-<farbe>.svg – damit Spiele sie ohne Plattform-Code als <img> zeigen können. */
export function avatarFiles() {
  return AVATARS.flatMap((avatar) => AVATAR_COLORS.map((color) => ({
    fileName: `avatars/${avatar.id}-${color.id}.svg`,
    source: avatarSvg({ avatar: avatar.id, color: color.id }, 96).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '),
  })));
}
