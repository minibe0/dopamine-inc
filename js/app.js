// 도파민 주식회사 — 학생 화면
import * as E from './engine.js';
import { sfx, setSfx, setBgm, soundPrefs } from './sound.js';
import { $, esc, won, signedWon, num, sleep, pick, shuffle, fill, store, toast, confetti, shake, countUp } from './util.js';
import { makeNick } from './nick.js';
import { rankList, statusLabel, harmAlerts, ALERT_TEXT, codexAdd, codexGet, codexCount, CODEX_KEYS } from './class.js';
import { getNet } from './net/index.js';
import * as R from './room.js';

const root = $('#app');
let DATA = null;

const S = {
  view: 'home',
  mode: null,              // 'solo' | 'class'
  game: null,
  sel: { h: null, t: null, a: null, fc: false },
  busy: false,
  token: 0,                // 화면이 바뀌면 진행 중이던 애니메이션을 멈추기 위한 번호
  net: null,
  room: null,              // { pin, session }
  meta: null,
  players: {},
  choices: {},
  choicesLoaded: false,
  metaUnsub: null,
  sessionUnsubs: [],
  alertQueue: [],
  alertTimer: null,
  prevRank: null,
};

// ───────────────────────── 공용 ─────────────────────────
function profile() {
  let p = store.get('dopa:profile', null);
  if (!p || !p.nick) { p = { ...makeNick(), rerolls: 3 }; store.set('dopa:profile', p); }
  return p;
}
const saveKey = () => (S.mode === 'class' && S.room ? `dopa:save:${S.room.pin}:${S.room.session}:${S.net.uid}` : 'dopa:save:solo');
const save = () => { if (S.game) store.set(saveKey(), S.game); };
const scenario = (day = S.game.day) => DATA.rounds[Math.min(day, DATA.rounds.length) - 1];
const optLabel = (k, v, sc) => fill(DATA.options[k][v].label, { group: sc.group });
const playerCount = () => Math.max(1, Object.keys(S.players || {}).length);
const liveTrust = () => (S.mode === 'class' ? E.classTrust(S.choices, playerCount()) : S.game.trust);
const fires = (v) => (v === 0 ? '<i class="ice">🧊</i>' : '🔥'.repeat(v));
const isGood = (key) => !!(E.ENDINGS[key] && E.ENDINGS[key].good);
// 내 채널 이름: 닉네임에서 끝 숫자를 뺀 뒤 TV (예: 네온 너구리 07 → 네온 너구리TV)
const channelName = () => `${String((S.game && S.game.nick) || profile().nick).replace(/\s*\d+$/, '')}TV`;

function show(html, view) {
  S.token++;
  S.view = view;
  root.innerHTML = html;
  root.scrollTop = 0;
  window.scrollTo(0, 0);
}

// ───────────────────────── 첫 화면 ─────────────────────────
function renderHome() {
  const p = profile();
  const solo = store.get('dopa:save:solo', null);
  const canResume = solo && solo.v === 1 && !solo.ending && solo.history && solo.history.length > 0;
  const cx = codexCount();
  const sp = soundPrefs();
  const pinFromUrl = new URLSearchParams(location.search).get('room') || '';
  show(`
  <main class="screen home">
    <div class="logo pop">
      <span class="logo-top">DOPAMINE</span>
      <span class="logo-bot">INC.</span>
      <span class="logo-sticker">주식회사</span>
    </div>
    <p class="tagline">돈 제일 많이 버는 편집장이 이김 💸</p>

    <div class="card nick-card">
      <div class="avatar">${esc(p.avatar)}</div>
      <div class="nick-text"><small>내 편집장 이름</small><b>${esc(p.nick)}</b></div>
      <button class="btn-mini" data-act="reroll" ${p.rerolls > 0 ? '' : 'disabled'} aria-label="이름 다시 뽑기">🎲<small>${p.rerolls}</small></button>
    </div>

    <div class="card join-card">
      <label for="pin">🏫 학급 PIN</label>
      <div class="pin-row">
        <input id="pin" inputmode="numeric" autocomplete="off" maxlength="4" placeholder="0000" value="${esc(pinFromUrl.replace(/\D/g, '').slice(0, 4))}">
        <button class="btn btn-green" data-act="join">입장 →</button>
      </div>
    </div>

    <button class="btn btn-purple wide" data-act="solo">🎮 혼자 연습하기</button>
    ${canResume ? `<button class="btn btn-ghost wide" data-act="resume">⏯ 혼자 연습 이어하기 <small>(${solo.day}일차)</small></button>` : ''}
    <a class="btn btn-ghost wide" href="about.html">ℹ️ 소개 · 이용안내</a>

    <div class="home-foot">
      <button class="btn-mini wide-mini" data-act="codex">📒 엔딩 도감 <b>${cx.got}/${cx.total}</b></button>
      <button class="btn-mini" data-act="sfx" aria-label="효과음">${sp.sfx ? '🔊' : '🔇'}</button>
      <button class="btn-mini ${sp.bgm ? 'on' : ''}" data-act="bgm" aria-label="배경음">🎵</button>
    </div>
    <p class="notice">${esc(DATA.notice)}</p>
  </main>`, 'home');
  const pin = $('#pin');
  pin.addEventListener('input', () => { pin.value = pin.value.replace(/\D/g, '').slice(0, 4); });
  pin.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinClass(pin.value); });
}

