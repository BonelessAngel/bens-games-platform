// Alle Karten und Fronten von Drei Fronten.
// Wesen bleiben bis zum Rundenende an einer Front liegen, Aktionen wirken einmal beim Aufdecken.
// Fähigkeiten stehen als Schlüssel (ability) hier und werden in engine.js ausgeführt.

export const ELEMENTS = {
  feuer: { name: 'Feuer', icon: '🔥' },
  wasser: { name: 'Wasser', icon: '💧' },
  erde: { name: 'Erde', icon: '🪨' },
  luft: { name: 'Luft', icon: '🌪️' },
  neutral: { name: 'Neutral', icon: '✨' },
};

export const CARDS = [
  // Feuer
  { id: 'funkenkobold', type: 'wesen', name: 'Funken­kobold', element: 'feuer', cost: 1, power: 2, art: '👺', text: '' },
  { id: 'salamander', type: 'wesen', name: 'Feuer­salamander', element: 'feuer', cost: 2, power: 3, art: '🦎', ability: 'feuerrudel', text: 'Aufdecken: +1 für jedes andere deiner Feuer-Wesen hier.' },
  { id: 'glutgolem', type: 'wesen', name: 'Glut­golem', element: 'feuer', cost: 3, power: 4, art: '🌋', ability: 'glut', text: 'Aufdecken: Das schwächste gegnerische Wesen hier −1.' },
  { id: 'phoenix', type: 'wesen', name: 'Flammen­phönix', element: 'feuer', cost: 4, power: 5, art: '🐦‍🔥', ability: 'phoenix', text: 'Wird er zerstört, kehrt er in deine Hand zurück.' },
  { id: 'feuerdrache', type: 'wesen', name: 'Feuer­drache', element: 'feuer', cost: 5, power: 5, art: '🐉', ability: 'drachenfeuer', text: 'Aufdecken: Alle gegnerischen Wesen hier −1, deine anderen Feuer-Wesen hier +2.' },
  // Wasser
  { id: 'wellennixe', type: 'wesen', name: 'Wellen­nixe', element: 'wasser', cost: 1, power: 1, art: '🧜‍♀️', ability: 'ziehen', text: 'Aufdecken: Ziehe 1 Karte.' },
  { id: 'gezeitenhueterin', type: 'wesen', name: 'Gezeiten­hüterin', element: 'wasser', cost: 3, power: 2, art: '🐚', ability: 'huet', text: 'Dauerhaft: Deine anderen Wesen hier +1.' },
  { id: 'nebelkrake', type: 'wesen', name: 'Nebel­krake', element: 'wasser', cost: 3, power: 3, art: '🐙', ability: 'krake', text: 'Aufdecken: Das stärkste gegnerische Wesen hier −2.' },
  { id: 'eisgeist', type: 'wesen', name: 'Eisgeist', element: 'wasser', cost: 2, power: 3, art: '❄️', text: '' },
  { id: 'seeschlange', type: 'wesen', name: 'Tiefsee­schlange', element: 'wasser', cost: 5, power: 7, art: '🐍', text: '' },
  // Erde
  { id: 'steintroll', type: 'wesen', name: 'Stein­troll', element: 'erde', cost: 2, power: 4, art: '🧌', text: '' },
  { id: 'wurzelschrat', type: 'wesen', name: 'Wurzel­schrat', element: 'erde', cost: 2, power: 2, art: '🌳', ability: 'wurzel', text: 'Dauerhaft: +1 für jedes gegnerische Wesen hier.' },
  { id: 'moosgolem', type: 'wesen', name: 'Moos­golem', element: 'erde', cost: 3, power: 3, art: '🗿', ability: 'allein', text: 'Dauerhaft: +3, solange er dein einziges Wesen hier ist.' },
  { id: 'pilzkoenig', type: 'wesen', name: 'Pilz­könig', element: 'erde', cost: 4, power: 3, art: '🍄', ability: 'sporen', text: 'Aufdecken: Deine anderen Wesen hier +1.' },
  { id: 'waldriese', type: 'wesen', name: 'Wald­riese', element: 'erde', cost: 5, power: 7, art: '🌲', text: '' },
  // Luft
  { id: 'windfee', type: 'wesen', name: 'Windfee', element: 'luft', cost: 1, power: 1, art: '🧚', ability: 'rueckenwind', text: 'Aufdecken: +1 Energie im nächsten Zug.' },
  { id: 'sturmadler', type: 'wesen', name: 'Sturm­adler', element: 'luft', cost: 2, power: 3, art: '🦅', ability: 'sturzflug', text: 'Aufdecken: Ein zufälliges gegnerisches Wesen hier −1.' },
  { id: 'wolkenwal', type: 'wesen', name: 'Wolken­wal', element: 'luft', cost: 3, power: 5, art: '🐋', text: '' },
  { id: 'donnergreif', type: 'wesen', name: 'Donner­greif', element: 'luft', cost: 4, power: 4, art: '⛈️', ability: 'donner', text: 'Aufdecken: Alle gegnerischen Wesen hier −1.' },
  { id: 'sturmdschinn', type: 'wesen', name: 'Sturm­dschinn', element: 'luft', cost: 5, power: 5, art: '🧞', ability: 'dschinn', text: 'Aufdecken: Deine Wesen an den anderen Fronten +1.' },
  // Neutral
  { id: 'einhorn', type: 'wesen', name: 'Einhorn', element: 'neutral', cost: 3, power: 3, art: '🦄', ability: 'sporen', text: 'Aufdecken: Deine anderen Wesen hier +1.' },
  { id: 'mimik', type: 'wesen', name: 'Mimik', element: 'neutral', cost: 3, power: 1, art: '🎁', ability: 'mimik', text: 'Dauerhaft: So stark wie das stärkste gegnerische Wesen hier (ohne Boni).' },
  { id: 'gargoyle', type: 'wesen', name: 'Gargoyle', element: 'neutral', cost: 2, power: 3, art: '🦇', ability: 'stein', text: 'Kann nicht geschwächt werden.' },
  // Aktionen
  { id: 'blitzschlag', type: 'aktion', name: 'Blitz­schlag', element: 'neutral', cost: 2, art: '⚡', ability: 'blitz', text: 'Das stärkste gegnerische Wesen hier −3.' },
  { id: 'feuerball', type: 'aktion', name: 'Feuerball', element: 'feuer', cost: 3, art: '☄️', ability: 'feuerball', text: 'Zerstöre das schwächste gegnerische Wesen hier.' },
  { id: 'kraftrune', type: 'aktion', name: 'Kraft­rune', element: 'neutral', cost: 1, art: '🔮', ability: 'rune', text: 'Dein schwächstes Wesen hier +3.' },
  { id: 'schildzauber', type: 'aktion', name: 'Schild­zauber', element: 'neutral', cost: 1, art: '🛡️', ability: 'schild', text: 'Deine Wesen hier können in dieser Runde nicht geschwächt oder zerstört werden. Wirkt vor allen anderen Aktionen.' },
  { id: 'teleport', type: 'aktion', name: 'Teleport', element: 'luft', cost: 1, art: '🌀', ability: 'teleport', text: 'Dein stärkstes Wesen hier springt an die Front, an der du am weitesten zurückliegst.' },
  { id: 'beschwoerung', type: 'aktion', name: 'Wolfsruf', element: 'erde', cost: 2, art: '🐺', ability: 'wolf', text: 'Ruft einen Geisterwolf (Stärke 3) an diese Front.' },
  { id: 'kriegsschrei', type: 'aktion', name: 'Kriegs­schrei', element: 'neutral', cost: 3, art: '📯', ability: 'schrei', text: 'Alle deine Wesen an allen Fronten +1.' },
  { id: 'erdbeben', type: 'aktion', name: 'Erdbeben', element: 'erde', cost: 3, art: '💥', ability: 'beben', text: 'Alle Wesen hier −2 – auf beiden Seiten!' },
  { id: 'gedankenraub', type: 'aktion', name: 'Gedanken­raub', element: 'wasser', cost: 1, art: '🧠', ability: 'raub', text: 'Ziehe 2 Karten.' },
  { id: 'flutwelle', type: 'aktion', name: 'Flutwelle', element: 'wasser', cost: 4, art: '🌊', ability: 'flut', text: 'Alle gegnerischen Wesen hier −2.' },

  // Erweiterung „Erwachen der Tiefe“ (v0.5.0) – nur aus Paketen.
  { id: 'lavawurm', type: 'wesen', name: 'Lava­wurm', element: 'feuer', cost: 2, power: 2, art: '🪱', ability: 'lauer', text: 'Aufdecken: +2, wenn hier schon ein gegnerisches Wesen liegt.' },
  { id: 'aschekrieger', type: 'wesen', name: 'Asche­krieger', element: 'feuer', cost: 3, power: 4, art: '🗡️', text: '' },
  { id: 'feuerfuchs', type: 'wesen', name: 'Feuer­fuchs', element: 'feuer', cost: 2, power: 2, art: '🦊', ability: 'fernfeuer', text: 'Aufdecken: Ein zufälliges gegnerisches Wesen an einer anderen Front −2.' },
  { id: 'korallenwaechter', type: 'wesen', name: 'Korallen­wächter', element: 'wasser', cost: 2, power: 2, art: '🪸', ability: 'schwarm', text: 'Dauerhaft: +1 für jedes andere deiner Wasser-Wesen hier.' },
  { id: 'sirene', type: 'wesen', name: 'Sirene', element: 'wasser', cost: 4, power: 3, art: '🧜', ability: 'locken', text: 'Aufdecken: Das stärkste gegnerische Wesen hier wird an eine andere Front gelockt.' },
  { id: 'eiskoenigin', type: 'wesen', name: 'Eis­königin', element: 'wasser', cost: 6, power: 6, art: '👸', ability: 'frostwelle', text: 'Aufdecken: Alle gegnerischen Wesen an ALLEN Fronten −1.' },
  { id: 'schildkroete', type: 'wesen', name: 'Felsen­schildkröte', element: 'erde', cost: 3, power: 5, art: '🐢', text: '' },
  { id: 'dornenranke', type: 'wesen', name: 'Dornen­ranke', element: 'erde', cost: 2, power: 1, art: '🌵', ability: 'dornen', text: 'Dauerhaft: Gegnerische Wesen hier −1.' },
  { id: 'weltenbaum', type: 'wesen', name: 'Welten­baum', element: 'erde', cost: 6, power: 5, art: '🌳', ability: 'weltenbaum', text: 'Dauerhaft: Deine anderen Wesen an ALLEN Fronten +1.' },
  { id: 'sylphe', type: 'wesen', name: 'Wirbel­sylphe', element: 'luft', cost: 2, power: 2, art: '💨', ability: 'rueckenwind', text: 'Aufdecken: +1 Energie im nächsten Zug.' },
  { id: 'pegasus', type: 'wesen', name: 'Sturm­pegasus', element: 'luft', cost: 3, power: 4, art: '🐎', ability: 'sprung', text: 'Aufdecken: Fliegt an die Front, an der du am weitesten zurückliegst.' },
  { id: 'runenschmied', type: 'wesen', name: 'Runen­schmied', element: 'neutral', cost: 4, power: 3, art: '⚒️', ability: 'schmied', text: 'Aufdecken: Deine anderen Wesen hier mit Stärke 3 oder weniger +2.' },
  { id: 'meteorschauer', type: 'aktion', name: 'Meteor­schauer', element: 'feuer', cost: 5, art: '🌠', ability: 'meteor', text: 'Alle gegnerischen Wesen an ALLEN Fronten −2.' },
  { id: 'heilregen', type: 'aktion', name: 'Heilender Regen', element: 'wasser', cost: 2, art: '🌧️', ability: 'regen', text: 'Alle deine Wesen hier +2.' },
  { id: 'wurzelgriff', type: 'aktion', name: 'Wurzel­griff', element: 'erde', cost: 2, art: '🌿', ability: 'griff', text: 'Zerstöre ein gegnerisches Wesen hier mit Stärke 2 oder weniger.' },
  { id: 'zeitriss', type: 'aktion', name: 'Zeitriss', element: 'luft', cost: 2, art: '⏳', ability: 'zeitriss', text: 'Diese Front zählt bei der Wertung doppelt.' },
];

