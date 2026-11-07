# 도파민 주식회사 (DOPAMINE INC.)

조회수를 좇을수록 무너지는 미디어 회사를 직접 운영해 보는 **중학생 미디어 리터러시 학급 게임**입니다.
훈계 대신, 자극적인 선택의 대가를 **숫자와 반 전체 데이터**로 체감합니다.

| 화면 | 주소 | 용도 |
|---|---|---|
| 게임(학생) | `/` (index.html) | 혼자 연습 · 학급 PIN 입장 |
| 교사용 대시보드 | `/host.html` | 방 만들기 · 시작/종료 · 실시간 리더보드 · 토론 통계 |
| 소개·이용안내 | `/about.html` | 발표 겸용 안내 페이지 (3구간) |

---

## 1. GitHub Pages로 올리기
1. 이 폴더의 파일을 저장소 맨 위(root)에 그대로 올립니다.
2. 저장소 **Settings → Pages → Branch: `main` / `(root)` → Save**
3. 1~2분 뒤 `https://계정.github.io/저장소이름/` 에서 열립니다.

> Firebase를 아직 설정하지 않았다면 **로컬 체험 모드**로 동작합니다. 혼자 하기는 그대로 되고, 학급 모드는 *같은 브라우저의 탭끼리만* 연결됩니다(시연용).

## 2. Firebase 설정 (학급 모드, 약 10분)
1. https://console.firebase.google.com → **프로젝트 추가** (Google 애널리틱스는 꺼도 됨)
2. **Authentication → 시작하기 → 로그인 방법 → 익명 → 사용 설정**
3. **Realtime Database → 데이터베이스 만들기** → 위치 `asia-southeast1 (싱가포르)` → **잠금 모드**
4. Realtime Database의 **규칙** 탭 → `firebase/database.rules.json` 내용을 통째로 붙여넣고 **게시**
5. **프로젝트 설정(⚙️) → 내 앱 → 웹(</>) 앱 추가** → 화면에 나온 `firebaseConfig` 값을 `js/firebase-config.js`에 붙여넣기
   - `databaseURL`이 비어 있으면 Realtime Database 화면 위쪽의 주소(`https://…firebasedatabase.app`)를 넣으세요.
6. **Authentication → 설정 → 승인된 도메인**에 `계정.github.io` 추가
7. 저장소에 `js/firebase-config.js` 수정본을 올리면 끝.

> `apiKey` 등은 공개돼도 괜찮습니다. 데이터 보호는 4번의 보안 규칙이 합니다.

**무료(Spark) 요금제 한도:** 동시 접속 100개. 한 반(30명 내외) 수업은 충분하지만, 여러 반이 *동시에* 하면 한도를 넘을 수 있습니다.

## 3. 수업 진행 (45분)
| 시간 | 선생님 | 학생 |
|---|---|---|
| 도입 5분 | `host.html` → **새 방 만들기** → PIN을 프로젝터에 띄움. “돈을 가장 많이 버는 사람이 이깁니다”만 안내 | 게임 주소 접속 → PIN 입력 |
| 플레이 20분 | **▶ 게임 시작** → 리더보드·학급 신뢰도·🚨알림 관찰 → 필요하면 **⏹ 판 끝내기** → **🔁 새 판** | 1회차 → 2회차 |
| 토론 20분 | **📊 토론 화면**: 우리 반 한 줄 통계, 일차별 선택 비율, 엔딩 분포, 토론 질문 | 내 엔딩·유형 돌아보기 |

## 4. 안전 설계
- 가상 학교(픽셀중학교)·이름 대신 역할로 표현, 합성은 '표정 합성' 수준(성적 요소 없음)
- 닉네임 **자동 생성** (실명·욕설 입력 불가), 자유 글쓰기 칸 없음
- 익명 로그인, 개인정보 수집 없음. 다른 학생 알림은 **익명**
- 개인 성향(예: 도파민 렉카)은 **본인 화면에만**, 교사 화면엔 반 전체 통계만
- 학생 기기는 *자기 선택만* 기록(한 번 쓰면 수정 불가). 학급 신뢰도는 모든 기기가 같은 공식으로 계산

## 5. 내용 바꾸기
- 사건·헤드라인·댓글: `data/scenarios.json` (10일치)
- 밸런스 숫자: `js/engine.js`의 `CONFIG`
- 바꾼 뒤 밸런스 확인: `node tools/simulate.mjs` (13가지 전략을 10일 끝까지 시뮬레이션)

## 6. 내 컴퓨터에서 테스트
```bash
python3 -m http.server 8000
# 게임:  http://localhost:8000/?net=local
# 교사:  http://localhost:8000/host.html?net=local   (같은 브라우저 다른 탭에서 학생 입장)
```
(파일을 더블클릭해서 열면 동작하지 않습니다. 반드시 웹 주소로 여세요.)

## 파일 구조
```
index.html  host.html  about.html
css/  style.css  host.css  about.css
js/   app.js(학생) host.js(교사) engine.js(규칙) class.js(리더보드·통계)
      sound.js(효과음 합성) room.js(방) nick.js(닉네임) util.js firebase-config.js
      net/ firebase.js  local.js(로컬 체험 서버)  index.js
data/ scenarios.json
firebase/ database.rules.json
tools/ simulate.mjs  e2e_solo.py  e2e_class.py
```