function renderCodex() {
  const c = codexGet();
  const hints = {
    legend: '깨끗하게 부자 되기', survive: '일단 10일 버티기', bankrupt: '💰이 바닥나면…', overdose: '🧠이 꽉 차면…',
    collapse: '🌐이 바닥나면…', police: '⚖️ 경고장 3장이면…',
    checker: '사실만 고집하기', balancer: '흥미와 사실 사이', shaky: '왔다 갔다', wrecker: '조회수에 영혼을 팔면',
  };
  const cell = (key, info, got) => `
    <div class="codex-cell ${got ? 'got' : 'locked'}">
      <div class="cx-emoji">${got ? info.emoji : '❓'}</div>
      <b>${got ? esc(info.name) : '???'}</b>
      <small>${esc(hints[key])}</small>
    </div>`;
  const cx = codexCount();
  show(`
  <main class="screen codex">
    <h2 class="title">📒 엔딩 도감 <span class="pill">${cx.got}/${cx.total}</span></h2>
    <h3 class="sub">엔딩 6종</h3>
    <div class="codex-grid">${CODEX_KEYS.endings.map((k) => cell(k, E.ENDINGS[k], c.endings[k])).join('')}</div>
    <h3 class="sub">편집장 유형 4종</h3>
    <div class="codex-grid">${CODEX_KEYS.personas.map((k) => cell(k, E.PERSONAS[k], c.personas[k])).join('')}</div>
    <button class="btn btn-ghost wide" data-act="home">← 처음으로</button>
  </main>`, 'codex');
}

// ───────────────────────── 게임 방법 ─────────────────────────
function renderHowto() {
  const cls = S.mode === 'class';
  show(`
  <main class="screen howto">
    <h2 class="title">게임 방법 <span class="pill">30초</span></h2>

    <section class="card how-goal pop">
      <span class="step-emoji">🎯</span>
      <p>나는 학교 뉴스 채널 <b>편집장</b>.<br>게임 속 <b>10일</b> 동안 기사를 내서 <b>돈을 제일 많이</b> 벌면 승리!<br><small>⏱️ 게임 속 하루 = 약 1분 · 한 판 = 약 10분</small></p>
    </section>

    <section class="card how-day pop" style="--d:1">
      <h3>하루에 할 일은 딱 이것</h3>
      <div class="how-flow">
        <div><span>📨</span><b>소식 도착</b></div><i>→</i>
        <div><span>👆</span><b>3개 고르기</b><small>제목 · 사진 · 누구에게</small></div><i>→</i>
        <div><span>🚀</span><b>발행</b></div>
      </div>
    </section>

    <section class="card how-rule pop" style="--d:2">
      <h3>🔑 딱 하나만 기억하기</h3>
      <div class="rule-row hot"><span>🔥</span><p><b>자극적으로 쓰면</b><br>오늘 돈 <b class="up">↑↑</b> &nbsp;그런데 <b>내일 아침</b> 대가가 와요 <small>(경고장·구독자 이탈·피해자)</small></p></div>
      <div class="rule-row calm"><span>🔍</span><p><b>사실대로 + 사실 확인하면</b><br>오늘 돈은 조금 &nbsp;그런데 <b>믿고 보는 구독자</b>가 매일 쌓여요</p></div>
    </section>

    <div class="card legend pop" style="--d:3">
      <h3>⚠️ 이렇게 되면 바로 끝</h3>
      <div class="legend-grid">
        <div><span>💰</span>돈 0원 → 파산</div>
        <div><span>🧠</span>자극 중독 100% → 폐쇄</div>
        <div><span>🌐</span>신뢰도 0% → 붕괴</div>
        <div><span>⚖️</span>경고장 3장 → 경찰서</div>
      </div>
      ${cls ? '<p class="note">🌐 신뢰도는 <b>우리 반 전체가 함께</b> 써요. 누가 가짜를 퍼뜨리면 모두 손해!</p>' : ''}
    </div>
    <p class="how-tip">💡 게임 중에 모르겠으면 위쪽 <b>❓</b> 버튼</p>
    <button class="btn btn-green wide big" data-act="start">알겠어! 1일차 시작 🚀</button>
  </main>`, 'howto');
}

// ───────────────────────── HUD ─────────────────────────
function hud() {
  const g = S.game;
  const trust = liveTrust();
  const need = E.threshold(g.dopamine);
  const sp = soundPrefs();
  const day = Math.min(g.day, E.CONFIG.totalDays);
  const ticker = shuffle(DATA.ticker).join('  ✦  ');
  return `
  <header class="hud">
    <div class="hud-top">
      <span class="day-pill">DAY ${day}<small>/${E.CONFIG.totalDays}</small></span>
      <span class="money ${g.money < 300000 ? 'danger' : ''}" id="hud-money">${won(g.money)}</span>
      ${S.mode === 'class' ? '<button class="icon" data-act="board" aria-label="리더보드">🏆</button>' : ''}
      <button class="icon" data-act="help" aria-label="도움말">❓</button>
      <button class="icon" data-act="sfx" aria-label="효과음">${sp.sfx ? '🔊' : '🔇'}</button>
    </div>
    <div class="gauges">
      <div class="g g-dopa ${g.dopamine >= 80 ? 'danger' : ''}"><span>🧠 자극 중독</span><b>${Math.round(g.dopamine)}%</b><i style="--v:${g.dopamine}"></i><em>요즘 기준 ${need ? '🔥'.repeat(need) : '없음'}</em></div>
      <div class="g g-trust ${trust <= 20 ? 'danger' : ''}" id="hud-trust"><span>🌐 ${S.mode === 'class' ? '학급 신뢰도' : '신뢰도'}</span><b>${Math.round(trust)}%</b><i style="--v:${trust}"></i></div>
      <div class="g g-warn ${g.warnings >= 2 ? 'danger' : ''}"><span>⚖️ 경고장</span><b class="dots">${'●'.repeat(g.warnings)}${'○'.repeat(Math.max(0, E.CONFIG.maxWarnings - g.warnings))}</b></div>
      <div class="g g-subs"><span>💚 구독자</span><b>${num(g.subs)}</b></div>
    </div>
    <div class="ticker"><div class="ticker-in"><span>${esc(ticker)}</span><span>${esc(ticker)}</span></div></div>
  </header>`;
}

function refreshTrust(flash = false) {
  const el = $('#hud-trust');
  if (!el || !S.game) return;
  const t = liveTrust();
  el.querySelector('b').textContent = `${Math.round(t)}%`;
  el.querySelector('i').style.setProperty('--v', t);
  el.classList.toggle('danger', t <= 20);
  if (flash) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
}