// Seltenheit jeder Karte. Startdeck-Karten besitzt man von Anfang an, der Rest kommt aus Paketen.
export const RARITIES = {
  gewoehnlich: { name: 'Gewöhnlich', refund: 5 },
  selten: { name: 'Selten', refund: 15 },
  episch: { name: 'Episch', refund: 40 },
  legendaer: { name: 'Legendär', refund: 120 },
};
const RARITY_OF = {
  gewoehnlich: [
    'funkenkobold', 'salamander', 'wellennixe', 'eisgeist', 'steintroll', 'wurzelschrat', 'windfee', 'sturmadler', 'gargoyle',
    'kraftrune', 'gedankenraub', 'blitzschlag', 'lavawurm', 'aschekrieger', 'korallenwaechter', 'schildkroete', 'sylphe', 'heilregen',
  ],
  selten: [
    'glutgolem', 'gezeitenhueterin', 'nebelkrake', 'moosgolem', 'pilzkoenig', 'wolkenwal', 'einhorn', 'mimik', 'feuerball',
    'schildzauber', 'teleport', 'beschwoerung', 'feuerfuchs', 'dornenranke', 'pegasus', 'wurzelgriff',
  ],
  episch: ['phoenix', 'seeschlange', 'waldriese', 'donnergreif', 'kriegsschrei', 'erdbeben', 'flutwelle', 'sirene', 'runenschmied', 'meteorschauer'],
  legendaer: ['feuerdrache', 'sturmdschinn', 'eiskoenigin', 'weltenbaum', 'zeitriss'],
};
for (const [rarity, ids] of Object.entries(RARITY_OF)) {
  for (const id of ids) {
    const card = CARDS.find((entry) => entry.id === id);
    if (!card) throw new Error(`Seltenheit für unbekannte Karte ${id}`);
    card.rarity = rarity;
  }
}

