// 연결 방식 자동 선택: firebase-config.js가 채워져 있으면 Firebase, 아니면 로컬 모의 서버
// 강제로 로컬 모드: 주소 끝에 ?net=local
import { FIREBASE_CONFIG } from '../firebase-config.js';

let netPromise = null;

export function firebaseReady() {
  const c = FIREBASE_CONFIG || {};
  return !!(c.apiKey && c.databaseURL && !String(c.apiKey).startsWith('여기에'));
}

export function getNet() {
  if (netPromise) return netPromise;
  const forceLocal = new URLSearchParams(location.search).get('net') === 'local';
  netPromise = (async () => {
    if (!forceLocal && firebaseReady()) {
      try {
        const m = await import('./firebase.js');
        return await m.createNet(FIREBASE_CONFIG);
      } catch (e) {
        console.error('[net] Firebase 연결 실패', e);
        netPromise = null;
        throw new Error('서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.');
      }
    }
    const m = await import('./local.js');
    return m.createNet();
  })();
  return netPromise;
}
