// Gegner mit eigener Persönlichkeit: Deck, Spielstärke, Trommel-Mut und Sprüche.
// portrait = Karten-ID, deren Bild als Porträt dient. deck = null heißt: passendes Startdeck bzw. Zufallsdeck.

export const OPPONENTS = [
  {
    id: 'lio', name: 'Lio', title: 'der Lehrling', portrait: 'funkenkobold', level: 'lehrling', stars: 1, boldness: 0,
    deck: null,
    intro: 'Oh, ein Duell? Ich hab erst gestern gelernt, wie man trommelt …',
    win: 'Hab ich echt gewonnen?! Das muss ich meinem Meister erzählen!',
    lose: 'Gut gespielt! Ich übe weiter.',
  },
  {
    id: 'morwen', name: 'Morwen', title: 'die Nebelhexe', portrait: 'gezeitenhueterin', level: 'geselle', stars: 2, boldness: 0.05,
    deck: [
      'wellennixe', 'wellennixe', 'eisgeist', 'eisgeist', 'korallenwaechter', 'korallenwaechter', 'nebelkrake', 'nebelkrake',
      'gezeitenhueterin', 'sirene', 'seeschlange', 'eiskoenigin', 'mimik', 'mimik', 'gedankenraub', 'gedankenraub',
      'flutwelle', 'heilregen', 'heilregen', 'schildzauber',
    ],
    intro: 'Die Gezeiten flüstern mir deine Züge zu …',
    win: 'Der Nebel verschluckt alle, die mich unterschätzen.',
    lose: 'Hm. Die Strömung war heute gegen mich.',
  },
  {
    id: 'grom', name: 'Grom', title: 'der Berserker', portrait: 'steintroll', level: 'geselle', stars: 2, boldness: 0.25,
    deck: [
      'funkenkobold', 'funkenkobold', 'lavawurm', 'lavawurm', 'aschekrieger', 'aschekrieger', 'salamander', 'salamander',
      'steintroll', 'steintroll', 'glutgolem', 'schildkroete', 'schildkroete', 'feuerfuchs', 'erdbeben', 'feuerball',
      'feuerball', 'kriegsschrei', 'waldriese', 'feuerdrache',
    ],
    intro: 'GROM TROMMELT! GROM GIBT NIE AUF!',
    win: 'HA! Lauter trommeln gewinnt immer!',
    lose: 'Grom … braucht neue Trommel.',
  },
  {
    id: 'aeris', name: 'Aeris', title: 'die Sturmweberin', portrait: 'sturmdschinn', level: 'geselle', stars: 2, boldness: 0.1,
    deck: [
      'windfee', 'windfee', 'sylphe', 'sylphe', 'sturmadler', 'sturmadler', 'wolkenwal', 'wolkenwal', 'pegasus', 'pegasus',
      'donnergreif', 'sturmdschinn', 'teleport', 'teleport', 'zeitriss', 'blitzschlag', 'blitzschlag', 'einhorn', 'gargoyle',
      'kraftrune',
    ],
    intro: 'Der Wind trägt meine Krieger dorthin, wo du sie nicht erwartest.',
    win: 'Wie ein Sturm – schnell und unaufhaltsam.',
    lose: 'Der Wind hat gedreht. Respekt.',
  },
  {
    id: 'silva', name: 'Silva', title: 'die Druidin', portrait: 'pilzkoenig', level: 'kriegsherr', stars: 3, boldness: 0.05,
    deck: [
      'wurzelschrat', 'wurzelschrat', 'dornenranke', 'dornenranke', 'moosgolem', 'steintroll', 'steintroll', 'pilzkoenig',
      'pilzkoenig', 'schildkroete', 'waldriese', 'weltenbaum', 'beschwoerung', 'beschwoerung', 'wurzelgriff', 'wurzelgriff',
      'kraftrune', 'heilregen', 'einhorn', 'runenschmied',
    ],
    intro: 'Der Wald ist geduldig. Ich bin es auch.',
    win: 'Alles wächst zurück. Auch deine Niederlage wird dich wachsen lassen.',
    lose: 'Ein starker Trieb. Du wirst noch weit kommen.',
  },
  {
    id: 'varok', name: 'Varok', title: 'der Kriegsherr', portrait: 'feuerdrache', level: 'kriegsherr', stars: 3, boldness: 0.1,
    deck: 'zufall',
    intro: 'Drei Fronten. Ein Sieger. Und das bin ich.',
    win: 'Knie nieder. Vielleicht lernst du etwas.',
    lose: 'Unmöglich … Du bist ein würdiger Feldherr.',
  },
];

export const OPPONENT_BY_ID = Object.fromEntries(OPPONENTS.map((opponent) => [opponent.id, opponent]));
