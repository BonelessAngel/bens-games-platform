// Töne und Musik – alles wird im Browser erzeugt (Web Audio), keine Dateien.
// Der Klang startet erst nach der ersten Berührung, weil Browser vorher stumm bleiben.

let ctx = null;
let master = null;
let sfxGain = null;
let musicGain = null;
let musicTimer = null;
let drone = null;
const settings = { sound: true, music: true };

function ensure() {
  if (ctx) return ctx;
  const AudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!AudioContext) return null;
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);
  sfxGain = ctx.createGain();
  sfxGain.gain.value = settings.sound ? 0.55 : 0;
  sfxGain.connect(master);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0;
  musicGain.connect(master);
  return ctx;
}

// Ein einzelner Ton mit Hüllkurve.
function tone(freq, { start = 0, length = 0.2, type = 'sine', volume = 0.3, slide = 0, attack = 0.01, target = sfxGain } = {}) {
  if (!ensure() || !target) return;
  const now = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), now + length);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
  osc.connect(gain);
  gain.connect(target);
  osc.start(now);
  osc.stop(now + length + 0.05);
}

// Rauschen (für Feuer, Beben, Zerstören).
function noise({ start = 0, length = 0.3, volume = 0.25, filter = 1200, sweep = 0.3 } = {}) {
  if (!ensure()) return;
  const now = ctx.currentTime + start;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * length), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.setValueAtTime(filter, now);
  lowpass.frequency.exponentialRampToValueAtTime(Math.max(60, filter * sweep), now + length);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
  source.connect(lowpass);
  lowpass.connect(gain);
  gain.connect(sfxGain);
  source.start(now);
}

const SOUNDS = {
  click: () => tone(660, { length: 0.06, type: 'triangle', volume: 0.15 }),
  pick: () => tone(520, { length: 0.09, type: 'triangle', volume: 0.18, slide: 1.4 }),
  place: () => { tone(180, { length: 0.14, type: 'sine', volume: 0.35, slide: 0.6 }); noise({ length: 0.08, volume: 0.08, filter: 900 }); },
  reveal: () => { tone(880, { length: 0.25, type: 'sine', volume: 0.12 }); tone(1320, { start: 0.05, length: 0.25, volume: 0.08 }); },
  legend: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, { start: i * 0.07, length: 0.6, type: 'triangle', volume: 0.16 })),
  buff: () => { tone(600, { length: 0.18, type: 'triangle', volume: 0.16, slide: 1.6 }); },
  debuff: () => { tone(420, { length: 0.22, type: 'sawtooth', volume: 0.08, slide: 0.5 }); },
  destroy: () => { noise({ length: 0.45, volume: 0.3, filter: 2400, sweep: 0.1 }); tone(120, { length: 0.4, type: 'square', volume: 0.08, slide: 0.4 }); },
  blitz: () => { noise({ length: 0.35, volume: 0.35, filter: 6000, sweep: 0.05 }); tone(1800, { length: 0.12, type: 'square', volume: 0.06, slide: 0.2 }); },
  feuer: () => { noise({ length: 0.6, volume: 0.25, filter: 900, sweep: 0.5 }); tone(90, { length: 0.5, volume: 0.15, slide: 0.7 }); },
  wasser: () => { noise({ length: 0.7, volume: 0.15, filter: 700, sweep: 2.2 }); tone(300, { length: 0.5, volume: 0.06, slide: 1.5 }); },
  beben: () => { noise({ length: 0.8, volume: 0.35, filter: 300, sweep: 0.5 }); tone(55, { length: 0.8, type: 'sine', volume: 0.35 }); },
  magie: () => [880, 1175, 1568].forEach((f, i) => tone(f, { start: i * 0.06, length: 0.35, type: 'sine', volume: 0.1 })),
  schild: () => { tone(440, { length: 0.5, type: 'triangle', volume: 0.12 }); tone(660, { start: 0.02, length: 0.5, volume: 0.08 }); },
  drum: () => [0, 0.22, 0.44].forEach((t, i) => { tone(70, { start: t, length: 0.35, volume: i === 2 ? 0.6 : 0.45, slide: 0.5 }); noise({ start: t, length: 0.12, volume: 0.15, filter: 400 }); }),
  banner: () => [392, 523].forEach((f, i) => tone(f, { start: i * 0.12, length: 0.35, type: 'triangle', volume: 0.18 })),
  win: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, { start: i * 0.13, length: i === 4 ? 1.2 : 0.3, type: 'triangle', volume: 0.2 })),
  lose: () => [392, 349, 311, 262].forEach((f, i) => tone(f, { start: i * 0.2, length: 0.45, type: 'sine', volume: 0.18 })),
  coins: () => [1320, 1760, 2093].forEach((f, i) => tone(f, { start: i * 0.06, length: 0.15, type: 'square', volume: 0.05 })),
  flip: () => { noise({ length: 0.12, volume: 0.12, filter: 3000, sweep: 0.3 }); tone(700, { length: 0.1, type: 'triangle', volume: 0.1, slide: 1.3 }); },
  gold: () => [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, { start: i * 0.05, length: 0.5, type: 'sine', volume: 0.14 })),
  achievement: () => [659, 784, 988, 1319].forEach((f, i) => tone(f, { start: i * 0.09, length: 0.4, type: 'triangle', volume: 0.16 })),
};

