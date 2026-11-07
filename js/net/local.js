// 로컬 모의 서버: Firebase 없이 같은 기기의 여러 탭끼리 학급 모드를 체험/테스트
// (탭 하나 = 학생 한 명. 데이터는 이 브라우저의 localStorage에만 저장됨)
const KEY = 'dopa:localdb';

function readTree() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}
function writeTree(t) {
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* 저장 불가 */ }
}
const parts = (p) => String(p).split('/').filter(Boolean);
function getAt(t, p) {
  let cur = t;
  for (const k of parts(p)) { if (cur == null || typeof cur !== 'object') return null; cur = cur[k]; }
  return cur === undefined ? null : cur;
}
function setAt(t, p, v) {
  const ks = parts(p);
  let cur = t;
  for (let i = 0; i < ks.length - 1; i++) {
    if (cur[ks[i]] == null || typeof cur[ks[i]] !== 'object') cur[ks[i]] = {};
    cur = cur[ks[i]];
  }
  const last = ks[ks.length - 1];
  if (v === null || v === undefined) delete cur[last];
  else cur[last] = JSON.parse(JSON.stringify(v));
}

function tabUid() {
  try {
    let u = sessionStorage.getItem('dopa:uid');
    if (!u) { u = 'local-' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('dopa:uid', u); }
    return u;
  } catch { return 'local-' + Math.random().toString(36).slice(2, 10); }
}

export function createNet() {
  const listeners = new Set();
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('dopa-localdb') : null;

  const notify = () => {
    const tree = readTree();
    for (const l of listeners) {
      const v = getAt(tree, l.path);
      const s = JSON.stringify(v);
      if (s !== l.last) { l.last = s; try { l.cb(v == null ? null : JSON.parse(s)); } catch (e) { console.error(e); } }
    }
  };
  const commit = (fn) => {
    const tree = readTree();
    const r = fn(tree);
    writeTree(tree);
    notify();
    if (bc) bc.postMessage(1);
    return r;
  };
  if (bc) bc.onmessage = notify;
  window.addEventListener('storage', (e) => { if (e.key === KEY) notify(); });

  return {
    kind: 'local',
    uid: tabUid(),
    get: async (p) => getAt(readTree(), p),
    set: async (p, v) => commit((t) => setAt(t, p, v)),
    update: async (p, patch) => commit((t) => { for (const k in patch) setAt(t, `${p}/${k}`, patch[k]); }),
    remove: async (p) => commit((t) => setAt(t, p, null)),
    on(p, cb) {
      const l = { path: p, cb, last: undefined };
      listeners.add(l);
      setTimeout(() => { if (!listeners.has(l)) return; const v = getAt(readTree(), p); l.last = JSON.stringify(v); cb(v); }, 0);
      return () => listeners.delete(l);
    },
    createIfAbsent: async (p, v, canReplace) => commit((t) => {
      const cur = getAt(t, p);
      if (cur == null || (canReplace && canReplace(cur))) { setAt(t, p, v); return true; }
      return false;
    }),
    writeOnce: async (p, v) => commit((t) => { if (getAt(t, p) == null) setAt(t, p, v); }),
  };
}
