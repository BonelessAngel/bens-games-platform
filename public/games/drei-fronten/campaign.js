// Kampagne „Der Weg des Feldherrn“: 8 Kapitel mit kleiner Geschichte und je einer Sonderregel.
// rules geht direkt an createGame (goal, banners, fixedFront, extraEnergy). reward.card kommt in die Sammlung.

export const CHAPTERS = [
  {
    id: 1, title: 'Der erste Schritt', opponent: 'lio',
    story: 'Am Rand des Reichs stehen drei alte Schlachtfelder. Wer sie hält, darf sich Feldherr nennen. Lio, ein junger Lehrling, will dir zeigen, wie man kämpft – oder eher üben.',
    tip: 'Kurzes Duell: Wer zuerst 2 Banner hat, gewinnt. Leg in jedem Zug so viele Karten, wie deine Energie erlaubt.',
    rules: { goal: 2 },
    reward: { coins: 100, card: 'aschekrieger' },
  },
  {
    id: 2, title: 'Nebel über dem Moor', opponent: 'morwen',
    story: 'Im Nebelmoor wohnt Morwen, die Hexe der Gezeiten. Sie liebt es, ihre Karten zu verstecken – und dich zu überraschen.',
    tip: 'Das Nebelmoor ist jede Runde dabei. Dort siehst du die Karten des Gegners erst bei der Wertung!',
    rules: { goal: 3, fixedFront: 'nebelmoor' },
    reward: { coins: 120, card: 'korallenwaechter' },
  },
  {
    id: 3, title: 'Die Trommeln von Grom', opponent: 'grom',
    story: 'Aus den Bergen dröhnt Trommelschlag. Grom der Berserker trommelt bei jeder Gelegenheit – auch wenn er schlechte Karten hat.',
    tip: 'Grom blufft gern. Geh mit, wenn deine Fronten gut stehen – gib auf, wenn nicht.',
    rules: { goal: 3 },
    reward: { coins: 150, card: 'lavawurm' },
  },
  {
    id: 4, title: 'Spiegelungen', opponent: 'aeris',
    story: 'Am Spiegelsee ist alles verkehrt herum. Aeris, die Sturmweberin, hat dort gelernt, ihre Wesen blitzschnell zu verschieben.',
    tip: 'Der Spiegelsee ist jede Runde dabei: Dort gewinnt die SCHWÄCHERE Seite. Ein einzelnes kleines Wesen kann reichen!',
    rules: { goal: 3, fixedFront: 'spiegelsee' },
    reward: { coins: 150, card: 'pegasus' },
  },
  {
    id: 5, title: 'Im Sturm', opponent: 'aeris',
    story: 'Aeris will Revanche. Diesmal hat sie sich einen Vorsprung erschlichen – sie startet mit einem Banner.',
    tip: 'Der Gegner beginnt mit 1 Banner, gespielt wird bis 4. Die Kriegstrommel kann dir helfen, schnell aufzuholen.',
    rules: { goal: 4, banners: [0, 1] },
    reward: { coins: 180, card: 'dornenranke' },
  },
  {
    id: 6, title: 'Der Hort', opponent: 'silva',
    story: 'Tief im Urwald hütet Silva die Druidin einen alten Drachenhort. Wer ihn erobert, gewinnt doppelt.',
    tip: 'Der Drachenhort ist jede Runde dabei und zählt doppelt. Schick dorthin deine Stärksten!',
    rules: { goal: 4, fixedFront: 'drachenhort' },
    reward: { coins: 200, card: 'sirene' },
  },
  {
    id: 7, title: 'Übermacht', opponent: 'varok',
    story: 'Varok der Kriegsherr hat von dir gehört. Seine Armee ist größer – in jedem Zug hat er 1 Energie mehr als du.',
    tip: 'Der Gegner hat in jedem Zug +1 Energie. Kämpf klug: Du musst nur 2 von 3 Fronten gewinnen, nicht alle.',
    rules: { goal: 3, extraEnergy: [0, 1] },
    reward: { coins: 250, card: 'runenschmied' },
  },
  {
    id: 8, title: 'Der letzte Feldherr', opponent: 'varok',
    story: 'Die letzte Schlacht. Varok setzt alles auf eine Karte – und startet mit einem Banner Vorsprung. Wer hier gewinnt, wird zum Feldherrn der drei Fronten.',
    tip: 'Langes Duell bis 5 Banner, der Gegner startet mit 1. Nutze alles, was du gelernt hast!',
    rules: { goal: 5, banners: [0, 1] },
    reward: { coins: 400, card: 'weltenbaum' },
  },
];

export const CHAPTER_BY_ID = Object.fromEntries(CHAPTERS.map((chapter) => [chapter.id, chapter]));
