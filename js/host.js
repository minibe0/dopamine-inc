// 도파민 주식회사 — 교사용 대시보드 (프로젝터 화면용)
import * as E from './engine.js';
import { sfx, setSfx, soundPrefs } from './sound.js';
import { $, esc, won, num, store, toast } from './util.js';
import { rankList, statusLabel, classStats, harmAlerts, ALERT_TEXT, isDead } from './class.js';
import { getNet } from './net/index.js';
import * as R from './room.js';

const root = $('#host');
const H = {
  net: null, pin: null, meta: null, session: null,
  players: {}, choices: {}, loaded: false,
  metaUnsub: null, sessUnsubs: [],
  feed: [], tab: 'live',
};

const joinUrl = () => {
  const u = new URL('./', location.href);
  return `${u.host}${u.pathname}`.replace(/\/$/, '');
};

// ───────── 시작 화면 ─────────
async function renderSetup() {
  const last = store.get('dopa:host', null);
  let lastOk = false;
  if (last && last.pin) {
    try { const m = await R.findRoom(H.net, last.pin); lastOk = !!(m && m.hostUid === H.net.uid); } catch { lastOk = false; }
  }
  root.innerHTML = `
  <main class="h-setup">
    <div class="logo"><span class="logo-top">DOPAMINE</span><span class="logo-bot">INC.</span></div>
    <h1>🎛️ 교사용 대시보드</h1>
    <p>방을 만들면 4자리 PIN이 생겨요. 학생들은 게임 주소에서 PIN만 입력하면 입장합니다.</p>
    <div class="h-setup-btns">
      <button class="btn btn-green big" data-act="create">＋ 새 방 만들기</button>
      ${lastOk ? `<button class="btn btn-ghost big" data-act="reopen">↩ 이전 방 다시 열기 (PIN ${esc(last.pin)})</button>` : ''}
      <a class="btn btn-ghost" href="about.html" target="_blank" rel="noopener">ℹ️ 소개 · 이용안내 (발표용)</a>
    </div>
    ${H.net.kind === 'local' ? '<p class="notice">🧪 로컬 체험 모드: Firebase 설정 전이라 <b>이 브라우저의 다른 탭</b>에서만 학생으로 입장할 수 있어요. (README 참고)</p>' : ''}
  </main>`;
}

async function createRoom() {
  const btn = $('[data-act="create"]');
  if (btn) { btn.disabled = true; btn.textContent = '만드는 중…'; }
  try {
    const { pin, meta } = await R.createRoom(H.net);
    store.set('dopa:host', { pin });
    openRoom(pin, meta);
  } catch (e) {
    toast(esc(e.message || '방 만들기 실패'), 'bad', 4000);
    if (btn) { btn.disabled = false; btn.textContent = '＋ 새 방 만들기'; }
  }
}

function openRoom(pin, meta) {
  H.pin = pin; H.meta = meta; H.session = null;
  if (H.metaUnsub) H.metaUnsub();
  H.metaUnsub = H.net.on(R.metaPath(pin), onMeta);
  renderDash();
}

function onMeta(meta) {
  if (!meta) { toast('방이 닫혔어요'); cleanup(); renderSetup(); return; }
  H.meta = meta;
  if (meta.session !== H.session) {
    H.sessUnsubs.forEach((u) => u());
    H.session = meta.session;
    H.players = {}; H.choices = {}; H.loaded = false; H.feed = [];
    H.sessUnsubs = [
      H.net.on(R.playersPath(H.pin, H.session), (v) => { H.players = v || {}; update(); }),
      H.net.on(R.choicesPath(H.pin, H.session), onChoices),
    ];
  }
  renderDash();
}

function onChoices(v) {
  const next = v || {};
  if (H.loaded) {
    const alerts = harmAlerts(H.choices, next, null);
    if (alerts.length) {
      const t = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      alerts.forEach((k) => H.feed.unshift({ t, text: ALERT_TEXT[k] }));
      H.feed = H.feed.slice(0, 30);
      sfx.siren();
    }
  }
  H.choices = next;
  H.loaded = true;
  update();
}

