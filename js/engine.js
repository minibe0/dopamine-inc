// 도파민 주식회사 — 게임 규칙 (화면과 분리된 순수 로직, Node에서도 실행됨)
// 돈 단위: 원

export const CONFIG = {
  totalDays: 10,
  startMoney: 1_000_000,
  serverCost: 120_000,      // 매일 서버비
  factCheckCost: 40_000,    // 팩트체크 취재비
  startDopamine: 30,
  startTrust: 70,
  maxWarnings: 3,
  baseViews: 10_000,
  wonPerView: 10,           // 신뢰도 100%일 때 조회 1회당 광고비
  wonPerSub: 400,           // 구독자 1명당 하루 수익
  legendMoney: 1_800_000,   // '믿고 보는 채널' 엔딩 기준
};

// h: 헤드라인, t: 썸네일, a: 타겟 (각 0~2), fc: 팩트체크 여부
export const stimulus = (c) => c.h + c.t + c.a;

// 도파민 역치: 이 숫자만큼 🔥가 있어야 조회수가 제대로 나옴
export const threshold = (dopamine) => Math.min(5, Math.floor(dopamine / 20));

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r100 = (v) => Math.round(v / 100) * 100;

// 피해자가 생기는 조합인가 (특정 집단 저격 + 자극 / AI 합성)
export const hurtsSomeone = (c) => (c.a === 1 && (c.h >= 1 || c.t >= 1)) || c.t === 2;

// 이 기사 하나가 사회 신뢰도에 주는 영향 (학급 모드에서 모든 기기가 같은 값을 계산)
export function trustDelta(c) {
  let d = -(c.h * 2.5 + c.t * 3.5 + c.a * 2.5);
  if (stimulus(c) <= 1 && c.t === 0) d += 2;
  if (c.fc && c.h <= 1) d += 1;
  if (hurtsSomeone(c)) d -= 4;
  return d;
}

// 학급 신뢰도 = 시작값 + (모든 기사의 영향 합 ÷ 참가 인원)
export function classTrust(allChoices, playerCount) {
  let sum = 0;
  for (const uid in allChoices) {
    const days = allChoices[uid] || {};
    for (const day in days) {
      const c = days[day];
      if (c && validChoice(c)) sum += trustDelta(c);
    }
  }
  return clamp(CONFIG.startTrust + sum / Math.max(1, playerCount), 0, 100);
}

export function validChoice(c) {
  return [c.h, c.t, c.a].every((v) => v === 0 || v === 1 || v === 2);
}

export function newGame(shared = false) {
  return {
    v: 1,
    shared,                 // true면 신뢰도는 학급 공유값을 외부에서 받음
    day: 1,
    phase: 'edit',          // edit → result → morning → edit ... → ended
    money: CONFIG.startMoney,
    dopamine: CONFIG.startDopamine,
    trust: CONFIG.startTrust,
    warnings: 0,
    subs: 0,
    highStreak: 0,
    adCut: false,
    pending: null,
    lastResult: null,
    lastMorning: null,
    history: [],
    ending: null,
  };
}

