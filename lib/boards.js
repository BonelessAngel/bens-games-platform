// Anzeigenamen für Ranglisten (board). Spiele melden einfache Kennungen ohne Umlaute, z. B. „taeglich“.

const LABELS = {
  taeglich: 'Täglich',
  klassisch: 'Klassisch (Archiv)',
  standard: 'Normal',
  profi: 'Hart',
  endlos: 'Endlos',
  woechentlich: 'Wöchentlich',
  schwer: 'Schwer',
  leicht: 'Leicht',
  normal: 'Normal',
  // Drei Fronten: Summe der Sterne besiegter Gegner ohne Niederlage dazwischen
  ruhm: 'Ruhm-Serie',
};

export function boardLabel(board) {
  if (/^\d+$/.test(board)) return `Level ${board}`;
  if (LABELS[board]) return LABELS[board];
  // z. B. „tower-endless-3“ → „Tower Endless 3“, „heroic-5“ → „Heroic 5“
  const words = board.split(/[-_.]+/).filter(Boolean);
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') || board;
}
