// Rubbellos: drei Felder unter einer Rubbelschicht. Mit dem Finger freirubbeln; ab gut der Hälfte deckt es sich ganz auf.

const REVEAL_AT = 0.5;

export function createScratchCard(container, prize, onReveal) {
  container.replaceChildren();
  const card = document.createElement('div');
  card.className = 'scratch-card';
  const symbols = document.createElement('div');
  symbols.className = `scratch-symbols tier${prize.tier}`;
  for (const symbol of prize.symbols) {
    const cell = document.createElement('div');
    cell.className = 'scratch-cell';
    cell.textContent = symbol;
    symbols.append(cell);
  }
  const canvas = document.createElement('canvas');
  canvas.className = 'scratch-cover';
  card.append(symbols, canvas);
  container.append(card);

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const { width, height } = card.getBoundingClientRect();
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // Rubbelschicht: goldener Verlauf mit Muster und Hinweis
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#b8860b');
  grad.addColorStop(0.5, '#ffd34d');
  grad.addColorStop(1, '#b8860b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
  for (let x = -height; x < width; x += 14) {
    ctx.beginPath();
    ctx.moveTo(x, height);
    ctx.lineTo(x + height, 0);
    ctx.lineTo(x + height + 6, 0);
    ctx.lineTo(x + 6, height);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(60, 30, 0, 0.75)';
  ctx.font = `900 ${Math.round(height * 0.2)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('HIER RUBBELN', width / 2, height / 2);

  ctx.globalCompositeOperation = 'destination-out';
  const radius = Math.max(16, height * 0.16);
  let revealed = false;
  let last = null;

  function scratchTo(x, y) {
    ctx.lineWidth = radius * 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(last ? last.x : x, last ? last.y : y);
    ctx.lineTo(x, y);
    ctx.stroke();
    last = { x, y };
  }

  function clearedShare() {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let clear = 0;
    let total = 0;
    for (let i = 3; i < data.length; i += 4 * 16) {
      total++;
      if (data[i] === 0) clear++;
    }
    return clear / total;
  }

  function reveal() {
    if (revealed) return;
    revealed = true;
    canvas.classList.add('gone');
    onReveal(card);
  }

  const point = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  let checks = 0;
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    last = null;
    canvas.setPointerCapture?.(e.pointerId);
    const p = point(e);
    scratchTo(p.x, p.y);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!e.buttons && e.pointerType === 'mouse') return;
    const p = point(e);
    scratchTo(p.x, p.y);
    if (++checks % 6 === 0 && clearedShare() > REVEAL_AT) reveal();
  });
  canvas.addEventListener('pointerup', () => {
    last = null;
    if (clearedShare() > REVEAL_AT) reveal();
  });

  return { reveal };
}