function cleanup() {
  if (H.metaUnsub) H.metaUnsub();
  H.sessUnsubs.forEach((u) => u());
  H.metaUnsub = null; H.sessUnsubs = []; H.pin = null; H.meta = null; H.session = null;
}

// ───────── 대시보드 ─────────
const STATUS = { lobby: ['⏳ 대기 중', 'lobby'], playing: ['🟢 진행 중', 'playing'], ended: ['🏁 종료', 'ended'] };

function renderDash() {
  if (!H.meta) return;
  const st = H.meta.status;
  const [stLabel, stCls] = STATUS[st] || STATUS.lobby;
  const sp = soundPrefs();
  root.innerHTML = `
  <header class="h-top">
    <div class="h-logo">DOPAMINE <b>INC.</b> <small>교사용</small></div>
    <span class="h-status ${stCls}">${stLabel}</span>
    <nav class="h-actions">
      ${st === 'lobby' ? '<button class="btn btn-green" data-act="start">▶ 게임 시작</button>' : ''}
      ${st === 'playing' ? '<button class="btn btn-red" data-act="end">⏹ 판 끝내기</button>' : ''}
      ${st !== 'lobby' ? '<button class="btn btn-purple" data-act="new">🔁 새 판 (다시 하기)</button>' : ''}
      <button class="btn ${H.tab === 'debrief' ? 'btn-green' : ''}" data-act="tab">${H.tab === 'debrief' ? '🏆 실시간 화면' : '📊 토론 화면'}</button>
      <a class="icon" href="about.html" target="_blank" rel="noopener" aria-label="이용안내" title="이용안내">ℹ️</a>
      <button class="icon" data-act="sfx" aria-label="효과음">${sp.sfx ? '🔊' : '🔇'}</button>
      <button class="icon" data-act="close" aria-label="방 닫기">🗑</button>
    </nav>
  </header>
  <section class="h-join">
    <div class="h-join-item"><small>① 접속 주소</small><b class="url">${esc(joinUrl())}</b></div>
    <div class="h-join-item"><small>② 학급 PIN</small><b class="pin-huge">${esc(H.pin)}</b></div>
    <div class="h-join-item"><small>참가 인원</small><b class="count" id="h-count">0명</b></div>
  </section>
  <main id="h-main"></main>`;
  update();
}

function update() {
  const main = $('#h-main');
  if (!main) return;
  const c = $('#h-count');
  const n = Object.keys(H.players).length;
  if (c) c.textContent = `${n}명`;
  main.className = `h-grid tab-${H.tab}`;
  main.innerHTML = H.tab === 'debrief' ? debriefHtml() : liveHtml();
}

function trustCard() {
  const n = Math.max(1, Object.keys(H.players).length);
  const t = E.classTrust(H.choices, n);
  const lvl = t <= 20 ? 'danger' : t <= 45 ? 'warn' : 'ok';
  return `
  <section class="h-card h-trust ${lvl}">
    <h3>🌐 우리 반 신뢰도</h3>
    <b>${Math.round(t)}%</b>
    <div class="bar"><i style="width:${t}%"></i></div>
    <p>${t <= 0 ? '💥 미디어 생태계 붕괴! 진행 중이던 모두가 게임 오버' : t <= 20 ? '🚨 붕괴 직전!' : t <= 45 ? '⚠️ 흔들리는 중' : '🙂 아직 괜찮음'}</p>
  </section>`;
}

function boardHtml(limit) {
  const list = rankList(H.players);
  if (!list.length) return '<p class="empty">아직 입장한 학생이 없어요</p>';
  const medal = (r) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : r);
  return `<ol class="board-list">${list.slice(0, limit).map((p) => `
    <li class="${p.dead ? 'dead' : ''}">
      <span class="rk">${p.dead ? '💀' : medal(p.rank)}</span>
      <span class="av">${esc(p.avatar)}</span>
      <span class="nm">${esc(p.nick)}<small>${esc(statusLabel(p))}</small></span>
      <span class="mn">${p.dead ? `<s>${won(p.money)}</s>` : won(p.money)}</span>
    </li>`).join('')}</ol>${list.length > limit ? `<p class="more">… 외 ${list.length - limit}명</p>` : ''}`;
}

