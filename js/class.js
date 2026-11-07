// 학급 모드 공용 계산: 리더보드·알림·통계 (학생 화면과 교사 화면이 같은 공식을 씀)
import { ENDINGS, PERSONAS, CONFIG, hurtsSomeone } from './engine.js';
import { store } from './util.js';

export const isDead = (p) => p.status === 'ended' && !!p.ending && !(ENDINGS[p.ending] && ENDINGS[p.ending].good);

// 리더보드: 살아 있는(또는 생존 엔딩) 편집장이 돈 순서대로 위, 게임 오버는 맨 아래 '기록 무효'
export function rankList(players) {
  const list = Object.entries(players || {})
    .filter(([, p]) => p && typeof p === 'object')
    .map(([uid, p]) => ({ uid, nick: '???', avatar: '🐾', money: CONFIG.startMoney, day: 0, ...p }));
  list.sort((a, b) => (isDead(a) - isDead(b)) || (b.money - a.money) || ((a.joinedAt || 0) - (b.joinedAt || 0)));
  return list.map((p, i) => ({ ...p, dead: isDead(p), rank: i + 1 }));
}

export function statusLabel(p) {
  if (p.status === 'ended' && p.ending && ENDINGS[p.ending]) return `${ENDINGS[p.ending].emoji} ${ENDINGS[p.ending].name}`;
  if (!p.day) return '⏳ 준비 중';
  return `✍️ ${Math.min(p.day + 1, CONFIG.totalDays)}일차`;
}

// 다른 학생의 '선 넘는 기사'를 찾아 알림으로 (누가 했는지는 숨김)
export function harmAlerts(prev, next, myUid) {
  const out = [];
  for (const uid in next || {}) {
    if (uid === myUid) continue;
    const days = next[uid] || {};
    for (const d in days) {
      if (prev && prev[uid] && prev[uid][d]) continue;
      const c = days[d];
      if (!c) continue;
      if (c.t === 2) out.push('deepfake');
      else if (c.h === 2 && c.a === 1) out.push('defame');
      else if (hurtsSomeone(c)) out.push('bully');
      else if (c.h === 2) out.push('extreme');
    }
  }
  return out;
}

export const ALERT_TEXT = {
  deepfake: '🚨 익명의 편집장이 AI 가짜 사진을 퍼뜨렸다!',
  defame: '⚖️ 익명의 편집장이 거짓 소문으로 단톡방을 저격했다!',
  bully: '💔 익명의 편집장 기사 때문에 상처받은 친구가 생겼다!',
  extreme: '📢 익명의 편집장이 과장·거짓 기사를 냈다!',
};

// 교사용 통계
export function classStats(players, choices) {
  const uids = Object.keys(players || {});
  const perDay = [];
  for (let d = 1; d <= CONFIG.totalDays; d++) {
    const row = { day: d, n: 0, deepfake: 0, extreme: 0, target: 0, rage: 0, fc: 0, clean: 0 };
    for (const uid in choices || {}) {
      const c = choices[uid] && choices[uid][d];
      if (!c) continue;
      row.n++;
      if (c.t === 2) row.deepfake++;
      if (c.h === 2) row.extreme++;
      if (c.a === 1) row.target++;
      if (c.a === 2) row.rage++;
      if (c.fc) row.fc++;
      if (c.h <= 1 && c.t === 0 && c.a === 0) row.clean++;
    }
    perDay.push(row);
  }
  const endings = {}, personas = {};
  for (const uid of uids) {
    const p = players[uid];
    if (p.ending) endings[p.ending] = (endings[p.ending] || 0) + 1;
    if (p.persona) personas[p.persona] = (personas[p.persona] || 0) + 1;
  }
  // n일차까지의 1위 (choices에 기록된 그날 잔고 기준)
  const leaderAt = (d) => {
    let best = null;
    for (const uid in choices || {}) {
      const c = choices[uid] && choices[uid][d];
      if (c && typeof c.money === 'number' && (!best || c.money > best.money)) best = { uid, money: c.money };
    }
    return best;
  };
  const insights = [];
  const peak = perDay.filter((r) => r.n >= 1).sort((a, b) => b.deepfake / b.n - a.deepfake / a.n)[0];
  if (peak && peak.deepfake > 0) insights.push(`우리 반의 ${Math.round((peak.deepfake / peak.n) * 100)}%가 ${peak.day}일차에 AI 가짜 사진을 썼습니다.`);
  const early = leaderAt(2) || leaderAt(1);
  if (early && players[early.uid]) {
    const p = players[early.uid];
    const fate = p.ending && ENDINGS[p.ending] ? `${ENDINGS[p.ending].emoji} ${ENDINGS[p.ending].name}` : '아직 진행 중';
    insights.push(`초반(2일차) 1위였던 편집장의 최후 → ${fate}`);
  }
  const total = perDay.reduce((s, r) => s + r.n, 0);
  const clean = perDay.reduce((s, r) => s + r.clean, 0);
  if (total) insights.push(`전체 기사 ${total}개 중 '사람을 해치지 않은 기사'는 ${Math.round((clean / total) * 100)}%였습니다.`);
  const dead = uids.filter((u) => isDead(players[u])).length;
  const done = uids.filter((u) => players[u].status === 'ended').length;
  if (done) insights.push(`끝난 편집장 ${done}명 중 ${dead}명이 게임 오버(파산·폐쇄·붕괴·경찰서)였습니다.`);
  return { perDay, endings, personas, insights, count: uids.length, done, dead };
}

// 엔딩 도감 (기기에 저장)
export const CODEX_KEYS = {
  endings: ['legend', 'survive', 'bankrupt', 'overdose', 'collapse', 'police'],
  personas: Object.keys(PERSONAS),
};
export function codexGet() {
  const c = store.get('dopa:codex', null);
  return { endings: (c && c.endings) || {}, personas: (c && c.personas) || {} };
}
export function codexAdd(ending, persona) {
  const c = codexGet();
  const fresh = { ending: false, persona: false };
  if (ending && CODEX_KEYS.endings.includes(ending) && !c.endings[ending]) { c.endings[ending] = Date.now(); fresh.ending = true; }
  if (persona && !c.personas[persona]) { c.personas[persona] = Date.now(); fresh.persona = true; }
  store.set('dopa:codex', c);
  return fresh;
}
export function codexCount() {
  const c = codexGet();
  const got = CODEX_KEYS.endings.filter((k) => c.endings[k]).length + CODEX_KEYS.personas.filter((k) => c.personas[k]).length;
  return { got, total: CODEX_KEYS.endings.length + CODEX_KEYS.personas.length };
}
