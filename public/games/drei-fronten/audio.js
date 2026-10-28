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

// Leise, mystische Musik: tiefer schwebender Klangteppich und zufällige Glockentöne aus einer Moll-Tonleiter.
const BELLS = [220, 261.6, 293.7, 329.6, 392, 440, 523.3, 587.3];

function startMusic() {
  if (!ensure() || drone) return;
  drone = [55, 82.4, 110.3].map((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = i === 2 ? 'triangle' : 'sine';
    osc.frequency.value = freq;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07 + i * 0.03;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.6;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    const gain = ctx.createGain();
    gain.gain.value = i === 2 ? 0.05 : 0.09;
    osc.connect(gain);
    gain.connect(musicGain);
    osc.start();
    lfo.start();
    return { osc, lfo };
  });
  const bell = () => {
    const freq = BELLS[Math.floor(Math.random() * BELLS.length)];
    tone(freq, { length: 2.8, type: 'sine', volume: 0.07, attack: 0.08, target: musicGain });
    tone(freq * 2, { start: 0.02, length: 1.6, type: 'sine', volume: 0.02, attack: 0.05, target: musicGain });
    musicTimer = setTimeout(bell, 1800 + Math.random() * 3200);
  };
  bell();
  musicGain.gain.setTargetAtTime(settings.music ? 0.5 : 0, ctx.currentTime, 1.5);
}

function stopMusic() {
  if (!drone) return;
  clearTimeout(musicTimer);
  for (const { osc, lfo } of drone) { osc.stop(); lfo.stop(); }
  drone = null;
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