function liveHtml() {
  const st = H.meta.status;
  if (st === 'lobby') {
    const list = rankList(H.players).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
    return `
    <section class="h-card h-lobby span-all">
      <h3>⏳ 입장한 편집장 <span class="pill">${list.length}</span></h3>
      <div class="bubbles">${list.map((p) => `<span class="bubble">${esc(p.avatar)} ${esc(p.nick)}</span>`).join('') || '<p class="empty">학생들이 PIN을 입력하면 여기 나타나요</p>'}</div>
      <p class="hint">💬 진행 멘트: “규칙은 하나예요. <b>돈을 제일 많이 버는 사람이 이깁니다.</b>” (다른 설명은 하지 않기)</p>
    </section>`;
  }
  const s = classStats(H.players, H.choices);
  return `
    ${trustCard()}
    <section class="h-card h-board"><h3>🏆 실시간 리더보드</h3>${boardHtml(12)}</section>
    <section class="h-card h-feed">
      <h3>🚨 실시간 알림 <small>(익명)</small></h3>
      <ul>${H.feed.map((f) => `<li><time>${esc(f.t)}</time>${esc(f.text)}</li>`).join('') || '<li class="empty">아직 조용해요</li>'}</ul>
    </section>
    <section class="h-card h-progress">
      <h3>📈 진행 현황</h3>
      <div class="kpis">
        <div><b>${s.count}</b><small>참가</small></div>
        <div><b>${s.count - s.done}</b><small>진행 중</small></div>
        <div><b>${s.done - s.dead}</b><small>생존</small></div>
        <div class="red"><b>${s.dead}</b><small>게임 오버</small></div>
      </div>
    </section>`;
}