// 기사 발행 → 즉시 보상(조회수·돈·도파민) 계산, 후폭풍은 pending에 저장
export function publish(state, scenario, choice, rand = Math.random) {
  if (state.ending) throw new Error('이미 끝난 게임');
  if (state.phase !== 'edit') throw new Error('편집 단계가 아님');
  if (!validChoice(choice)) throw new Error('잘못된 선택');
  const c = { h: choice.h, t: choice.t, a: choice.a, fc: !!choice.fc };
  const S = stimulus(c);
  const need = threshold(state.dopamine);
  const tolerance = S >= need ? 1 : Math.pow(0.6, need - S);
  const highStreak = S >= 4 ? state.highStreak + 1 : 0;
  const fatigue = Math.pow(0.78, Math.max(0, highStreak - 1));
  const fcBonus = c.fc && c.h <= 1 ? 1.4 : 1;
  const noise = 0.95 + rand() * 0.1;
  const views = Math.round(CONFIG.baseViews * scenario.heat * (1 + 0.9 * S) * tolerance * fatigue * fcBonus * noise);

  const adRate = (state.trust / 100) * (state.adCut ? 0.6 : 1);
  const adRev = r100(views * CONFIG.wonPerView * adRate);
  const subRev = r100(state.subs * CONFIG.wonPerSub);
  const cost = CONFIG.serverCost + (c.fc ? CONFIG.factCheckCost : 0);
  const profit = adRev + subRev - cost;

  const prevNeed = need;
  state.money += profit;
  state.dopamine = clamp(state.dopamine + S * 3 - 5, 0, 100);
  state.highStreak = highStreak;

  // ── 다음 날 아침에 도착할 후폭풍 ──
  const events = [];
  let warn = 0;
  if (c.t === 2) { warn++; events.push({ type: 'warning', key: 'deepfake' }); }
  if (c.h === 2 && c.a === 1) { warn++; events.push({ type: 'warning', key: 'defame' }); }
  if (hurtsSomeone(c)) events.push({ type: 'victim' });
  const adCut = c.h === 2 || c.t === 2 || c.a === 2;
  if (adCut) events.push({ type: 'adcut' });

  let subsDelta = 0;
  if (c.h === 0 && c.t === 0) subsDelta = 50 + (c.fc ? 30 : 0);
  else if (c.h === 1 && c.t === 0) subsDelta = 30 + (c.fc ? 20 : 0);
  let subsAfter = state.subs + subsDelta;
  if (c.h === 2 || c.t === 2) subsAfter = Math.floor(subsAfter * 0.7);
  if (c.a === 2) subsAfter = Math.floor(subsAfter * 0.85);
  subsDelta = subsAfter - state.subs;
  if (subsDelta !== 0) events.push({ type: subsDelta > 0 ? 'subsUp' : 'subsDown', n: Math.abs(subsDelta) });
  if (c.fc && c.h <= 1) events.push({ type: 'factcheck' });
  if (highStreak >= 2) events.push({ type: 'fatigue' });

  const tDelta = trustDelta(c);
  state.pending = { warn, adCut, subsDelta, trustDelta: tDelta, events };

  const newNeed = threshold(state.dopamine);
  const result = {
    day: state.day, choice: c, S, views, adRev, subRev, cost, profit, money: state.money,
    need: prevNeed, tolerance: tolerance < 1, fatigue: fatigue < 1, fcBonus: fcBonus > 1,
    newNeed, needUp: newNeed > prevNeed, needDown: newNeed < prevNeed,
  };
  state.history.push(result);
  state.lastResult = result;

  if (state.money <= 0) end(state, 'bankrupt');
  else if (state.dopamine >= 100) end(state, 'overdose');
  else state.phase = 'result';
  return result;
}

// 다음 날 아침: 후폭풍 정산 (sharedTrust를 주면 학급 공유 신뢰도를 사용)
export function morning(state, sharedTrust) {
  if (state.ending) return state.lastMorning;
  if (state.phase !== 'result') throw new Error('결과 단계가 아님');
  const p = state.pending || { warn: 0, adCut: false, subsDelta: 0, trustDelta: 0, events: [] };
  const trustBefore = state.trust;
  if (state.shared) state.trust = clamp(sharedTrust ?? state.trust, 0, 100);
  else state.trust = clamp(state.trust + p.trustDelta, 0, 100);
  state.warnings += p.warn;
  state.subs = Math.max(0, state.subs + p.subsDelta);
  state.adCut = p.adCut;
  state.pending = null;
  state.day += 1;

  const m = {
    day: state.day,
    events: p.events,
    trustBefore,
    trustAfter: state.trust,
    myTrustDelta: p.trustDelta,
  };
  state.lastMorning = m;

  if (state.warnings >= CONFIG.maxWarnings) end(state, 'police');
  else if (state.trust <= 0) end(state, 'collapse');
  else if (state.day > CONFIG.totalDays) end(state, state.money >= CONFIG.legendMoney && state.warnings === 0 ? 'legend' : 'survive');
  else state.phase = 'morning';
  return m;
}

