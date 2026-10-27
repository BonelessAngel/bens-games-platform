// Töne werden im Browser erzeugt (Web Audio), es gibt keine Tondateien.

let ctx = null;
let master = null;
let enabled = true;

export function setSoundEnabled(on) {
  enabled = on;
}

// Browser erlauben Ton erst nach einer Berührung; wird bei der ersten Eingabe aufgerufen.
export function unlockAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return;
  }
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  ctx = new AudioCtx();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);
  startMusic();
}

// Sound-Pakete aus dem Shop: verändern Klangfarbe, Tonhöhe und Ausklang aller Spielgeräusche
let pack = 'sound-classic';
export function setSoundPack(id) {
  pack = id;
}
const PACKS = {
  'sound-retro': (o) => ({ ...o, type: 'square', vol: o.vol * 0.55, dur: Math.max(0.05, o.dur * 0.8) }),
  'sound-casino': (o) => ({ ...o, type: 'triangle', dur: o.dur * 1.4, bell: true }),
  'sound-jazz': (o) => ({ ...o, type: 'sine', freq: o.freq * 0.84, dur: o.dur * 1.5, vol: o.vol * 0.9 }),
  'sound-crystal': (o) => ({ ...o, type: 'sine', freq: o.freq * 1.5, dur: o.dur * 2, vol: o.vol * 0.7, bell: true }),
};

function tone(freq, options = {}) {
  const o = (PACKS[pack] ?? ((x) => x))({ freq, start: 0, dur: 0.15, type: 'sine', vol: 0.5, slide: 0, ...options });
  rawTone(o.freq, o);
  if (o.bell) rawTone(o.freq * 2.76, { ...o, vol: o.vol * 0.18, dur: o.dur * 0.7 });
}

