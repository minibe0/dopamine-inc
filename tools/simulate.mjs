// 밸런스 검증: node tools/simulate.mjs [scenarios.json 경로]
import { readFileSync } from 'node:fs';
import { newGame, publish, morning, startDay, CONFIG, classTrust, trustDelta } from '../js/engine.js';

const path = process.argv[2] || new URL('../data/scenarios.json', import.meta.url);
let heats;
try { heats = JSON.parse(readFileSync(path, 'utf8')).rounds.map((r) => r.heat); }
catch { heats = [1.0, 0.9, 1.2, 1.0, 0.8, 1.1, 0.9, 1.0, 1.2, 1.3]; }

function seeded(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }

const fixed = (h, t, a, fc = false) => () => ({ h, t, a, fc });
const strategies = {
  '극단 올인 (2,2,2)':            fixed(2, 2, 2),
  '합성 빼고 극단 (2,1,2)':        fixed(2, 1, 2),
  '분노 타겟팅만 (0,0,2)':         fixed(0, 0, 2),
  '선동 헤드라인만 (2,0,0)':       fixed(2, 0, 0),
  '적당히 자극 (1,1,1)':           fixed(1, 1, 1),
  '의문형+과장 (1,1,0)':           fixed(1, 1, 0),
  '의문형 (1,0,0)':                fixed(1, 0, 0),
  '의문형+팩트체크 (1,0,0)+🔍':    fixed(1, 0, 0, true),
  '사실만 (0,0,0)':                fixed(0, 0, 0),
  '사실+팩트체크 (0,0,0)+🔍':      fixed(0, 0, 0, true),
  '초반 극단→후반 착하게':          (d) => (d <= 3 ? { h: 2, t: 1, a: 2 } : { h: 1, t: 0, a: 0, fc: true }),
  '한 번만 합성 (3일차)':           (d) => (d === 3 ? { h: 1, t: 2, a: 0 } : { h: 1, t: 0, a: 0, fc: true }),
  '무작위':                         (d, r) => ({ h: Math.floor(r() * 3), t: Math.floor(r() * 3), a: Math.floor(r() * 3), fc: r() < 0.3 }),
};

function play(strat, seed) {
  const r = seeded(seed);
  const s = newGame(false);
  const money = [];
  while (!s.ending) {
    const sc = { heat: heats[s.day - 1] };
    publish(s, sc, strat(s.day, r), r);
    money.push(Math.round(s.money / 10000));
    if (s.ending) break;
    morning(s);
    startDay(s);
  }
  return { s, money };
}

console.log('전략'.padEnd(26), '결과'.padEnd(10), '마지막날', '최종(만원)', '  일별 잔고(만원)');
for (const [name, strat] of Object.entries(strategies)) {
  const runs = name === '무작위' ? 200 : 1;
  if (runs > 1) {
    const tally = {};
    let sum = 0;
    for (let i = 1; i <= runs; i++) { const { s } = play(strat, i * 7919); tally[s.ending] = (tally[s.ending] || 0) + 1; sum += s.money; }
    console.log(name.padEnd(26), JSON.stringify(tally));
    continue;
  }
  const { s, money } = play(strat, 42);
  console.log(name.padEnd(26), s.ending.padEnd(10), String(s.history.length).padStart(4), String(Math.round(s.money / 10000)).padStart(10), ' ', money.join(' '), ' 신뢰', Math.round(s.trust), '경고', s.warnings, '구독', s.subs, s.persona);
}

// 학급 공유 신뢰도: 30명 중 극단 플레이어 비율에 따른 붕괴 시점
console.log('\n[학급 모드] 30명 중 극단(2,1,2) 비율 → 신뢰도 0 도달일');
for (const ratio of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
  const n = 30, bad = Math.round(n * ratio);
  const all = {};
  let dayHit = '-';
  for (let d = 1; d <= CONFIG.totalDays; d++) {
    for (let i = 0; i < n; i++) {
      all[i] = all[i] || {};
      all[i][d] = i < bad ? { h: 2, t: 1, a: 2 } : { h: 1, t: 0, a: 0, fc: true };
    }
    if (classTrust(all, n) <= 0 && dayHit === '-') dayHit = d;
  }
  console.log(`  ${Math.round(ratio * 100)}% → ${dayHit}일차 (10일 후 신뢰도 ${classTrust(all, n).toFixed(1)})`);
}
console.log('\ntrustDelta 예시: 사실+🔍', trustDelta({ h: 0, t: 0, a: 0, fc: true }), '/ 극단', trustDelta({ h: 2, t: 2, a: 2 }), '/ (2,1,2)', trustDelta({ h: 2, t: 1, a: 2 }));
