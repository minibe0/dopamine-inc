// 자동 닉네임: 직접 입력을 막아 실명·욕설 닉네임을 원천 차단
const ADJ = ['네온', '형광', '졸린', '배고픈', '킹받는', '갓생', '바삭한', '말랑한', '반짝', '엉뚱한', '시크한', '용감한', '느긋한', '수상한', '깜찍한', '전설의'];
const ANIMAL = ['너구리', '펭귄', '카피바라', '수달', '햄스터', '고양이', '강아지', '오리', '판다', '알파카', '레서판다', '다람쥐', '미어캣', '해달', '부엉이', '코알라'];
const EMOJI = { 너구리: '🦝', 펭귄: '🐧', 카피바라: '🦫', 수달: '🦦', 햄스터: '🐹', 고양이: '🐱', 강아지: '🐶', 오리: '🦆', 판다: '🐼', 알파카: '🦙', 레서판다: '🐾', 다람쥐: '🐿️', 미어캣: '🐾', 해달: '🦦', 부엉이: '🦉', 코알라: '🐨' };

const rnd = (a) => a[Math.floor(Math.random() * a.length)];

export function makeNick() {
  const animal = rnd(ANIMAL);
  const no = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  return { nick: `${rnd(ADJ)} ${animal} ${no}`, avatar: EMOJI[animal] || '🐾' };
}