// ───────────────────────── 1) 편집 ─────────────────────────
function renderEdit() {
  const g = S.game;
  const sc = scenario();
  S.sel = { h: null, t: null, a: null, fc: false };
  const row = (k, title, q) => `
    <div class="row" data-row="${k}">
      <div class="row-label">${title} <small>${q}</small></div>
      <div class="chips">
        ${[0, 1, 2].map((v) => `
          <button class="chip" data-act="pick" data-k="${k}" data-v="${v}">
            <span class="ce">${DATA.options[k][v].emoji}</span>
            <span class="cl">${esc(optLabel(k, v, sc))}</span>
            <span class="cf">${fires(v)}</span>
          </button>`).join('')}
      </div>
    </div>`;
  show(`${hud()}
  <main class="screen game edit">
    <section class="card fact pop">
      <div class="sticker">📨 ${g.day}일차 제보</div>
      <div class="fact-emoji">${sc.scene}</div>
      <h3>${esc(sc.title)}</h3>
      <p>${esc(sc.fact)}</p>
    </section>

    <section class="editor">
      ${g.day <= 2 ? `<div class="coach">💡 위에서부터 <b>하나씩</b> 고르면 아래 미리보기가 바뀌어요.<br>🔥가 많을수록 오늘 조회수 ↑ · 대신 <b>내일 아침</b>에 대가가 와요.</div>` : ''}
      ${row('h', '① 제목', '어떻게 쓸까?')}
      ${row('t', '② 사진', '어떤 사진을 붙일까?')}
      ${row('a', '③ 누구에게', '누구한테 보낼까?')}
      <button class="fc-toggle" data-act="fc" aria-pressed="false">
        <span>🔍 사실 확인하기 <small>취재비 −${num(E.CONFIG.factCheckCost)}원 · 믿고 보는 구독자 ↑</small></span><span class="sw"></span>
      </button>
    </section>

    <section class="card preview" id="preview"></section>
    <div class="dock">
      <div class="stim" id="stim"></div>
      <button class="btn btn-publish wide big" data-act="publish" id="publish" disabled>발행 🚀</button>
    </div>
  </main>`, 'game');
  updateEditor();
}

function updateEditor() {
  const sc = scenario();
  const { h, t, a, fc } = S.sel;
  root.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', S.sel[b.dataset.k] === Number(b.dataset.v)));
  const ft = $('.fc-toggle');
  if (ft) { ft.classList.toggle('on', fc); ft.setAttribute('aria-pressed', String(fc)); }

  const scene = sc.scene;
  const thumb = t === null
    ? `<div class="thumb t-none"><span>② 사진을 골라 주세요</span></div>`
    : `<div class="thumb t-${t}">
         <span class="scene">${scene}</span>
         ${t === 0 ? '<span class="tag">📷 원본</span>' : ''}
         ${t === 1 ? '<span class="shock">😱</span><span class="burst">충격</span><span class="tag red">실화?!</span>' : ''}
         ${t === 2 ? '<span class="ai-badge">AI 생성</span><span class="tag fake">※ 실제로 없던 장면</span>' : ''}
       </div>`;
  const head = h === null ? '<span class="ph">① 제목을 골라 주세요</span>' : esc(sc.headlines[h]);
  const target = a === null ? '' : `<span class="pv-pill a-${a}">${DATA.options.a[a].emoji} ${esc(optLabel('a', a, sc))}</span>`;
  const memo = fc ? `<div class="memo pop">🔍 <b>취재 메모</b> ${esc(sc.factNote)}${h === 2 ? '<br><small>…확인해 보니 이 제목은 사실이 아니다.</small>' : ''}</div>` : '';
  $('#preview').innerHTML = `
    <div class="pv-top"><span class="pv-ch">📺 ${esc(channelName())}</span><span class="pv-time">방금 전</span></div>
    ${thumb}
    <div class="pv-head h-${h ?? 'x'}">${head}</div>
    <div class="pv-meta">${target}</div>
    ${memo}`;

  const done = h !== null && t !== null && a !== null;
  const Sv = (h ?? 0) + (t ?? 0) + (a ?? 0);
  const need = E.threshold(S.game.dopamine);
  const slots = Array.from({ length: 6 }, (_, i) => `<span class="slot ${i < Sv ? 'lit' : ''} ${i === need - 1 ? 'need' : ''}">🔥</span>`).join('');
  let hint = '① 제목 ② 사진 ③ 누구에게 — 3개를 다 고르면 발행 버튼이 켜져요';
  if (done) hint = Sv >= need ? '👍 요즘 기준 통과! 조회수 100%' : `🥶 요즘 사람들은 🔥${need}개 이상이어야 봐요 → 조회수 ↓`;
  $('#stim').innerHTML = `<div class="stim-row"><b>자극도</b><div class="slots">${slots}</div></div><small>${hint}</small>`;
  $('#publish').disabled = !done;
}

async function doPublish() {
  const g = S.game;
  const c = S.sel;
  if (S.busy || !g || g.phase !== 'edit' || c.h === null || c.t === null || c.a === null) return;
  S.busy = true;
  try {
    if (S.mode === 'class') g.trust = liveTrust();
    const res = E.publish(g, scenario(), c);
    save();
    sfx.publish();
    if (S.mode === 'class') { submitChoice(res); syncPlayer(); }
    await renderResult(false);
  } finally {
    S.busy = false;
  }
}

// ───────────────────────── 2) 발행 결과 ─────────────────────────
function makeComments(r) {
  const C = DATA.comments;
  const base = r.S <= 1 ? C.calm : r.S <= 3 ? C.spicy : C.toxic;
  const list = shuffle(base).slice(0, 5);
  if (r.choice.h === 2 || r.choice.t === 2) list.push(...shuffle(C.skeptic).slice(0, 2));
  if (r.choice.fc && r.choice.h <= 1) list.push(...shuffle(C.fc).slice(0, 2));
  if (r.S >= 2 && r.S <= 3) list.push(pick(C.calm));
  return shuffle(list).slice(0, 8).map((text) => ({ user: pick(C.users), text, likes: Math.floor(Math.random() * Math.max(3, r.views / 500)) }));
}

