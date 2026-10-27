// Shop-Katalog. IDs bestehender Artikel bleiben stabil, damit frühere Käufe erhalten bleiben.
// rarity: common | rare | epic | legendary. Legendäre Sachen gibt es nur aus Truhen, dem Glücksrad oder dem Automaten,
// Bonus-Sachen (bonus: Set-ID) nur für ein komplettes Set im Sammelalbum.

export const THEMES = [
  { id: 'neon', name: 'Neon', price: 0, color: '#0d0420' },
  { id: 'gold', name: 'Gold-Casino', price: 2100, color: '#041a12', rarity: 'rare', set: 'vegas' },
  { id: 'ice', name: 'Eis', price: 4200, color: '#06182a', rarity: 'epic', set: 'eis' },
  { id: 'retro', name: 'Retro-Arcade', price: 7000, color: '#000000', rarity: 'epic', set: 'retro' },
  { id: 'diamond', name: 'Diamant-Salon', price: 0, color: '#0a1424', rarity: 'legendary' },
];

export const TILE_STYLES = [
  { id: 'standard', name: 'Standard', price: 0 },
  { id: 'glass', name: 'Glas', price: 1400, rarity: 'rare', set: 'eis' },
  { id: 'pixel', name: 'Pixel', price: 2800, rarity: 'rare', set: 'retro' },
  { id: 'chip', name: 'Chip', price: 5600, rarity: 'epic', set: 'vegas' },
  { id: 'shimmer', name: 'Schimmer', price: 6500, rarity: 'epic', animated: true },
  { id: 'holo', name: 'Holografisch', price: 0, rarity: 'legendary', animated: true },
  { id: 'royal', name: 'Königlich', price: 0, rarity: 'legendary', bonus: 'royal' },
];

export const EFFECTS = [
  { id: 'effect-classic', name: 'Neon-Funken', price: 0 },
  { id: 'effect-confetti', name: 'Konfetti', price: 1800, rarity: 'common' },
  { id: 'effect-pixel', name: 'Pixel-Regen', price: 2600, rarity: 'rare', set: 'retro' },
  { id: 'effect-fireworks', name: 'Feuerwerk', price: 3800, rarity: 'rare' },
  { id: 'effect-sparks', name: 'Goldfunken', price: 4800, rarity: 'epic', set: 'royal' },
];

export const BACKGROUNDS = [
  { id: 'bg-classic', name: 'Neon-Nacht', price: 0 },
  { id: 'bg-felt', name: 'Casino-Filz', price: 1800, rarity: 'common', set: 'vegas' },
  { id: 'bg-stars', name: 'Sternennacht', price: 2800, rarity: 'rare', set: 'eis' },
  { id: 'bg-royal', name: 'Royal Gold', price: 4400, rarity: 'epic', set: 'royal' },
  { id: 'bg-vegas', name: 'Vegas-Lichter', price: 0, rarity: 'legendary', bonus: 'vegas' },
  { id: 'bg-grid', name: 'Synthwave', price: 0, rarity: 'legendary', bonus: 'retro' },
];

export const CARDS = [
  { id: 'card-classic', name: 'Klassisch', price: 0 },
  { id: 'card-casino', name: 'Casino', price: 1600, rarity: 'common', set: 'vegas' },
  { id: 'card-minimal', name: 'Minimal', price: 2600, rarity: 'rare' },
  { id: 'card-neon', name: 'Neon-Symbole', price: 4000, rarity: 'rare', set: 'retro' },
];

export const FRAMES = [
  { id: 'frame-classic', name: 'Schlicht', price: 0 },
  { id: 'frame-wood', name: 'Spieltisch', price: 1500, rarity: 'common', set: 'vegas' },
  { id: 'frame-gold', name: 'Goldrand', price: 3500, rarity: 'rare', set: 'royal' },
  { id: 'frame-neon', name: 'Neon-Puls', price: 5000, rarity: 'epic', set: 'retro', animated: true },
  { id: 'frame-diamond', name: 'Diamantrahmen', price: 0, rarity: 'legendary', animated: true },
  { id: 'frame-ice', name: 'Eiskristall', price: 0, rarity: 'legendary', bonus: 'eis' },
];