// Nur über Aktionen ins Spiel, nicht im Deck.
export const TOKENS = [
  { id: 'geisterwolf', token: true, type: 'wesen', name: 'Geister­wolf', element: 'erde', cost: 0, power: 3, art: '🐺', text: 'Gerufen durch Wolfsruf.' },
];

export const FRONTS = [
  { id: 'vulkan', name: 'Vulkanhang', art: '🌋', element: 'feuer', text: 'Feuer-Wesen hier +2.' },
  { id: 'gezeitensee', name: 'Gezeitensee', art: '🌊', element: 'wasser', text: 'Wasser-Wesen hier +2.' },
  { id: 'urwald', name: 'Urwald', art: '🌳', element: 'erde', text: 'Erde-Wesen hier +2.' },
  { id: 'sturmgipfel', name: 'Sturmgipfel', art: '🏔️', element: 'luft', text: 'Luft-Wesen hier +2.' },
  { id: 'blutmond', name: 'Blutmond-Lichtung', art: '🌕', rule: 'blutmond', text: 'Alle Wesen hier +1.' },
  { id: 'nebelmoor', name: 'Nebelmoor', art: '🌫️', rule: 'nebel', text: 'Karten hier bleiben bis zur Wertung verdeckt.' },
  { id: 'lawinenpass', name: 'Lawinenpass', art: '🏔️', rule: 'lawine', text: 'Nach dem 1. Aufdecken wird das schwächste Wesen hier zerstört.' },
  { id: 'drachenhort', name: 'Drachenhort', art: '💰', rule: 'hort', text: 'Diese Front zählt bei der Wertung doppelt.' },
  { id: 'zauberturm', name: 'Zauberturm', art: '🗼', rule: 'turm', text: 'Aktionen kosten hier 1 Energie weniger.' },
  { id: 'engpass', name: 'Schmaler Engpass', art: '🚪', rule: 'eng', text: 'Nur 2 Wesen pro Seite.' },
  { id: 'ruinen', name: 'Alte Ruinen', art: '🏛️', rule: 'ruinen', text: 'Wesen mit Kosten 1–2 hier +2.' },
  { id: 'frostfeld', name: 'Frostfeld', art: '🧊', rule: 'frost', text: 'Alle Wesen hier −1, außer Wasser-Wesen.' },
  { id: 'spiegelsee', name: 'Spiegelsee', art: '🪞', rule: 'spiegel', text: 'Hier gewinnt die SCHWÄCHERE Seite (mit mindestens einem Wesen).' },
];