function debriefHtml() {
  const s = classStats(H.players, H.choices);
  const metrics = [
    ['deepfake', '🤖 AI 합성'],
    ['extreme', '📢 극단 선동'],
    ['target', '🎯 단톡방 저격'],
    ['rage', '😡 분노 타겟팅'],
    ['fc', '🔍 팩트체크'],
  ];
  const cell = (r, k) => {
    if (!r.n) return '<td class="na">·</td>';
    const p = Math.round((r[k] / r.n) * 100);
    return `<td style="--p:${p}" class="${k === 'fc' ? 'pos' : 'neg'}">${p}%</td>`;
  };
  const days = s.perDay;
  const endTotal = Object.values(s.endings).reduce((a, b) => a + b, 0) || 1;
  const perTotal = Object.values(s.personas).reduce((a, b) => a + b, 0) || 1;
  const distRow = (info, cnt, total) => `<li><span>${info.emoji} ${esc(info.name)}</span><i style="width:${(cnt / total) * 100}%"></i><b>${cnt}명</b></li>`;
  return `
    <section class="h-card h-insight span-all">
      <h3>💡 우리 반 결과 한 줄</h3>
      ${s.insights.length ? `<ul>${s.insights.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="empty">아직 데이터가 부족해요</p>'}
    </section>
    <section class="h-card h-heat span-2">
      <h3>📅 일차별 선택 비율</h3>
      <table>
        <thead><tr><th></th>${days.map((r) => `<th>${r.day}일</th>`).join('')}</tr></thead>
        <tbody>${metrics.map(([k, label]) => `<tr><th>${label}</th>${days.map((r) => cell(r, k)).join('')}</tr>`).join('')}</tbody>
      </table>
    </section>
    <section class="h-card h-dist">
      <h3>🎬 엔딩 분포</h3>
      <ul class="dist">${Object.entries(s.endings).sort((a, b) => b[1] - a[1]).map(([k, n]) => distRow(E.ENDINGS[k] || { emoji: '?', name: k }, n, endTotal)).join('') || '<li class="empty">아직 끝난 학생이 없어요</li>'}</ul>
      <h3>🧑‍💼 편집장 유형</h3>
      <ul class="dist">${Object.entries(s.personas).sort((a, b) => b[1] - a[1]).map(([k, n]) => distRow(E.PERSONAS[k] || { emoji: '?', name: k }, n, perTotal)).join('') || '<li class="empty">-</li>'}</ul>
    </section>
    <section class="h-card h-questions span-all">
      <h3>🗣️ 토론 질문</h3>
      <ol>
        <li>초반 1등이 끝까지 1등이 아니었던 이유는?</li>
        <li>나 혼자 조금 자극적으로 썼을 뿐인데, 왜 반 전체 신뢰도가 무너졌을까?</li>
        <li>실제 유튜브·숏폼 알고리즘에서 비슷한 장면을 본 적 있나?</li>
        <li>내가 '구독자'라면, 어떤 채널을 믿고 싶을까?</li>
      </ol>
    </section>`;
}

// ───────── 확인 창 (브라우저 기본 confirm 대신) ─────────
function confirmBox(text, okLabel, onOk) {
  const el = document.createElement('div');
  el.className = 'modal';
  el.innerHTML = `<div class="modal-box pop"><h3>${text}</h3><div class="h-confirm"><button class="btn" data-x="no">취소</button><button class="btn btn-red" data-x="ok">${okLabel}</button></div></div>`;
  el.addEventListener('click', (e) => {
    const x = e.target.closest('[data-x]');
    if (e.target === el || (x && x.dataset.x === 'no')) el.remove();
    else if (x && x.dataset.x === 'ok') { el.remove(); onOk(); }
  });
  document.body.appendChild(el);
}

const ACTIONS = {
  create: () => createRoom(),
  async reopen() {
    const last = store.get('dopa:host', null);
    if (!last) return;
    const m = await R.findRoom(H.net, last.pin);
    if (m && m.hostUid === H.net.uid) openRoom(last.pin, m); else { toast('이전 방을 찾을 수 없어요', 'bad'); renderSetup(); }
  },
  start: () => H.net.update(R.metaPath(H.pin), { status: 'playing' }).then(() => sfx.unlock()),
  end: () => confirmBox('이번 판을 끝낼까요?<br><small>진행 중인 학생은 지금 잔고로 순위가 정해져요.</small>', '판 끝내기', () => H.net.update(R.metaPath(H.pin), { status: 'ended' })),
  new: () => confirmBox('새 판을 열까요?<br><small>학생 화면이 처음부터 다시 시작돼요. (이번 판 기록은 남아 있지 않아요)</small>', '새 판 열기', () => {
    H.tab = 'live';
    H.net.update(R.metaPath(H.pin), { session: R.newSessionKey(), status: 'lobby' });
  }),
  tab() { H.tab = H.tab === 'live' ? 'debrief' : 'live'; renderDash(); },
  sfx() { setSfx(!soundPrefs().sfx); renderDash(); },
  close: () => confirmBox('방을 닫을까요?<br><small>모든 기록이 지워지고 학생들은 첫 화면으로 돌아가요.</small>', '방 닫기', async () => {
    const pin = H.pin;
    cleanup();
    store.del('dopa:host');
    await H.net.remove(R.roomPath(pin));
    renderSetup();
  }),
};

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const fn = ACTIONS[b.dataset.act];
  if (!fn) return;
  Promise.resolve().then(() => fn(b)).catch((err) => { console.error(err); toast('오류가 났어요. 새로고침해 주세요.', 'bad', 4000); });
});

async function boot() {
  try {
    H.net = await getNet();
  } catch (e) {
    root.innerHTML = `<main class="h-setup"><h1>😵 서버 연결 실패</h1><p>${esc(e.message)}</p><button class="btn btn-green" onclick="location.reload()">새로고침</button></main>`;
    return;
  }
  renderSetup();
}
window.__host = H;
boot();
