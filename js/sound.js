// 효과음·배경음: 음원 파일 없이 Web Audio로 직접 합성
import { store } from './util.js';

let ctx = null, master = null, bgmGain = null, bgmTimer = null, bgmStep = 0, nextTime = 0;
const prefs = store.get('dopa:sound', { sfx: true, bgm: false });

function ac() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
    bgmGain = ctx.createGain(); bgmGain.gain.value = 0.0; bgmGain.connect(master);
  } catch { ctx = null; }
  return ctx;
}

// 브라우저 정책: 첫 터치 이후에만 소리가 남
export function unlock() {
  const c = ac();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
  if (prefs.bgm) startBgm();
}
window.addEventListener('pointerdown', unlock, { once: false, passive: true });

function tone(freq, dur, { type = 'sine', vol = 0.3, at = 0, slide = 0, attack = 0.005, dest } = {}) {
  const c = ac(); if (!c || !prefs.sfx && !dest) return;
  const t = c.currentTime + at;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest || master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, { vol = 0.2, at = 0, hp = 1000, dest } = {}) {
  const c = ac(); if (!c || !prefs.sfx && !dest) return;
  const t = c.currentTime + at;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  const g = c.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(dest || master);
  src.start(t);
}

const buzz = (ms) => { try { if (prefs.sfx) navigator.vibrate?.(ms); } catch { /* 일부 기기 미지원 */ } };

export const sfx = {
  tap:     () => tone(520, 0.06, { type: 'square', vol: 0.08 }),
  select:  () => { tone(660, 0.07, { type: 'square', vol: 0.09 }); tone(990, 0.08, { type: 'square', vol: 0.07, at: 0.05 }); },
  toggle:  () => tone(880, 0.09, { type: 'triangle', vol: 0.15, slide: 1.5 }),
  publish: () => { noise(0.35, { vol: 0.12, hp: 600 }); tone(220, 0.35, { type: 'sawtooth', vol: 0.08, slide: 4 }); tone(1320, 0.12, { type: 'square', vol: 0.06, at: 0.3 }); },
  tick:    () => tone(1800 + Math.random() * 400, 0.025, { type: 'square', vol: 0.03 }),
  cash:    () => { noise(0.05, { vol: 0.15, hp: 3000 }); tone(1318, 0.25, { vol: 0.2, at: 0.04 }); tone(1760, 0.4, { vol: 0.2, at: 0.11 }); buzz(30); },
  loss:    () => { tone(330, 0.18, { type: 'triangle', vol: 0.2 }); tone(247, 0.3, { type: 'triangle', vol: 0.2, at: 0.15 }); },
  comment: () => tone(900 + Math.random() * 500, 0.05, { vol: 0.07, slide: 1.4 }),
  warn:    () => { for (let i = 0; i < 3; i++) tone(110, 0.12, { type: 'sawtooth', vol: 0.18, at: i * 0.15 }); buzz([80, 60, 80]); },
  victim:  () => { [523, 466, 392].forEach((f, i) => tone(f, 0.35, { type: 'triangle', vol: 0.14, at: i * 0.22 })); },
  good:    () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, { type: 'square', vol: 0.08, at: i * 0.07 })); },
  siren:   () => { for (let i = 0; i < 4; i++) tone(i % 2 ? 660 : 880, 0.18, { type: 'square', vol: 0.07, at: i * 0.18 }); buzz([60, 40, 60]); },
  unlock:  () => { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.16, at: i * 0.09 })); noise(0.3, { vol: 0.05, hp: 6000, at: 0.3 }); },
  fanfare: () => { [[523, 0], [659, 0.12], [784, 0.24], [1046, 0.36], [784, 0.52], [1046, 0.64]].forEach(([f, at]) => tone(f, 0.22, { type: 'square', vol: 0.1, at })); },
  gameover:() => { tone(440, 0.9, { type: 'sawtooth', vol: 0.14, slide: 0.25 }); noise(0.6, { vol: 0.08, hp: 200, at: 0.2 }); buzz(200); },
  whoosh:  () => noise(0.25, { vol: 0.08, hp: 2500 }),
};

// ── 배경음: 96BPM 로파이 루프 (기본 꺼짐) ──
const BASS = [55, 55, 65.4, 73.4, 49, 49, 61.7, 65.4];
function scheduleBgm() {
  const c = ctx; if (!c) return;
  const spb = 60 / 96 / 2; // 8분음표
  while (nextTime < c.currentTime + 0.25) {
    const at = nextTime - c.currentTime;
    const s = bgmStep % 16;
    if (s % 4 === 0) tone(120, 0.18, { vol: 0.5, slide: 0.35, at, dest: bgmGain });
    if (s % 2 === 1) noise(0.04, { vol: 0.12, hp: 7000, at, dest: bgmGain });
    if (s % 8 === 4) noise(0.12, { vol: 0.2, hp: 1500, at, dest: bgmGain });
    if (s % 2 === 0) tone(BASS[(bgmStep >> 1) % 8] * 2, spb * 1.8, { type: 'triangle', vol: 0.25, at, dest: bgmGain });
    nextTime += spb; bgmStep++;
  }
}
function startBgm() {
  const c = ac(); if (!c || bgmTimer) return;
  nextTime = c.currentTime + 0.05;
  bgmGain.gain.setTargetAtTime(0.12, c.currentTime, 0.3);
  bgmTimer = setInterval(scheduleBgm, 80);
}
function stopBgm() {
  if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
  if (ctx && bgmGain) bgmGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
}

export const soundPrefs = () => ({ ...prefs });
export function setSfx(on) { prefs.sfx = !!on; store.set('dopa:sound', prefs); }
export function setBgm(on) { prefs.bgm = !!on; store.set('dopa:sound', prefs); on ? startBgm() : stopBgm(); }
