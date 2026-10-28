// Geführte Übungspartie: feste Fronten, feste Hände, fester Gegnerzug – Schritt für Schritt erklärt.
// Ziel: 1 Banner. Der Spieler gewinnt Urwald und Gezeitensee, verliert den Vulkan – und lernt: 2 von 3 reichen.

export const TUTORIAL = {
  fronts: ['urwald', 'vulkan', 'gezeitensee'],
  hand: ['steintroll', 'eisgeist', 'blitzschlag', 'funkenkobold', 'wellennixe'],
  enemyHand: ['funkenkobold', 'windfee', 'salamander', 'glutgolem', 'kraftrune'],
  // Was Lio in welchem Zug legt: [Karte, Front].
  enemyPlan: {
    1: [['funkenkobold', 1], ['windfee', 2]],
    2: [['salamander', 1]],
    3: [['glutgolem', 0]],
  },
  // Schritte je Zug. info = mit „Weiter“, place = genau diese Karte an diese Front, ready = „Aufdecken!“ drücken.
  steps: {
    1: [
      { type: 'info', text: 'Willkommen zur Übung! Oben siehst du drei Fronten. Wer an 2 von 3 Fronten stärker ist, gewinnt die Runde und bekommt ein Banner.' },
      { type: 'info', front: 0, text: 'Jede Front hat ein Ereignis. Der Urwald macht Erde-Wesen um +2 stärker.' },
      { type: 'place', card: 'steintroll', front: 0, text: 'Zieh den Steintroll nach oben auf den Urwald – oder tippe erst die Karte und dann den Urwald an.' },
      { type: 'ready', text: 'Super! Jetzt „Aufdecken!“ drücken. Lio legt gleichzeitig und verdeckt seine Karten.' },
    ],
    2: [
      { type: 'info', text: 'Jetzt siehst du, was Lio gelegt hat. Am Gezeitensee steht nur eine schwache Windfee (Stärke 1).' },
      { type: 'place', card: 'eisgeist', front: 2, text: 'Leg den Eisgeist an den Gezeitensee – Wasser-Wesen bekommen dort +2.' },
      { type: 'ready', text: 'Aufdecken! Jede Runde hat drei Züge: Aufmarsch, Verstärkung und Finale.' },
    ],
    3: [
      { type: 'info', front: 1, text: 'Am Vulkan ist Lio stark – Feuer-Wesen bekommen dort +2. Aktionskarten wie Blitzschlag schwächen gegnerische Wesen.' },
      { type: 'place', card: 'blitzschlag', front: 1, text: 'Spiel den Blitzschlag auf den Vulkan. Er trifft das stärkste gegnerische Wesen dort mit −3.' },
      { type: 'ready', text: 'Das ist das Finale. Nach dem Aufdecken wird gewertet!' },
    ],
  },
  reward: 100,
};
