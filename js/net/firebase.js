// Firebase Realtime Database 연결 (익명 로그인)
// SDK 버전을 바꾸려면 아래 숫자만 수정
const SDK = 'https://www.gstatic.com/firebasejs/13.1.0';

export async function createNet(config) {
  const [{ initializeApp }, A, D] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-database.js`),
  ]);
  const app = initializeApp(config);
  const auth = A.getAuth(app);
  const cred = await A.signInAnonymously(auth);
  const db = D.getDatabase(app);
  const r = (p) => D.ref(db, p);

  return {
    kind: 'firebase',
    uid: cred.user.uid,
    get: async (p) => (await D.get(r(p))).val(),
    set: (p, v) => D.set(r(p), v),
    update: (p, patch) => D.update(r(p), patch),
    remove: (p) => D.remove(r(p)),
    on(p, cb) {
      return D.onValue(r(p), (snap) => cb(snap.val()), (err) => console.warn('[firebase] 읽기 실패', p, err && err.code));
    },
    async createIfAbsent(p, v, canReplace) {
      const res = await D.runTransaction(r(p), (cur) => (cur == null || (canReplace && canReplace(cur)) ? v : undefined));
      return res.committed;
    },
    // 보안 규칙이 '한 번만 쓰기'를 강제하므로 이미 있으면 조용히 실패
    writeOnce: (p, v) => D.set(r(p), v).catch(() => {}),
  };
}