function rawTone(freq, { start = 0, dur = 0.15, type = 'sine', vol = 0.5, slide = 0 } = {}) {
  if (!enabled || !ctx) return;
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// Pentatonik: klingt bei jeder Kombination harmonisch
const SCALE = [0, 2, 4, 7, 9];
const note = (step) => 440 * 2 ** ((SCALE[step % 5] + 12 * Math.floor(step / 5) - 9) / 12);

export const sounds = {
  pickup() {
    tone(660, { dur: 0.06, type: 'triangle', vol: 0.25 });
  },
  place() {
    tone(180, { dur: 0.09, type: 'triangle', vol: 0.6, slide: 0.6 });
    tone(900, { dur: 0.04, type: 'square', vol: 0.06 });
  },
  invalid() {
    tone(140, { dur: 0.14, type: 'sawtooth', vol: 0.12, slide: 0.8 });
  },
  // level = Stärke der Pokerhand (0..9), streak = laufende Serie
  // Plopp-Kette: jedes verschwindende Kästchen ein Ton, immer etwas höher
  pop(k, level) {
    tone(note(7 + Math.min(k, 14)), { dur: 0.09, type: 'sine', vol: 0.32 });
    tone(note(12 + Math.min(k, 14)) * (1 + level * 0.01), { dur: 0.04, type: 'triangle', vol: 0.08 });
  },
  clear(level, streak, combo) {
    const base = 5 + Math.min(streak, 6);
    const count = 3 + Math.min(level, 5);
    for (let k = 0; k < count; k++) {
      tone(note(base + k), { start: k * 0.05, dur: 0.22, type: 'triangle', vol: 0.35 });
    }
    if (combo > 1) tone(note(base + count + 2), { start: count * 0.05, dur: 0.4, type: 'sine', vol: 0.4 });
    if (level >= 4) {
      // starke Hand: Akkord mit Glitzern
      [0, 2, 4].forEach((s) => tone(note(base + 5 + s), { start: 0.3, dur: 0.7, type: 'sine', vol: 0.25 }));
      for (let k = 0; k < 6; k++) tone(note(base + 10 + k), { start: 0.35 + k * 0.04, dur: 0.12, type: 'square', vol: 0.05 });
    }
  },
  chips(count) {
    const n = Math.min(8, 2 + Math.floor(count / 10));
    for (let k = 0; k < n; k++) tone(2400 + Math.random() * 900, { start: 0.25 + k * 0.045, dur: 0.06, type: 'square', vol: 0.05 });
  },
  mission() {
    [0, 4, 7, 12].forEach((s, k) => tone(note(10) * 2 ** (s / 12), { start: k * 0.08, dur: 0.25, type: 'triangle', vol: 0.3 }));
  },
  joker() {
    for (let k = 0; k < 8; k++) tone(note(10 + k), { start: k * 0.03, dur: 0.1, type: 'sine', vol: 0.2 });
  },
  power() {
    tone(300, { dur: 0.25, type: 'sawtooth', vol: 0.15, slide: 3 });
  },
  blocked() {
    tone(110, { dur: 0.35, type: 'sawtooth', vol: 0.18, slide: 0.7 });
    tone(116, { start: 0.02, dur: 0.35, type: 'square', vol: 0.08, slide: 0.7 });
    tone(80, { start: 0.12, dur: 0.3, type: 'triangle', vol: 0.4, slide: 0.8 });
  },
  levelUp() {
    [0, 2, 4, 5, 7].forEach((s, k) => tone(note(5 + s), { start: k * 0.09, dur: 0.3, type: 'square', vol: 0.12 }));
    tone(note(15), { start: 0.5, dur: 0.6, type: 'triangle', vol: 0.35 });
  },
  // Mega-Kombo: tiefer Schlag und aufsteigender Akkord-Lauf
  mega(lines) {
    tone(70, { dur: 0.5, type: 'sine', vol: 0.8, slide: 0.5 });
    const steps = 6 + lines * 2;
    for (let k = 0; k < steps; k++) tone(note(5 + k), { start: 0.08 + k * 0.045, dur: 0.25, type: 'square', vol: 0.09 });
    [0, 2, 4].forEach((s) => tone(note(10 + steps + s), { start: 0.1 + steps * 0.045, dur: 0.9, type: 'triangle', vol: 0.28 }));
  },
  tableClear() {
    for (let k = 0; k < 10; k++) tone(note(8 + k), { start: k * 0.06, dur: 0.3, type: 'triangle', vol: 0.3 });
  },
  record() {
    [0, 2, 4, 7].forEach((s, k) => tone(note(10 + s), { start: k * 0.12, dur: 0.35, type: 'triangle', vol: 0.35 }));
  },
  gameOver() {
    [7, 4, 2, 0].forEach((s, k) => tone(note(5 + s), { start: k * 0.16, dur: 0.4, type: 'sine', vol: 0.3 }));
  },
};

// Sieges-Jingles aus dem Shop: kurze Melodie bei starken Händen und beim Jackpot (unabhängig vom Sound-Paket)
const n = (semis) => 523.25 * 2 ** (semis / 12); // ab C5
const JINGLES = {
  'jingle-fanfare': () => [[0, 0], [4, 0.12], [7, 0.24], [12, 0.36]].forEach(([s, at], k) =>
    rawTone(n(s), { start: at, dur: k === 3 ? 0.6 : 0.16, type: 'sawtooth', vol: 0.12 })),
  'jingle-arcade': () => [0, 4, 7, 12, 16, 19, 24].forEach((s, k) =>
    rawTone(n(s), { start: k * 0.05, dur: 0.07, type: 'square', vol: 0.1 })),
  'jingle-slot': () => {
    for (let k = 0; k < 8; k++) rawTone(n(24 + (k % 2 ? 4 : 0)), { start: k * 0.07, dur: 0.12, type: 'triangle', vol: 0.18 });
    rawTone(n(12), { start: 0.6, dur: 0.5, type: 'triangle', vol: 0.25 });
  },
  'jingle-harp': () => [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24].forEach((s, k) =>
    rawTone(n(s), { start: k * 0.035, dur: 0.6, type: 'sine', vol: 0.12 })),
  // Gruselorgel: düsterer Moll-Lauf abwärts mit tiefem Grundton
  'jingle-spooky': () => {
    [12, 11, 8, 7, 3, 0].forEach((s, k) => rawTone(n(s - 12), { start: k * 0.11, dur: 0.3, type: 'sawtooth', vol: 0.08 }));
    rawTone(n(-24), { start: 0.5, dur: 1.1, type: 'sawtooth', vol: 0.1 });
    rawTone(n(-21), { start: 0.5, dur: 1.1, type: 'triangle', vol: 0.12 });
  },
  // Schlittenglocken: helles Klingeln und eine kleine Melodie
  'jingle-bells': () => {
    for (let k = 0; k < 10; k++) rawTone(n(31 + (k % 3)), { start: k * 0.045, dur: 0.08, type: 'triangle', vol: 0.08 });
    [4, 4, 4, 4, 4, 4, 4, 7, 0, 2, 4].forEach((s, k) => rawTone(n(s + 12), { start: 0.12 + k * 0.09, dur: 0.14, type: 'triangle', vol: 0.16 }));
  },
  // Königsfanfare: große Fanfare mit Pauke
  'jingle-midas': () => {
    rawTone(n(-24), { dur: 0.6, type: 'sine', vol: 0.5, slide: 0.7 });
    [[0, 0], [0, 0.1], [7, 0.2], [12, 0.38], [16, 0.5], [19, 0.62]].forEach(([s, at], k) =>
      rawTone(n(s), { start: at, dur: k === 5 ? 0.9 : 0.14, type: 'sawtooth', vol: 0.12 }));
    [0, 4, 7].forEach((s) => rawTone(n(s + 12), { start: 0.62, dur: 1, type: 'triangle', vol: 0.12 }));
  },
  'jingle-orchestra': () => {
    [[-12, 0], [-5, 0], [0, 0], [4, 0]].forEach(([s]) => rawTone(n(s), { dur: 1.2, type: 'triangle', vol: 0.14 }));
    [[7, 0.3], [12, 0.45], [16, 0.6]].forEach(([s, at]) => rawTone(n(s), { start: at, dur: 0.9, type: 'sine', vol: 0.2 }));
    rawTone(n(-24), { dur: 1.4, type: 'sine', vol: 0.4, slide: 0.98 });
  },
};
export function jingle(id) {
  JINGLES[id]?.();
}

let vibrationEnabled = true;
export function setVibrationEnabled(on) {
  vibrationEnabled = on;
}
// Android: Vibrations-Schnittstelle. iPhone (Safari ab iOS 18): Das Umschalten eines versteckten
// Schalters (<input type=checkbox switch>) löst ein kurzes haptisches Tippen aus – mehr erlaubt Apple Webseiten nicht.
let iosLabel = null;
function iosTick() {
  if (!iosLabel) {
    const box = document.createElement('div');
    box.className = 'haptic';
    box.setAttribute('aria-hidden', 'true');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = 'rb-haptic';
    input.tabIndex = -1;
    input.setAttribute('switch', '');
    iosLabel = document.createElement('label');
    iosLabel.htmlFor = 'rb-haptic';
    box.append(input, iosLabel);
    document.body.append(box);
  }
  iosLabel.click();
}

// pattern wie bei navigator.vibrate: Zahl oder [an, aus, an, …] in Millisekunden
export function vibrate(pattern) {
  if (!vibrationEnabled) return;
  // Browser erlauben Vibration erst nach der ersten echten Berührung
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  if (navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // manche Browser verbieten Vibration – egal
    }
    return;
  }
  const steps = Array.isArray(pattern) ? pattern : [pattern];
  let at = 0;
  steps.forEach((ms, k) => {
    // das erste Tippen sofort, solange die Berührung noch "frisch" ist
    if (k % 2 === 0 && at === 0) iosTick();
    else if (k % 2 === 0) setTimeout(iosTick, at);
    at += ms;
  });
}

