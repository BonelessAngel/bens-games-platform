// Partikel (Funken und Chips) auf einer Leinwand über dem ganzen Bildschirm.

// Farben kommen aus dem aktiven Design (CSS-Variablen --s0..--s3 und --gold).
const cssColor = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#ffffff';
export const suitColor = (s) => (s >= 0 && s <= 3 ? cssColor('--s' + s) : cssColor('--gold'));

let canvas;
let ctx;
let particles = [];
let running = false;
let dpr = 1;
let fxStyle = 'effect-classic';
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function setFxStyle(style) {
  fxStyle = style;
}

export function initFx(el) {
  canvas = el;
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
}

// Funken an einer Bildschirmposition. power 1 = normal, größer = mehr und weiter.
export function burst(x, y, color, power = 1) {
  if (reduceMotion) return;
  const multiplier = fxStyle === 'effect-fireworks' ? 2.2 : fxStyle === 'effect-confetti' ? 1.7 : 1;
  const count = Math.round(7 * power * multiplier);
  for (let k = 0; k < count; k++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (1.5 + Math.random() * 4) * Math.sqrt(power);
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 1,
      decay: 0.018 + Math.random() * 0.02,
      size: 2 + Math.random() * 3.5,
      color: fxStyle === 'effect-sparks' ? cssColor('--gold') : Math.random() < 0.15 ? '#ffffff' : color,
      kind: fxStyle,
    });
  }
  start();
}

// Casino-Chips, die hochspringen und herunterfallen
export function chips(x, y, count) {
  if (reduceMotion) return;
  for (let k = 0; k < count; k++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 10,
      vy: -6 - Math.random() * 8,
      life: 1,
      decay: 0.008 + Math.random() * 0.006,
      size: 7 + Math.random() * 5,
      color: suitColor(Math.floor(Math.random() * 5) - 1),
      spin: Math.random() * Math.PI,
      kind: 'chip',
    });
  }
  start();
}

function start() {
  if (!running) {
    running = true;
    requestAnimationFrame(frame);
  }
}

function frame() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'lighter';
  particles = particles.filter((p) => p.life > 0);
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.kind === 'chip' ? 0.35 : p.kind === 'effect-confetti' ? 0.2 : 0.12;
    p.vx *= 0.98;
    p.life -= p.decay;
    ctx.globalAlpha = Math.max(p.life, 0);
    ctx.fillStyle = p.color;
    if (p.kind === 'chip') {
      ctx.globalCompositeOperation = 'source-over';
      p.spin += 0.2;
      const squash = Math.abs(Math.cos(p.spin));
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.size, p.size * Math.max(squash, 0.15), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.size * 0.65, p.size * 0.65 * Math.max(squash, 0.15), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalCompositeOperation = 'lighter';
    } else if (p.kind === 'effect-pixel' || p.kind === 'effect-confetti') {
      const size = p.size * (p.kind === 'effect-confetti' ? 1.8 : 1.2);
      ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + p.life * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  if (particles.length) requestAnimationFrame(frame);
  else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    running = false;
  }
}
