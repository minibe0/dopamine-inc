// 공용 도구 모음

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// DB에서 온 글자는 반드시 이걸 거쳐서 화면에 넣는다 (HTML 주입 방지)
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;
export const signedWon = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n)).toLocaleString('ko-KR')}원`;
export const num = (n) => Math.round(n).toLocaleString('ko-KR');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const fill = (tpl, vars) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

// localStorage가 막혀 있어도(사생활 보호 모드 등) 게임이 멈추지 않게
export const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 저장 불가 환경 */ } },
  del(key) { try { localStorage.removeItem(key); } catch { /* 무시 */ } },
};

let toastTimer = null;
export function toast(html, kind = 'info', ms = 2600) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.className = `toast toast-${kind} show`;
  el.innerHTML = html;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// 이모지 꽃가루
export function confetti(emojis = ['💸', '✨', '🎉', '💚'], count = 24) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.createElement('div');
  layer.className = 'confetti';
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    s.textContent = pick(emojis);
    s.style.left = `${Math.random() * 100}%`;
    s.style.animationDelay = `${Math.random() * 0.4}s`;
    s.style.fontSize = `${18 + Math.random() * 18}px`;
    s.style.setProperty('--dx', `${(Math.random() - 0.5) * 120}px`);
    layer.appendChild(s);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 2400);
}

export function shake(el = document.body) {
  el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 500);
}

// 숫자 올라가는 애니메이션
export function countUp(el, to, ms, fmt = num, onTick) {
  return new Promise((resolve) => {
    const start = performance.now();
    let lastTick = 0, done = false;
    const finish = () => { if (done) return; done = true; el.textContent = fmt(to); resolve(); };
    setTimeout(finish, ms + 150); // 탭이 숨겨져 애니메이션이 멈춰도 진행되게
    const step = (now) => {
      if (done) return;
      const p = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(to * e);
      if (onTick && now - lastTick > 70 && p < 1) { lastTick = now; onTick(); }
      if (p < 1) requestAnimationFrame(step); else finish();
    };
    requestAnimationFrame(step);
  });
}