async function renderResult(isStatic) {
  const g = S.game;
  const r = g.lastResult;
  if (!r) { renderEdit(); return; }
  const over = !!g.ending;
  const badges = [
    r.tolerance ? '<span class="badge cold">🥶 요즘 기준보다 심심함 → 조회수 ↓</span>' : '',
    r.fatigue ? '<span class="badge tired">🥱 자극 피로 → 조회수 ↓</span>' : '',
    r.fcBonus ? '<span class="badge fc">🔍 사실 확인 보너스 ×1.4</span>' : '',
    r.S >= 5 ? '<span class="badge hot">🔥 떡상 각</span>' : '',
  ].join('');
  show(`${hud()}
  <main class="screen game result">
    <section class="card result-card pop">
      <div class="sticker">📈 발행 결과</div>
      <div class="big-num"><small>조회수</small><b id="r-views">${isStatic ? num(r.views) : '0'}</b></div>
      <div class="big-num profit ${r.profit >= 0 ? 'pos' : 'neg'}"><small>오늘 수익</small><b id="r-profit">${isStatic ? signedWon(r.profit) : '+0원'}</b></div>
      <div class="breakdown">광고 +${num(r.adRev)} · 구독 +${num(r.subRev)} · 서버비 −${num(E.CONFIG.serverCost)}${r.choice.fc ? ` · 취재비 −${num(E.CONFIG.factCheckCost)}` : ''}</div>
      <div class="badges">${badges}</div>
      <div class="rank-line" id="rank-line"></div>
      ${r.day <= 2 && !over ? '<div class="coach">💡 돈은 <b>오늘</b> 들어와요. 이 기사의 대가는 <b>내일 아침</b>에 확인!</div>' : ''}
    </section>
    <section class="card comments">
      <div class="c-head">💬 구독자 반응 <span class="fake-tag">가상</span></div>
      <ul id="c-list"></ul>
    </section>
    <button class="btn ${over ? 'btn-red' : 'btn-green'} wide big" data-act="next" id="next" ${isStatic ? '' : 'disabled'}>${over ? '결과 보기 💀' : '다음 날 ☀️'}</button>
  </main>`, 'game');

  const list = $('#c-list');
  const comments = makeComments(r);
  const addComment = (cm) => {
    const li = document.createElement('li');
    li.className = 'cm';
    li.innerHTML = `<b>@${esc(cm.user)}</b><span>${esc(cm.text)}</span><em>♥ ${num(cm.likes)}</em>`;
    list.prepend(li);
  };
  if (isStatic) { comments.forEach(addComment); showRank(); return; }

  const tk = S.token;
  await countUp($('#r-views'), r.views, 1100, num, sfx.tick);
  if (tk !== S.token) return;
  await countUp($('#r-profit'), r.profit, 450, signedWon);
  if (tk !== S.token) return;
  if (r.profit >= 0) { sfx.cash(); if (r.profit >= 150000) confetti(['💸', '💰', '✨', '🤑']); } else sfx.loss();
  floatMoney(r.profit);
  $('#hud-money').textContent = won(g.money);
  showRank();
  for (const cm of comments) {
    await sleep(170);
    if (tk !== S.token) return;
    addComment(cm); sfx.comment();
  }
  const btn = $('#next');
  if (btn) btn.disabled = false;
  if (over) { sfx.gameover(); shake(); }
}

function floatMoney(v) {
  const el = document.createElement('div');
  el.className = `float-money ${v >= 0 ? 'pos' : 'neg'}`;
  el.textContent = signedWon(v);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1400);
}

function showRank() {
  const el = $('#rank-line');
  if (!el || S.mode !== 'class') return;
  const list = rankList(S.players);
  const me = list.find((p) => p.uid === S.net.uid);
  if (!me) return;
  el.innerHTML = `🏆 학급 순위 <b>${me.rank}위</b> / ${list.length}명`;
  if (me.rank === 1 && S.prevRank !== 1 && list.length > 1 && !me.dead) { toast('👑 학급 1위 등극!', 'good', 2000); sfx.fanfare(); }
  S.prevRank = me.rank;
}

// ───────────────────────── 3) 다음 날 아침 ─────────────────────────
function doMorning() {
  const g = S.game;
  if (S.busy || !g) return;
  if (g.phase === 'ended') { renderEnd(); return; }
  if (g.phase !== 'result') { renderGame(); return; }
  E.morning(g, S.mode === 'class' ? liveTrust() : undefined);
  save();
  if (S.mode === 'class') syncPlayer();
  renderMorning(false);
}

function morningItems() {
  const g = S.game;
  const m = g.lastMorning;
  const r = g.lastResult;
  const prevSc = DATA.rounds[(r ? r.day : 1) - 1];
  const M = DATA.morning;
  const items = [];
  for (const ev of m.events) {
    if (ev.type === 'warning') items.push({ cls: 'warn', html: esc(M[ev.key]), snd: 'warn' });
    else if (ev.type === 'victim') items.push({ cls: 'victim', html: `<b>💔 피해자 소식</b><br>${esc(prevSc.victim)}`, snd: 'victim' });
    else if (ev.type === 'adcut') items.push({ cls: 'bad', html: esc(M.adcut), snd: 'loss' });
    else if (ev.type === 'subsUp') items.push({ cls: 'good', html: esc(fill(M.subsUp, { n: num(ev.n) })), snd: 'good' });
    else if (ev.type === 'subsDown') items.push({ cls: 'bad', html: esc(fill(M.subsDown, { n: num(ev.n) })), snd: 'loss' });
    else if (ev.type === 'factcheck') items.push({ cls: 'good', html: esc(M.factcheck), snd: 'good' });
    else if (ev.type === 'fatigue') items.push({ cls: 'bad', html: esc(M.fatigue), snd: 'loss' });
  }
  if (r && r.needUp) items.push({ cls: 'bad', html: esc(fill(M.needUp, { n: r.newNeed })), snd: 'warn' });
  if (r && r.needDown) items.push({ cls: 'good', html: esc(fill(M.needDown, { n: r.newNeed })), snd: 'good' });
  return items;
}