export const SOUND_PACKS = [
  { id: 'sound-classic', name: 'Synth', price: 0 },
  { id: 'sound-retro', name: '8-Bit', price: 2000, rarity: 'rare', set: 'retro' },
  { id: 'sound-casino', name: 'Casino-Glocken', price: 3000, rarity: 'rare', set: 'vegas' },
  { id: 'sound-jazz', name: 'Lounge-Jazz', price: 4500, rarity: 'epic' },
  { id: 'sound-crystal', name: 'Kristallklang', price: 5500, rarity: 'epic', set: 'eis' },
];

export const JINGLES = [
  { id: 'jingle-none', name: 'Ohne', price: 0 },
  { id: 'jingle-fanfare', name: 'Fanfare', price: 2500, rarity: 'rare', set: 'royal' },
  { id: 'jingle-arcade', name: 'Arcade', price: 2500, rarity: 'rare', set: 'retro' },
  { id: 'jingle-slot', name: 'Jackpot-Klingeln', price: 3500, rarity: 'epic', set: 'vegas' },
  { id: 'jingle-harp', name: 'Harfe', price: 4000, rarity: 'epic', set: 'eis' },
  { id: 'jingle-orchestra', name: 'Orchester', price: 0, rarity: 'legendary' },
];

export const CHIP_STYLES = [
  { id: 'chip-gold', name: 'Gold', price: 0 },
  { id: 'chip-red', name: 'Rot', price: 1200, rarity: 'common', set: 'vegas' },
  { id: 'chip-black', name: 'Schwarz-Gold', price: 2400, rarity: 'rare', set: 'royal' },
  { id: 'chip-ice', name: 'Eis', price: 3000, rarity: 'rare', set: 'eis' },
  { id: 'chip-neon', name: 'Neon', price: 3600, rarity: 'rare', set: 'retro' },
  { id: 'chip-diamond', name: 'Diamant', price: 0, rarity: 'legendary' },
];

// Glücksbringer bringen nur mehr Chips, nie mehr Punkte – die Bestenliste bleibt fair.
export const CHARMS = [
  { id: 'charm-none', name: 'Keiner', price: 0, bonus_chips: 0, icon: '–' },
  { id: 'charm-clover', name: 'Kleeblatt', price: 1500, rarity: 'common', bonus_chips: 0.05, icon: '🍀' },
  { id: 'charm-horseshoe', name: 'Glücksmünze', price: 3000, rarity: 'rare', bonus_chips: 0.08, icon: '🪙' },
  { id: 'charm-cat', name: 'Glückskatze', price: 5000, rarity: 'epic', bonus_chips: 0.1, icon: '🐱' },
  { id: 'charm-dice', name: 'Goldener Würfel', price: 0, rarity: 'legendary', bonus_chips: 0.15, icon: '🎲' },
];

export const START_BONUS = { id: 'start-bonus', name: 'Start-Bonus', price: 350 };