// ---------- Musik ----------
// Ruhiger Synthwave-Takt (Am – F – C – G), wird mit der Serie voller: Hi-Hats, Bassdrum, Arpeggio, Snare.

const BPM = 100;
const STEP = 60 / BPM / 4; // Sechzehntel
const BARS = [
  [45, [57, 60, 64]], // Am
  [41, [57, 60, 65]], // F
  [48, [55, 60, 64]], // C
  [43, [55, 59, 62]], // G
];
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

let musicOn = true;
let musicGain = null;
let timer = null;
let step = 0;
let nextTime = 0;
let intensity = 0;
let noise = null;

export function setMusicEnabled(on) {
  musicOn = on;
  if (on) startMusic();
  else stopMusic();
}

// 0 = nur Bass und Flächen, 1 = + Hi-Hats, 2 = + Bassdrum und Arpeggio, 3 = + Snare
export function setMusicIntensity(streak) {
  intensity = streak >= 5 ? 3 : streak >= 3 ? 2 : streak >= 2 ? 1 : 0;
}

export function startMusic() {
  if (!musicOn || !ctx || timer) return;
  if (!musicGain) {
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.11;
    musicGain.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  musicGain.gain.setTargetAtTime(0.11, ctx.currentTime, 0.3);
  nextTime = ctx.currentTime + 0.1;
  timer = setInterval(schedule, 25);
}

export function stopMusic() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  if (musicGain) musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
}

function voice(freq, t, dur, { type = 'sine', vol = 0.3, attack = 0.01, cutoff = 0, slide = 0 } = {}) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = osc.connect(gain);
  if (cutoff) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    node = gain.connect(filter);
  }
  node.connect(musicGain);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function hit(t, dur, vol, type, freq) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(gain).connect(musicGain);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function schedule() {
  while (nextTime < ctx.currentTime + 0.12) {
    const s = step % 16;
    const [root, chord] = BARS[Math.floor(step / 16) % BARS.length];
    const t = nextTime;
    if (s === 0) for (const n of chord) voice(midi(n), t, STEP * 16, { type: 'triangle', vol: 0.09, attack: 0.4 });
    if ([0, 3, 6, 8, 11, 14].includes(s)) voice(midi(root), t, STEP * 1.6, { type: 'sawtooth', vol: 0.25, cutoff: 420 });
    if (intensity >= 1 && s % 4 === 2) hit(t, 0.05, 0.25, 'highpass', 7000);
    if (intensity >= 2 && s % 4 === 0) voice(150, t, 0.25, { vol: 0.7, slide: 0.3 });
    if (intensity >= 2) voice(midi(chord[s % 3] + 12 + (s % 6 >= 3 ? 12 : 0)), t, STEP * 0.9, { type: 'square', vol: 0.035 });
    if (intensity >= 3 && (s === 4 || s === 12)) hit(t, 0.15, 0.35, 'bandpass', 1800);
    nextTime += STEP;
    step++;
  }
}