async function renderMorning(isStatic) {
  const g = S.game;
  const m = g.lastMorning;
  if (!m) { renderEdit(); return; }
  const final = m.day > E.CONFIG.totalDays;
  const items = morningItems();
  const tDiff = Math.round(m.trustAfter) - Math.round(m.trustBefore);
  const trustLine = S.mode === 'class'
    ? `🌐 학급 신뢰도 <b>${Math.round(m.trustAfter)}%</b> <small>(${tDiff >= 0 ? '+' : ''}${tDiff}, 우리 반 모두의 기사 영향)</small>`
    : `🌐 사회 신뢰도 ${Math.round(m.trustBefore)}% → <b>${Math.round(m.trustAfter)}%</b>`;
  const over = !!g.ending;
  show(`${hud()}
  <main class="screen game morning">
    <section class="card morning-card pop">
      <div class="sticker">${final ? '🏁 최종 정산' : `☀️ ${m.day}일차 아침`}</div>
      <h3>어제 기사의 후폭풍</h3>
      ${m.day <= 3 ? '<div class="coach">💡 어제 고른 제목·사진·대상 때문에 생긴 일이에요</div>' : ''}
      <ul class="events" id="events">
        ${items.length ? '' : '<li class="ev calm show">😌 조용한 아침. 별일 없었다.</li>'}
      </ul>
      <div class="trust-line">${trustLine}</div>
      ${g.warnings ? `<div class="trust-line">⚖️ 경고장 <b>${g.warnings}/${E.CONFIG.maxWarnings}</b>${g.warnings === 2 && !over ? ' <small>— 한 장 더 오면 경찰서!</small>' : ''}</div>` : ''}
    </section>
    <button class="btn ${over ? (isGood(g.ending) ? 'btn-green' : 'btn-red') : 'btn-purple'} wide big" data-act="today" id="today" ${isStatic ? '' : 'disabled'}>
      ${over ? (isGood(g.ending) ? '결과 보기 🏁' : '결과 보기 💀') : '오늘의 제보 보기 📨'}
    </button>
  </main>`, 'game');

  const ul = $('#events');
  const tk = S.token;
  for (const it of items) {
    const li = document.createElement('li');
    li.className = `ev ${it.cls}`;
    li.innerHTML = it.html;
    ul.appendChild(li);
    if (isStatic) { li.classList.add('show'); continue; }
    await sleep(380);
    if (tk !== S.token) return;
    li.classList.add('show');
    sfx[it.snd]?.();
    if (it.cls === 'warn') shake();
  }
  const btn = $('#today');
  if (btn) btn.disabled = false;
}

function doToday() {
  const g = S.game;
  if (S.busy || !g) return;
  if (g.ending) { renderEnd(); return; }
  E.startDay(g);
  if (S.mode === 'class' && liveTrust() <= 0) { collapseNow(); return; }
  save();
  sfx.whoosh();
  renderEdit();
}

function collapseNow() {
  E.forceCollapse(S.game);
  save();
  syncPlayer();
  sfx.siren();
  toast('🌐 학급 신뢰도 0%… 미디어 생태계 붕괴', 'alert', 3000);
  renderEnd();
}

// ───────────────────────── 4) 엔딩 ─────────────────────────
const THINK = {
  legend: '자극 없이도 사람들이 찾아온 비결은 뭐였을까?',
  survive: '돈을 더 벌려면 뭘 바꿔야 했을까? 자극일까, 신뢰일까?',
  bankrupt: '조회수는 높았는데 왜 돈이 바닥났을까?',
  overdose: '자극이 점점 세져야 했던 이유는? 내 휴대폰 속 알고리즘도 그럴까?',
  collapse: '아무도 뉴스를 믿지 않는 세상에선 누가 제일 손해일까?',
  police: '합성 사진 속 친구는 그 사진을 보고 어떤 기분이었을까?',
  timeup: '오늘 내가 가장 고민했던 선택은 무엇이었나?',
};

function renderEnd() {
  const g = S.game;
  if (!g || !g.ending) { renderHome(); return; }
  const en = E.ENDINGS[g.ending];
  const pe = E.PERSONAS[g.persona] || E.PERSONAS.shaky;
  const sm = E.summary(g);
  const good = en.good;

  let fresh = { ending: false, persona: false };
  if (!g.recorded) {
    fresh = codexAdd(g.ending === 'timeup' ? null : g.ending, g.persona);
    g.recorded = true;
    save();
  }
  let bestLine = '';
  if (S.mode !== 'class') {
    const best = store.get('dopa:best', 0);
    const score = good ? g.money : 0;
    if (score > best) { store.set('dopa:best', score); bestLine = '<span class="newbest">NEW BEST!</span>'; }
    const top = Math.max(best, score);
    bestLine += top > 0 ? `<small>최고 기록 ${won(top)}</small>` : '<small>살아남아야 기록이 남아요</small>';
  }
  const cx = codexCount();
  show(`
  <main class="screen end">
    <section class="end-card ${good ? 'good' : 'bad'} pop">
      ${fresh.ending ? '<span class="new-sticker">NEW!</span>' : ''}
      <div class="end-emoji">${en.emoji}</div>
      <small>ENDING</small>
      <h1>${esc(en.name)}</h1>
      <p>${esc(en.desc)}</p>
    </section>

    <section class="card persona pop" style="--d:1">
      ${fresh.persona ? '<span class="new-sticker">NEW!</span>' : ''}
      <div class="pe-emoji">${pe.emoji}</div>
      <div><small>나의 편집장 유형</small><b>${esc(pe.name)}</b><p>${esc(pe.desc)}</p></div>
    </section>

    <section class="card score pop" style="--d:2">
      <small>최종 기록</small>
      <b class="${good ? '' : 'void'}">${good ? won(g.money) : `<s>${won(g.money)}</s> 기록 무효 💀`}</b>
      ${bestLine}
    </section>

    <section class="card stats pop" style="--d:3">
      <div><b>${sm.days}일</b><small>버틴 날</small></div>
      <div><b>${num(sm.totalViews)}</b><small>총 조회수</small></div>
      <div><b>${num(g.subs)}</b><small>구독자</small></div>
      <div class="${sm.deepfakes ? 'red' : ''}"><b>${sm.deepfakes}번</b><small>AI 가짜 사진</small></div>
      <div class="${sm.victims ? 'red' : ''}"><b>${sm.victims}명</b><small>상처받은 사람</small></div>
      <div class="${sm.factChecks ? 'green' : ''}"><b>${sm.factChecks}번</b><small>사실 확인</small></div>
    </section>

    ${S.mode === 'class' ? `<section class="card board-inline pop" style="--d:4"><h3>🏆 우리 반 리더보드</h3><div id="board-inline">${boardHtml(8)}</div></section>` : ''}

    <section class="card think pop" style="--d:5"><b>🤔 생각해 보기</b><p>${esc(THINK[g.ending])}</p></section>

    <button class="btn-mini wide-mini codex-link" data-act="codex">📒 엔딩 도감 <b>${cx.got}/${cx.total}</b> 모으는 중</button>

    ${S.mode === 'class'
      ? `<p class="wait-note">⏳ 선생님이 새 판을 열면 자동으로 다시 시작돼요</p>
         <button class="btn btn-ghost wide" data-act="board">🏆 전체 리더보드</button>`
      : `<button class="btn btn-green wide big" data-act="solo">🔁 다시 하기</button>
         <button class="btn btn-ghost wide" data-act="home">🏠 처음으로</button>`}
  </main>`, 'end');

  if (good) { sfx.fanfare(); confetti(['🏆', '✨', '💚', '🎉']); } else { sfx.gameover(); }
  if (fresh.ending || fresh.persona) setTimeout(() => { sfx.unlock(); toast('📒 도감에 새 카드가 추가됐어요!', 'good'); }, 900);
}