// Nur für kurze Zeit: kaufbar von `from` bis einschließlich `until` (Datum auf dem Gerät).
// Wer sie gekauft hat, behält sie. Nicht in Truhen, nicht im Album, zählen nicht zu „alles gesammelt“.
export const LIMITED = [
  // Halloween bis 10. November 2026
  { kind: 'theme', id: 'halloween', name: 'Kürbisnacht', price: 4000, rarity: 'epic', color: '#120612', event: 'Halloween', from: '2026-10-27', until: '2026-11-10' },
  { kind: 'tiles', id: 'pumpkin', name: 'Kürbis', price: 3500, rarity: 'epic', event: 'Halloween', from: '2026-10-27', until: '2026-11-10' },
  { kind: 'backgrounds', id: 'bg-spooky', name: 'Geisterstunde', price: 2500, rarity: 'rare', event: 'Halloween', from: '2026-10-27', until: '2026-11-10' },
  { kind: 'frames', id: 'frame-cobweb', name: 'Spinnennetz', price: 2500, rarity: 'rare', event: 'Halloween', from: '2026-10-27', until: '2026-11-10' },
  { kind: 'chips', id: 'chip-pumpkin', name: 'Kürbis-Chip', price: 1500, rarity: 'common', event: 'Halloween', from: '2026-10-27', until: '2026-11-10' },
  { kind: 'jingles', id: 'jingle-spooky', name: 'Gruselorgel', price: 2000, rarity: 'rare', event: 'Halloween', from: '2026-10-27', until: '2026-11-10' },
  // Wochen-Artikel: jeden Montag ein neuer
  { kind: 'backgrounds', id: 'bg-autumn', name: 'Herbstlaub', price: 2400, rarity: 'rare', event: 'Wochen-Artikel', from: '2026-11-09', until: '2026-11-15' },
  { kind: 'chips', id: 'chip-copper', name: 'Kupfer-Chip', price: 1800, rarity: 'rare', event: 'Wochen-Artikel', from: '2026-11-16', until: '2026-11-22' },
  { kind: 'frames', id: 'frame-marquee', name: 'Leuchtreklame', price: 3800, rarity: 'epic', animated: true, event: 'Wochen-Artikel', from: '2026-11-23', until: '2026-11-29' },
  { kind: 'theme', id: 'snow', name: 'Schneenacht', price: 4200, rarity: 'epic', color: '#0b1a2e', event: 'Wochen-Artikel', from: '2026-11-30', until: '2026-12-06' },
  { kind: 'jingles', id: 'jingle-bells', name: 'Schlittenglocken', price: 2500, rarity: 'rare', event: 'Wochen-Artikel', from: '2026-12-07', until: '2026-12-13' },
  { kind: 'tiles', id: 'giftwrap', name: 'Geschenkpapier', price: 3800, rarity: 'epic', event: 'Wochen-Artikel', from: '2026-12-14', until: '2026-12-20' },
  { kind: 'backgrounds', id: 'bg-xmas', name: 'Weihnachtsmarkt', price: 3200, rarity: 'epic', event: 'Wochen-Artikel', from: '2026-12-21', until: '2026-12-27' },
  { kind: 'frames', id: 'frame-sparkler', name: 'Wunderkerze', price: 3800, rarity: 'epic', animated: true, event: 'Wochen-Artikel', from: '2026-12-28', until: '2027-01-03' },
];

// Prestige: goldene Varianten, nur aus der Prestige-Truhe – die erscheint erst, wenn man alles andere hat
export const MYTHIC = [
  { kind: 'theme', id: 'midas', name: 'Midas', color: '#140d00' },
  { kind: 'tiles', id: 'goldbar', name: 'Goldbarren', animated: true },
  { kind: 'backgrounds', id: 'bg-treasure', name: 'Schatzkammer' },
  { kind: 'cards', id: 'card-gold', name: 'Goldschrift' },
  { kind: 'frames', id: 'frame-midas', name: 'Königsrahmen', animated: true },
  { kind: 'chips', id: 'chip-midas', name: 'Midas-Chip' },
  { kind: 'jingles', id: 'jingle-midas', name: 'Königsfanfare' },
  { kind: 'charms', id: 'charm-crown', name: 'Goldene Krone', bonus_chips: 0.2, icon: '👑' },
].map((item) => ({ price: 0, rarity: 'mythic', ...item }));

const extra = (kind) => [...LIMITED, ...MYTHIC].filter((item) => item.kind === kind).map(({ kind: _kind, ...item }) => item);

