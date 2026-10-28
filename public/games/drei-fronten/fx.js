// Effekte über dem Spielfeld: Blitze, Feuer, Wellen, Beben, Konfetti. Rein optisch, ohne Einfluss aufs Spiel.
// Die Effekte liegen in einer eigenen Ebene (position: fixed), weil das Spielfeld bei jedem Schritt neu gezeichnet wird.

const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function layer(rect, className, duration) {
  const element = document.createElement('div');
  element.className = `fx ${className}`;
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
  document.body.append(element);
  setTimeout(() => element.remove(), duration);
  return element;
}

// Fähigkeit oder Aktion → Effektart.
export const FX_OF = {
  blitz: 'blitz', donner: 'blitz', sturzflug: 'wind', frostwelle: 'frost',
  feuerball: 'feuer', meteor: 'feuer', drachenfeuer: 'feuer', glut: 'feuer', fernfeuer: 'feuer',
  flut: 'wasser', regen: 'heilung', raub: 'magie', krake: 'wasser', locken: 'magie',
  beben: 'beben', griff: 'erde', wolf: 'magie', teleport: 'magie', zeitriss: 'zeit', sprung: 'wind',
  schild: 'schild', schrei: 'gold', rune: 'gold', sporen: 'heilung', schmied: 'gold', dschinn: 'wind',
};

export function frontEffect(frontIndex, kind) {
  if (!kind || reduced()) return;
  const column = document.querySelector(`.front[data-front="${frontIndex}"]`);
  if (!column) return;
  const rect = column.getBoundingClientRect();
  const element = layer(rect, `fx-${kind}`, 1100);
  if (kind === 'blitz') {
    for (let i = 0; i < 3; i++) {
      const bolt = document.createElement('span');
      bolt.className = 'bolt';
      bolt.style.left = `${20 + Math.random() * 60}%`;
      bolt.style.animationDelay = `${i * 0.08}s`;
      element.append(bolt);
    }
  }
  if (kind === 'feuer' || kind === 'magie' || kind === 'gold' || kind === 'heilung' || kind === 'frost') {
    for (let i = 0; i < 14; i++) {
      const spark = document.createElement('span');
      spark.className = 'spark';
      spark.style.left = `${Math.random() * 100}%`;
      spark.style.animationDelay = `${Math.random() * 0.35}s`;
      spark.style.setProperty('--drift', `${(Math.random() - 0.5) * 60}px`);
      element.append(spark);
    }
  }
  if (kind === 'beben') shake(document.querySelector('#board'));
}

export function shake(element) {
  if (!element || reduced()) return;
  element.classList.remove('shake');
  void element.offsetWidth;
  element.classList.add('shake');
  setTimeout(() => element.classList.remove('shake'), 650);
}

// Leuchtender Ring um eine Karte auf dem Feld (z. B. beim Aufdecken einer legendären Karte).
export function cardBurst(uid, kind = 'glow') {
  if (reduced()) return;
  const chip = document.querySelector(`.chip[data-uid="${uid}"]`);
  if (!chip) return;
  layer(chip.getBoundingClientRect(), `fx-burst fx-burst-${kind}`, 900);
}

export function confetti(amount = 90) {
  if (reduced()) return;
  const colors = ['#ffd166', '#ff6b81', '#6ee7a0', '#5cc8ff', '#c58bff', '#fff'];
  for (let i = 0; i < amount; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti';
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.6}s`;
    piece.style.animationDuration = `${1.8 + Math.random() * 1.4}s`;
    piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 200}px`);
    piece.style.setProperty('--spin', `${Math.random() * 900 - 450}deg`);
    document.body.append(piece);
    setTimeout(() => piece.remove(), 3800);
  }
}
