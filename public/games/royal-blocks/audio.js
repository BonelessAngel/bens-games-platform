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

function tone(freq, { start = 0, dur = 0.15, type = 'sine', vol = 0.5, slide = 0 } = {}) {
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

let vibrationEnabled = true;
export function setVibrationEnabled(on) {
  vibrationEnabled = on;
}
export function vibrate(pattern) {
  if (vibrationEnabled && navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // manche Browser verbieten Vibration – egal
    }
  }
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