export function startDay(state) {
  if (state.phase === 'morning') state.phase = 'edit';
}

// 학급 신뢰도가 0이 되면 진행 중인 모든 플레이어 종료
export function forceCollapse(state) {
  if (!state.ending) { state.trust = 0; end(state, 'collapse'); }
}

// 선생님이 판을 끝냈을 때: 지금까지 번 돈으로 순위 결정
export function forceTimeUp(state) {
  if (!state.ending) end(state, 'timeup');
}

function end(state, key) {
  state.ending = key;
  state.phase = 'ended';
  state.persona = persona(state);
}

export const ENDINGS = {
  legend:   { emoji: '🏆', name: '믿고 보는 채널', good: true,  desc: '10일 생존 + 180만 원 + 경고 0장. 자극 없이도 사람들이 찾아오는 채널이 됐다.' },
  survive:  { emoji: '😮‍💨', name: '아슬아슬 생존', good: true,  desc: '10일은 버텼다. 근데 통장이 좀… 다음엔 구독자를 더 모아 보자.' },
  bankrupt: { emoji: '💸', name: '파산',          good: false, desc: '서버비를 못 냈다. 자극만 쫓다 보니 광고주도 구독자도 떠났다.' },
  overdose: { emoji: '🧠', name: '도파민 폭발',    good: false, desc: '사람들이 더 센 자극만 찾다 지쳐 버렸다. 플랫폼 영구 폐쇄.' },
  collapse: { emoji: '🌐', name: '신뢰 붕괴',      good: false, desc: '아무도 뉴스를 믿지 않는 세상. 진짜 소식도 묻혀 버렸다.' },
  police:   { emoji: '🚓', name: '경찰서 엔딩',    good: false, desc: '합성 사진·명예훼손 신고 3건. 편집장님, 경찰서로 와 주세요.' },
  timeup:   { emoji: '⏰', name: '시간 종료',      good: true,  desc: '선생님이 판을 끝냈다! 여기까지 번 돈으로 순위가 정해진다.' },
};

export const PERSONAS = {
  checker:  { emoji: '🕵️', name: '청렴한 팩트체커', desc: '자극 대신 사실로 승부했다.' },
  balancer: { emoji: '🤹', name: '줄타기 장인',     desc: '흥미와 사실 사이를 잘 걸었다.' },
  shaky:    { emoji: '🫨', name: '흔들리는 편집장', desc: '좋은 날도, 위험한 날도 있었다.' },
  wrecker:  { emoji: '🚛', name: '도파민 렉카',     desc: '조회수를 위해서라면 뭐든 했다.' },
};

// 선 넘는 선택: 극단 선동 / AI 합성 / 분노 타겟팅 / 피해자 발생
export const isRisky = (c) => c.h === 2 || c.t === 2 || c.a === 2 || hurtsSomeone(c);

export function persona(state) {
  const h = state.history;
  if (!h.length) return 'shaky';
  const avg = h.reduce((s, r) => s + r.S, 0) / h.length;
  const risky = h.filter((r) => isRisky(r.choice)).length;
  if (avg >= 3.5 || risky >= Math.ceil(h.length / 2)) return 'wrecker';
  if (avg <= 1 && risky === 0) return 'checker';
  if (avg <= 2 && risky <= 1) return 'balancer';
  return 'shaky';
}

// 결과 리포트용 통계
export function summary(state) {
  const h = state.history;
  return {
    days: h.length,
    totalViews: h.reduce((s, r) => s + r.views, 0),
    deepfakes: h.filter((r) => r.choice.t === 2).length,
    victims: h.filter((r) => hurtsSomeone(r.choice)).length,
    factChecks: h.filter((r) => r.choice.fc).length,
    bestDay: h.reduce((b, r) => (!b || r.profit > b.profit ? r : b), null),
  };
}