function renderGame() {
  const g = S.game;
  if (!g) { renderHome(); return; }
  if (g.phase === 'ended') renderEnd();
  else if (g.phase === 'result') renderResult(true);
  else if (g.phase === 'morning') renderMorning(true);
  else renderEdit();
}

// ───────────────────────── 학급 모드 ─────────────────────────
async function joinClass(raw) {
  const pin = String(raw || '').replace(/\D/g, '');
  if (pin.length !== 4) { toast('PIN 4자리를 입력해 주세요', 'bad'); sfx.loss(); return; }
  const btn = $('[data-act="join"]');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    S.net = await getNet();
    const meta = await R.findRoom(S.net, pin);
    if (!meta) { toast('방을 찾을 수 없어요. PIN을 확인해 주세요', 'bad'); sfx.loss(); return; }
    leaveClass(false);
    S.mode = 'class';
    S.room = { pin, session: null };
    S.meta = null;
    store.set('dopa:lastroom', pin);
    sfx.select();
    S.metaUnsub = S.net.on(R.metaPath(pin), onMeta);
  } catch (e) {
    toast(esc(e.message || '연결 오류'), 'bad', 3500);
  } finally {
    const b = $('[data-act="join"]');
    if (b) { b.disabled = false; b.textContent = '입장 →'; }
  }
}

function leaveClass(goHome = true) {
  if (S.metaUnsub) { S.metaUnsub(); S.metaUnsub = null; }
  S.sessionUnsubs.forEach((u) => u());
  S.sessionUnsubs = [];
  S.room = null; S.meta = null; S.players = {}; S.choices = {}; S.choicesLoaded = false; S.prevRank = null;
  closeBoard();
  if (S.mode === 'class') { S.mode = null; S.game = null; }
  if (goHome) renderHome();
}

function onMeta(meta) {
  if (S.mode !== 'class' || !S.room) return;
  if (!meta) { toast('선생님이 방을 닫았어요', 'info', 3000); leaveClass(); return; }
  const prev = S.meta;
  S.meta = meta;
  if (meta.session !== S.room.session) { enterSession(meta.session); return; }
  if (prev && prev.status !== meta.status) {
    if (meta.status === 'playing' && S.view === 'lobby') { sfx.unlock(); renderHowto(); }
    else if (meta.status === 'ended' && S.game && !S.game.ending) {
      E.forceTimeUp(S.game); save(); syncPlayer();
      toast('⏰ 선생님이 판을 끝냈어요!', 'info'); renderEnd();
    } else if (S.view === 'lobby') renderLobby();
  }
}

function enterSession(session) {
  S.sessionUnsubs.forEach((u) => u());
  S.sessionUnsubs = [];
  S.room.session = session;
  S.players = {}; S.choices = {}; S.choicesLoaded = false; S.prevRank = null;
  closeBoard();
  const saved = store.get(saveKey(), null);
  S.game = saved && saved.v === 1 ? saved : E.newGame(true);
  S.game.shared = true;
  if (!S.game.joinedAt) S.game.joinedAt = Date.now();
  if (!S.game.nick) { const p = profile(); S.game.nick = p.nick; S.game.avatar = p.avatar; }
  S.nickChecked = false;
  save();
  syncPlayer();
  const { pin } = S.room;
  S.sessionUnsubs.push(S.net.on(R.playersPath(pin, session), onPlayers));
  S.sessionUnsubs.push(S.net.on(R.choicesPath(pin, session), onChoices));

  const g = S.game;
  const st = S.meta.status;
  if (st === 'ended' && !g.ending && g.history.length) { E.forceTimeUp(g); save(); syncPlayer(); }
  if (g.ending) renderEnd();
  else if (g.history.length || g.phase !== 'edit') renderGame();
  else if (st === 'playing') renderHowto();
  else renderLobby();
}

function playerState() {
  const g = S.game;
  return {
    nick: g.nick, avatar: g.avatar, joinedAt: g.joinedAt || Date.now(),
    money: g.money, day: g.history.length,
    status: g.ending ? 'ended' : 'playing',
    ending: g.ending || '', persona: g.ending ? (g.persona || '') : '',
    updatedAt: Date.now(),
  };
}

