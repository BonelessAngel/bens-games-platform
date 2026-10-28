// Deckbau-Regeln: Startdecks sind fest, zwei eigene Decks kann man frei zusammenstellen.

import { CARD_BY_ID, CARDS, DECKS } from './cards.js';

export const DECK_SIZE = 20;
export const MAX_COPIES = 2;
export const CUSTOM_IDS = ['eigen1', 'eigen2'];

export function isCustom(deckId) {
  return CUSTOM_IDS.includes(deckId);
}

export function copies(cards, cardId) {
  return cards.filter((id) => id === cardId).length;
}

// Wie oft eine Karte ins Deck darf: höchstens 2 und nicht mehr, als man besitzt (owned fehlt = alles erlaubt).
export function allowedCopies(cardId, owned) {
  return Math.min(MAX_COPIES, owned ? owned[cardId] ?? 0 : MAX_COPIES);
}

// Nur bekannte, sammelbare, besessene Karten und höchstens 20 insgesamt.
export function cleanDeck(cards, owned) {
  const result = [];
  for (const id of Array.isArray(cards) ? cards : []) {
    if (typeof id !== 'string' || !CARD_BY_ID[id] || CARD_BY_ID[id].token) continue;
    if (copies(result, id) >= allowedCopies(id, owned) || result.length >= DECK_SIZE) continue;
    result.push(id);
  }
  return result;
}

export function canAdd(cards, cardId, owned) {
  return cards.length < DECK_SIZE && Boolean(CARD_BY_ID[cardId]) && !CARD_BY_ID[cardId].token &&
    copies(cards, cardId) < allowedCopies(cardId, owned);
}

export function deckReady(cards) {
  return cards.length === DECK_SIZE;
}

export function averageCost(cards) {
  if (!cards.length) return 0;
  return cards.reduce((sum, id) => sum + CARD_BY_ID[id].cost, 0) / cards.length;
}

// Sortierung für Anzeigen: erst Wesen, dann Aktionen, jeweils nach Kosten und Name.
export function sortCards(ids) {
  return [...ids].sort((a, b) => {
    const x = CARD_BY_ID[a];
    const y = CARD_BY_ID[b];
    return (x.type === y.type ? 0 : x.type === 'wesen' ? -1 : 1) || x.cost - y.cost || x.name.localeCompare(y.name, 'de');
  });
}

export const ALL_CARD_IDS = sortCards(CARDS.map((card) => card.id));

// Startdeck für den Lehrling: das jeweils andere, bei eigenen Decks zufällig eins.
export function enemyDeckFor(deckId, random = Math.random) {
  if (deckId === 'flammen') return 'tiefen';
  if (deckId === 'tiefen') return 'flammen';
  const ids = Object.keys(DECKS);
  return ids[Math.floor(random() * ids.length)];
}