export function play(name) {
  if (!settings.sound || !ensure()) return;
  if (ctx.state === 'suspended') ctx.resume();
  SOUNDS[name]?.();
}

// Leise, mystische Musik: weiche Akkordflächen mit viel Hall, die langsam ineinander übergehen,
// dazu ab und zu ein heller Glockenton aus dem Akkord. Kein Brummen, kein Wabern.
const CHORDS = [
  [110, 220, 261.6, 329.6, 493.9], // a-Moll (mit None)
  [87.3, 174.6, 220, 261.6, 329.6], // F-Dur (große Septime)
  [65.4, 196, 261.6, 329.6, 392], // C-Dur
  [82.4, 164.8, 246.9, 329.6, 392], // e-Moll
  [73.4, 174.6, 220, 293.7, 440], // d-Moll
  [82.4, 207.7, 246.9, 329.6, 493.9], // E-Dur (führt zurück nach a-Moll)
];
const CHORD_TIME = 9;

let musicBus = null;
let chordIndex = 0;

// Künstlicher Hall: abklingendes Rauschen als Raumantwort.
function makeReverb(seconds = 4.5) {
  const length = Math.ceil(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2.6;
  }
  const reverb = ctx.createConvolver();
  reverb.buffer = impulse;
  return reverb;
}

// Ein Flächenton: zwei leicht verstimmte Oszillatoren, weich gefiltert, langsam ein- und ausgeblendet.
function padNote(freq, when, length, volume) {
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  filter.Q.value = 0.3;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(volume, when + length * 0.35);
  gain.gain.setValueAtTime(volume, when + length * 0.6);
  gain.gain.linearRampToValueAtTime(0.0001, when + length);
  filter.connect(gain);
  gain.connect(musicBus);
  for (const [type, detune] of [['sine', -5], ['triangle', 5]]) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    osc.connect(filter);
    osc.start(when);
    osc.stop(when + length + 0.1);
  }
}

function bellNote(freq, when) {
  tone(freq, { start: when - ctx.currentTime, length: 3.5, type: 'sine', volume: 0.045, attack: 0.04, target: musicBus });
  tone(freq * 3, { start: when - ctx.currentTime, length: 1.2, type: 'sine', volume: 0.008, attack: 0.02, target: musicBus });
}

function nextChord() {
  if (!musicBus) return;
  const chord = CHORDS[chordIndex % CHORDS.length];
  chordIndex++;
  const when = ctx.currentTime + 0.05;
  // Flächen überlappen sich, damit die Akkorde fließend wechseln.
  chord.forEach((freq, i) => padNote(freq, when, CHORD_TIME * 1.6, i === 0 ? 0.05 : 0.028));
  // Ein bis drei Glockentöne aus dem Akkord, eine Oktave höher.
  const bells = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < bells; i++) {
    const freq = chord[1 + Math.floor(Math.random() * (chord.length - 1))] * 2;
    bellNote(freq, when + 1.5 + Math.random() * (CHORD_TIME - 2.5));
  }
  musicTimer = setTimeout(nextChord, CHORD_TIME * 1000);
}

function startMusic() {
  if (!ensure() || musicBus) return;
  musicBus = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 0.45;
  const wet = ctx.createGain();
  wet.gain.value = 0.9;
  const reverb = makeReverb();
  musicBus.connect(dry);
  musicBus.connect(reverb);
  reverb.connect(wet);
  dry.connect(musicGain);
  wet.connect(musicGain);
  drone = { bus: musicBus, nodes: [dry, wet, reverb] };
  chordIndex = 0;
  nextChord();
  musicGain.gain.setTargetAtTime(settings.music ? 0.5 : 0, ctx.currentTime, 1.5);
}

function stopMusic() {
  if (!drone) return;
  clearTimeout(musicTimer);
  drone.bus.disconnect();
  for (const node of drone.nodes) node.disconnect();
  drone = null;
  musicBus = null;
}

export function setSound(on) {
  settings.sound = on;
  if (sfxGain) sfxGain.gain.value = on ? 0.55 : 0;
}

export function setMusic(on) {
  settings.music = on;
  if (!ctx) return;
  if (on) {
    startMusic();
    musicGain.gain.setTargetAtTime(0.5, ctx.currentTime, 1.2);
  } else {
    musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    setTimeout(() => { if (!settings.music) stopMusic(); }, 1500);
  }
}

// Beim ersten Tippen: Ton freischalten und Musik starten (falls an).
export function unlockAudio() {
  if (!ensure()) return;
  if (ctx.state === 'suspended') ctx.resume();
  if (settings.music) startMusic();
}

// Wenn die Seite im Hintergrund ist, Musik pausieren.
globalThis.document?.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend();
  else ctx.resume();
});