function syncPlayer() {
  if (S.mode !== 'class' || !S.room || !S.room.session || !S.game) return;
  Promise.resolve(S.net.update(R.playerPath(S.room.pin, S.room.session, S.net.uid), playerState()))
    .catch((e) => console.warn('[sync] 플레이어 저장 실패', e));
}

function submitChoice(r) {
  if (!S.room || !S.room.session) return;
  const c = r.choice;
  Promise.resolve(S.net.writeOnce(R.choicePath(S.room.pin, S.room.session, S.net.uid, r.day), { h: c.h, t: c.t, a: c.a, fc: !!c.fc, money: r.money }))
    .catch((e) => console.warn('[sync] 선택 저장 실패', e));
}

// 새로고침 등으로 서버에 못 보낸 기록이 있으면 다시 보냄
function ensureSubmitted() {
  const mine = S.choices[S.net.uid] || {};
  for (const r of S.game.history) if (!mine[r.day]) submitChoice(r);
}

function onPlayers(players) {
  S.players = players || {};
  dedupeNick();
  if (S.view === 'lobby') updateLobby();
  if ($('#board-list')) $('#board-list').innerHTML = boardHtml(100);
  if ($('#board-inline')) $('#board-inline').innerHTML = boardHtml(8);
  if (S.view === 'game') refreshTrust();
}

function onChoices(choices) {
  const next = choices || {};
  if (S.choicesLoaded) queueAlerts(harmAlerts(S.choices, next, S.net.uid));
  S.choices = next;
  if (!S.choicesLoaded) { S.choicesLoaded = true; if (S.game) ensureSubmitted(); }
  if (S.view === 'game') refreshTrust();
  const g = S.game;
  if (g && !g.ending && g.phase === 'edit' && S.view === 'game' && !S.busy && liveTrust() <= 0) collapseNow();
}

function queueAlerts(list) {
  if (!list.length || S.mode !== 'class') return;
  S.alertQueue.push(...list);
  if (!S.alertTimer) flushAlerts();
}
function flushAlerts() {
  if (!S.alertQueue.length || S.mode !== 'class') { S.alertTimer = null; S.alertQueue = []; return; }
  const q = S.alertQueue;
  S.alertQueue = [];
  const kind = q.includes('deepfake') ? 'deepfake' : q[0];
  const text = q.length > 1 ? `🚨 편집장 ${q.length}명이 선 넘는 기사를 냈다!` : ALERT_TEXT[kind];
  toast(`${text}<br><small>학급 신뢰도 ▼ 지금 ${Math.round(liveTrust())}%</small>`, 'alert', 2800);
  sfx.siren();
  refreshTrust(true);
  S.alertTimer = setTimeout(flushAlerts, 3500);
}

// 같은 반에 같은 닉네임이 있으면 늦게 들어온 쪽이 자동으로 새 이름을 받음
function dedupeNick() {
  const g = S.game;
  if (!g || S.nickChecked || !S.players[S.net.uid]) return;
  S.nickChecked = true;
  const me = S.net.uid;
  const clash = Object.entries(S.players).some(([uid, p]) => uid !== me && p && p.nick === g.nick &&
    ((p.joinedAt || 0) < g.joinedAt || ((p.joinedAt || 0) === g.joinedAt && uid < me)));
  if (!clash) return;
  const n = makeNick();
  g.nick = n.nick; g.avatar = n.avatar;
  save(); syncPlayer();
  if (S.view === 'lobby') renderLobby();
}

function renderLobby() {
  const p = { nick: S.game ? S.game.nick : profile().nick, avatar: S.game ? S.game.avatar : profile().avatar };
  const ended = S.meta && S.meta.status === 'ended';
  show(`
  <main class="screen lobby">
    <section class="card lobby-card pop">
      <div class="sticker">🏫 PIN ${esc(S.room.pin)}</div>
      <div class="lobby-emoji">${ended ? '🏁' : '⏳'}</div>
      <h2>${ended ? '이번 판은 끝났어요' : '입장 완료!'}</h2>
      <p>${ended ? '선생님이 새 판을 열면 자동으로 시작돼요' : '선생님이 시작하면 바로 시작돼요'}</p>
    </section>
    <div class="card me-card"><span class="avatar">${esc(p.avatar)}</span><div><small>나</small><b>${esc(p.nick)}</b></div></div>
    <h3 class="sub">같이 있는 편집장 <span class="pill" id="lobby-count">0</span></h3>
    <div class="bubbles" id="bubbles"></div>
    ${S.net && S.net.kind === 'local' ? '<p class="notice">🧪 로컬 체험 모드 — 같은 기기의 탭끼리만 연결돼요</p>' : ''}
    <button class="btn btn-ghost wide" data-act="leave">나가기</button>
  </main>`, 'lobby');
  updateLobby();
}

function updateLobby() {
  const list = rankList(S.players).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  const c = $('#lobby-count'); if (c) c.textContent = String(list.length);
  const b = $('#bubbles');
  if (b) b.innerHTML = list.map((p) => `<span class="bubble ${p.uid === S.net.uid ? 'me' : ''}">${esc(p.avatar)} ${esc(p.nick)}</span>`).join('');
}

// ───────────────────────── 리더보드 ─────────────────────────
function boardHtml(limit) {
  const list = rankList(S.players);
  if (!list.length) return '<p class="empty">아직 아무도 없어요</p>';
  const myUid = S.net && S.net.uid;
  const mine = list.find((p) => p.uid === myUid);
  let shown = list.slice(0, limit);
  if (mine && !shown.includes(mine)) shown = [...shown, mine];
  const medal = (r) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `${r}`);
  return `<ol class="board-list">${shown.map((p) => `
    <li class="${p.uid === myUid ? 'me' : ''} ${p.dead ? 'dead' : ''}">
      <span class="rk">${p.dead ? '💀' : medal(p.rank)}</span>
      <span class="av">${esc(p.avatar)}</span>
      <span class="nm">${esc(p.nick)}${p.uid === myUid ? ' <i>나</i>' : ''}<small>${esc(statusLabel(p))}</small></span>
      <span class="mn">${p.dead ? `<s>${won(p.money)}</s>` : won(p.money)}</span>
    </li>`).join('')}</ol>`;
}

