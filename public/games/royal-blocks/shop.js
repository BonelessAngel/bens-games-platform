// Shop-Katalog. IDs bestehender Artikel bleiben stabil, damit frühere Käufe erhalten bleiben.

export const THEMES = [
  { id: 'neon', name: 'Neon', price: 0, color: '#0d0420' },
  { id: 'gold', name: 'Gold-Casino', price: 2100, color: '#041a12' },
  { id: 'ice', name: 'Eis', price: 4200, color: '#06182a' },
  { id: 'retro', name: 'Retro-Arcade', price: 7000, color: '#000000' },
];

export const TILE_STYLES = [
  { id: 'standard', name: 'Standard', price: 0 },
  { id: 'glass', name: 'Glas', price: 1400 },
  { id: 'pixel', name: 'Pixel', price: 2800 },
  { id: 'chip', name: 'Chip', price: 5600 },
];

export const EFFECTS = [
  { id: 'effect-classic', name: 'Neon-Funken', price: 0 },
  { id: 'effect-confetti', name: 'Konfetti', price: 1800 },
  { id: 'effect-pixel', name: 'Pixel-Regen', price: 2600 },
  { id: 'effect-fireworks', name: 'Feuerwerk', price: 3800 },
  { id: 'effect-sparks', name: 'Goldfunken', price: 4800 },
];

export const BACKGROUNDS = [
  { id: 'bg-classic', name: 'Neon-Nacht', price: 0 },
  { id: 'bg-felt', name: 'Casino-Filz', price: 1800 },
  { id: 'bg-stars', name: 'Sternennacht', price: 2800 },
  { id: 'bg-royal', name: 'Royal Gold', price: 4400 },
];

export const CARDS = [
  { id: 'card-classic', name: 'Klassisch', price: 0 },
  { id: 'card-casino', name: 'Casino', price: 1600 },
  { id: 'card-minimal', name: 'Minimal', price: 2600 },
  { id: 'card-neon', name: 'Neon-Symbole', price: 4000 },
];

export const START_BONUS = { id: 'start-bonus', name: 'Start-Bonus', price: 350 };
export const SHOP_ITEMS = {
  theme: THEMES, tiles: TILE_STYLES, effects: EFFECTS, backgrounds: BACKGROUNDS, cards: CARDS, extras: [START_BONUS],
};
export const SHOP_SETTING = { theme: 'theme', tiles: 'tiles', effects: 'effect', backgrounds: 'background', cards: 'cards' };