export const CARD_BY_ID = Object.fromEntries([...CARDS, ...TOKENS].map((card) => [card.id, card]));
export const FRONT_BY_ID = Object.fromEntries(FRONTS.map((front) => [front.id, front]));

// Startdecks mit je 20 Karten.
export const DECKS = {
  flammen: {
    name: 'Flammen & Sturm',
    cards: [
      'funkenkobold', 'funkenkobold', 'salamander', 'salamander', 'glutgolem', 'phoenix', 'feuerdrache',
      'windfee', 'sturmadler', 'sturmadler', 'wolkenwal', 'donnergreif', 'sturmdschinn',
      'gargoyle', 'einhorn', 'blitzschlag', 'feuerball', 'kraftrune', 'teleport', 'kriegsschrei',
    ],
  },
  tiefen: {
    name: 'Wald & Tiefe',
    cards: [
      'wellennixe', 'eisgeist', 'gezeitenhueterin', 'nebelkrake', 'seeschlange', 'seeschlange',
      'steintroll', 'steintroll', 'wurzelschrat', 'moosgolem', 'pilzkoenig', 'waldriese',
      'mimik', 'gargoyle', 'schildzauber', 'beschwoerung', 'erdbeben', 'waldriese', 'flutwelle', 'kraftrune',
    ],
  },
};