function openHelp() {
  closeBoard();
  const el = document.createElement('div');
  el.className = 'modal';
  el.id = 'help';
  el.innerHTML = `
    <div class="modal-box pop help-box">
      <div class="modal-head"><h3>❓ 화면 보는 법</h3><button class="icon" data-act="close-board" aria-label="닫기">✕</button></div>
      <ul class="help-list">
        <li><span>💰</span><div><b>돈</b>매일 서버비가 나가요. <em>0원이면 파산</em></div></li>
        <li><span>🧠</span><div><b>자극 중독</b>자극적인 기사를 쓸수록 올라가요. 높을수록 사람들은 더 센 🔥만 봐요. <em>100%면 폐쇄</em></div></li>
        <li><span>🌐</span><div><b>신뢰도</b>가짜·과장 기사를 쓸수록 내려가요. 낮으면 광고비도 줄어요. <em>0%면 붕괴</em>${S.mode === 'class' ? ' (우리 반 전체가 함께 써요)' : ''}</div></li>
        <li><span>⚖️</span><div><b>경고장</b>AI 가짜 사진, 거짓말로 단톡방 저격하면 1장. <em>3장이면 경찰서</em></div></li>
        <li><span>💚</span><div><b>구독자</b>사실대로 쓰면 늘어나고, 매일 돈을 줘요</div></li>
      </ul>
      <p class="help-rule">🔑 <b>자극 = 오늘 돈 ↑ · 내일 대가 ↑</b><br>🔍 <b>사실 확인 = 오늘 돈 조금 · 구독자 쌓임</b></p>
    </div>`;
  el.addEventListener('click', (e) => { if (e.target === el) closeBoard(); });
  document.body.appendChild(el);
  sfx.whoosh();
}

function openBoard() {
  if (S.mode !== 'class') return;
  closeBoard();
  const el = document.createElement('div');
  el.className = 'modal';
  el.id = 'board';
  el.innerHTML = `
    <div class="modal-box pop">
      <div class="modal-head"><h3>🏆 우리 반 리더보드</h3><button class="icon" data-act="close-board" aria-label="닫기">✕</button></div>
      <p class="modal-note">💀 게임 오버는 기록 무효 · 🌐 학급 신뢰도 ${Math.round(liveTrust())}%</p>
      <div id="board-list">${boardHtml(100)}</div>
    </div>`;
  el.addEventListener('click', (e) => { if (e.target === el) closeBoard(); });
  document.body.appendChild(el);
  sfx.whoosh();
}
function closeBoard() { ['#board', '#help'].forEach((id) => { const el = $(id); if (el) el.remove(); }); }

// ───────────────────────── 버튼 처리 ─────────────────────────
const ACTIONS = {
  reroll() {
    const p = profile();
    if (p.rerolls <= 0) return;
    const n = makeNick();
    store.set('dopa:profile', { ...n, rerolls: p.rerolls - 1 });
    sfx.select();
    renderHome();
  },
  join() { joinClass($('#pin') ? $('#pin').value : ''); },
  solo() {
    leaveClass(false);
    S.mode = 'solo';
    S.game = E.newGame(false);
    save();
    sfx.select();
    renderHowto();
  },
  resume() {
    const g = store.get('dopa:save:solo', null);
    if (!g || g.v !== 1) { renderHome(); return; }
    leaveClass(false);
    S.mode = 'solo'; S.game = g; sfx.select(); renderGame();
  },
  start() { sfx.whoosh(); renderEdit(); },
  pick(b) {
    if (S.busy) return;
    S.sel[b.dataset.k] = Number(b.dataset.v);
    sfx.select();
    updateEditor();
  },
  fc() { if (S.busy) return; S.sel.fc = !S.sel.fc; sfx.toggle(); updateEditor(); },
  publish() { doPublish(); },
  next() { doMorning(); },
  today() { doToday(); },
  codex() { sfx.tap(); renderCodex(); },
  home() { sfx.tap(); if (S.mode === 'class') leaveClass(); else { S.mode = null; renderHome(); } },
  leave() { sfx.tap(); leaveClass(); },
  board() { openBoard(); },
  help() { openHelp(); },
  'close-board'() { sfx.tap(); closeBoard(); },
  sfx() {
    const on = !soundPrefs().sfx; setSfx(on); if (on) sfx.toggle();
    document.querySelectorAll('[data-act="sfx"]').forEach((b) => { b.textContent = on ? '🔊' : '🔇'; });
  },
  bgm() {
    const on = !soundPrefs().bgm; setBgm(on);
    document.querySelectorAll('[data-act="bgm"]').forEach((b) => b.classList.toggle('on', on));
    toast(on ? '🎵 배경음 켜짐' : '🎵 배경음 꺼짐', 'info', 1200);
  },
};

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const fn = ACTIONS[b.dataset.act];
  if (!fn) return;
  try { fn(b); } catch (err) { reportError(err); }
});

function reportError(err) {
  console.error(err);
  toast('앗, 오류가 났어요. 새로고침하면 이어서 할 수 있어요 🙏', 'bad', 4000);
}
window.addEventListener('error', (e) => reportError(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => reportError(e.reason));

// ───────────────────────── 시작 ─────────────────────────
async function boot() {
  try {
    const res = await fetch('data/scenarios.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    DATA = await res.json();
  } catch (e) {
    root.innerHTML = `<main class="screen"><div class="card"><h2>😵 게임 데이터를 못 불러왔어요</h2><p>인터넷 연결을 확인하고 새로고침해 주세요.</p><button class="btn btn-green wide" onclick="location.reload()">새로고침</button></div></main>`;
    return;
  }
  window.__dopaBooted = true;
  const lost = document.getElementById('boot-fail'); if (lost) lost.remove();
  renderHome();
  const pin = new URLSearchParams(location.search).get('room');
  if (pin && /^\d{4}$/.test(pin)) joinClass(pin);
}

// 테스트용 훅 (자동 테스트에서 상태 확인)
window.__dopa = { S, E };
boot();
