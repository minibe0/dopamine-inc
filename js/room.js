// 학급 방 데이터 경로와 방 만들기/찾기
//  rooms/{PIN}/meta                         { hostUid, createdAt, session, status }
//  rooms/{PIN}/s/{session}/players/{uid}    { nick, avatar, money, day, status, ending, persona, joinedAt, updatedAt }
//  rooms/{PIN}/s/{session}/choices/{uid}/{day} { h, t, a, fc, money }   ← 한 번 쓰면 수정 불가

export const ROOM_TTL = 24 * 60 * 60 * 1000;

export const metaPath = (pin) => `rooms/${pin}/meta`;
export const roomPath = (pin) => `rooms/${pin}`;
export const playersPath = (pin, s) => `rooms/${pin}/s/${s}/players`;
export const playerPath = (pin, s, uid) => `rooms/${pin}/s/${s}/players/${uid}`;
export const choicesPath = (pin, s) => `rooms/${pin}/s/${s}/choices`;
export const choicePath = (pin, s, uid, day) => `rooms/${pin}/s/${s}/choices/${uid}/${day}`;

export const newSessionKey = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

const expired = (m) => !m || typeof m.createdAt !== 'number' || Date.now() - m.createdAt > ROOM_TTL;

export async function findRoom(net, pin) {
  if (!/^\d{4}$/.test(pin)) return null;
  const m = await net.get(metaPath(pin));
  return expired(m) ? null : m;
}

export async function createRoom(net) {
  for (let i = 0; i < 25; i++) {
    const pin = String(1000 + Math.floor(Math.random() * 9000));
    const meta = { hostUid: net.uid, createdAt: Date.now(), session: newSessionKey(), status: 'lobby' };
    const ok = await net.createIfAbsent(metaPath(pin), meta, expired);
    if (ok) return { pin, meta };
  }
  throw new Error('빈 방 번호를 찾지 못했어요. 다시 시도해 주세요.');
}