export const SHOP_ITEMS = {
  theme: [...THEMES, ...extra('theme')], tiles: [...TILE_STYLES, ...extra('tiles')], effects: EFFECTS,
  backgrounds: [...BACKGROUNDS, ...extra('backgrounds')], cards: [...CARDS, ...extra('cards')], frames: [...FRAMES, ...extra('frames')],
  sounds: SOUND_PACKS, jingles: [...JINGLES, ...extra('jingles')], chips: [...CHIP_STYLES, ...extra('chips')],
  charms: [...CHARMS, ...extra('charms')], extras: [START_BONUS],
};

// Welche Einstellung ein Bereich setzt (settings[...] in main.js)
export const SHOP_SETTING = {
  theme: 'theme', tiles: 'tiles', effects: 'effect', backgrounds: 'background', cards: 'cards',
  frames: 'frame', sounds: 'soundPack', jingles: 'jingle', chips: 'chipStyle', charms: 'charm',
};

export const SHOP_LABELS = {
  theme: 'Designs', tiles: 'Kacheln', effects: 'Effekte', backgrounds: 'Hintergründe', cards: 'Karten',
  frames: 'Rahmen', sounds: 'Sounds', jingles: 'Jingles', chips: 'Chips', charms: 'Glücksbringer', extras: 'Extras',
};

export const RARITY = {
  common: { name: 'Gewöhnlich', dupe: 120 },
  rare: { name: 'Selten', dupe: 300 },
  epic: { name: 'Episch', dupe: 700 },
  legendary: { name: 'Legendär', dupe: 1500 },
  mythic: { name: 'Mythisch', dupe: 2500 },
};

// Sammelalbum: ein komplettes Set schaltet den Bonus-Artikel frei
export const SETS = {
  vegas: { name: 'Las Vegas', icon: '🎰' },
  eis: { name: 'Eispalast', icon: '❄️' },
  retro: { name: 'Retro-Arcade', icon: '👾' },
  royal: { name: 'Royal Gold', icon: '👑' },
};

export const FREE_ITEMS = Object.values(SHOP_ITEMS).flat().filter((item) => item.price === 0 && !item.rarity).map((item) => item.id);

export const ALL_ITEMS = Object.entries(SHOP_ITEMS).flatMap(([kind, items]) => items.map((item) => ({ ...item, kind })));
export const itemById = (id) => ALL_ITEMS.find((item) => item.id === id) ?? null;

// Zeitlich begrenzte Artikel: heute erhältlich? (today im Format JJJJ-MM-TT)
export const isLimited = (item) => Boolean(item.from && item.until);
export const limitedOpen = (item, today) => isLimited(item) && today >= item.from && today <= item.until;
export function daysLeft(item, today) {
  const day = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  return Math.round((day(item.until) - day(today)) / 86_400_000) + 1;
}

// Direkt kaufbar: Preis > 0, weder legendär/mythisch noch Set-Bonus; Zeitlich begrenztes nur im Zeitraum
export const buyable = (item, today = null) =>
  item.price > 0 && !['legendary', 'mythic'].includes(item.rarity) && !item.bonus && (!isLimited(item) || (today !== null && limitedOpen(item, today)));

// Die feste Sammlung (ohne Zeitlich begrenztes und ohne Prestige) – wer die komplett hat, bekommt die Prestige-Truhe
export const COLLECTION = ALL_ITEMS.filter((item) => item.kind !== 'extras' && !isLimited(item) && item.rarity !== 'mythic');
export const MYTHIC_ITEMS = ALL_ITEMS.filter((item) => item.rarity === 'mythic');

export function setItems(setId) {
  return ALL_ITEMS.filter((item) => item.set === setId);
}
export function setBonus(setId) {
  return ALL_ITEMS.find((item) => item.bonus === setId) ?? null;
}
export function setProgress(setId, owned) {
  const items = setItems(setId);
  const have = items.filter((item) => owned.has(item.id)).length;
  return { have, total: items.length, complete: have === items.length };
}
