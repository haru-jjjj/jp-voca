# 日本語 단어장 (개인용)

Notion에 정리해둔 일본어 단어를 붙여넣으면 Claude API가 읽는법·뜻·예문을 자동으로 채워서
단어장으로 정리해주고, Anki 스타일 간격 반복(SRS)으로 복습할 수 있는 개인용 웹 앱입니다.

- 프론트엔드: React + Vite
- 데이터 저장: Firebase (Authentication + Firestore)
- 단어 자동 생성: Claude API (Vercel Serverless Function을 통해 서버에서만 호출)
- 배포: GitHub + Vercel

---

## 1. Firebase 콘솔에서 해야 할 일

이미 Firebase 프로젝트(`study-65680`)를 만들어 설정 값을 주셨고, 코드(`src/firebase.js`)에 반영해두었습니다.
**Firebase 콘솔(console.firebase.google.com)에서 아래 2가지만 켜주시면 됩니다.**

### 1) Authentication 활성화
1. 왼쪽 메뉴 **Authentication** → **시작하기(Get started)**
2. 로그인 방법(Sign-in method) 탭에서 **이메일/비밀번호(Email/Password)** 를 사용 설정
3. (선택) **Users** 탭에서 본인이 쓸 이메일/비밀번호로 직접 사용자를 하나 추가해도 되고,
   앱 첫 화면에서 "계정 만들기"로 가입해도 됩니다.

### 2) Firestore Database 만들기
1. 왼쪽 메뉴 **Firestore Database** → **데이터베이스 만들기**
2. 위치(리전)는 **asia-northeast3 (서울)** 추천
3. 보안 규칙은 일단 "테스트 모드"로 시작해도 되지만, **아래 규칙으로 반드시 교체**하세요.
   (프로젝트에 포함된 `firestore.rules` 파일 내용과 동일합니다)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

콘솔의 **Firestore Database → 규칙(Rules)** 탭에 위 내용을 붙여넣고 **게시(Publish)** 하면 됩니다.
이 규칙은 "로그인한 본인의 데이터만 본인이 읽고 쓸 수 있다"는 뜻이라, 다른 사람이 URL을 알아도
본인 계정으로 로그인하지 않으면 데이터를 볼 수 없습니다.

---

## 2. Claude API 키 발급

1. https://console.anthropic.com 에서 로그인 후 **API Keys** 메뉴에서 키 발급 (`sk-ant-...`)
2. 이 키는 절대 프론트엔드 코드나 GitHub에 커밋하지 마세요. **Vercel 환경변수로만 등록**합니다(3단계에서 진행).
3. 비용이 걱정되시면 `api/generate.js` 상단의 `MODEL` 값이 기본적으로
   저렴한 `claude-3-5-haiku-latest` 모델로 설정되어 있습니다. 결과 품질을 더 높이고 싶다면
   Vercel 환경변수에 `CLAUDE_MODEL=claude-sonnet-4-5` 등으로 override 하면 됩니다.

---

## 3. GitHub 업로드 + Vercel 배포

이전에 하셨던 방식과 동일합니다.

1. GitHub에서 새 저장소 생성 (예: `jp-vocab-app`), Private 권장
2. 이 zip 파일 압축을 풀어서 저장소에 웹 업로드(드래그 앤 드롭)
   - `node_modules` 폴더는 없으니 그대로 전체 파일/폴더를 올리면 됩니다.
3. https://vercel.com 에서 **Add New → Project** → 방금 만든 GitHub 저장소 선택 → Import
   - Framework Preset: **Vite**로 자동 인식됩니다.
4. **배포 전에 반드시** Vercel 프로젝트의 **Settings → Environment Variables** 에서 아래 추가:
   - `ANTHROPIC_API_KEY` = 2단계에서 발급받은 키
   - (선택) `CLAUDE_MODEL` = 다른 모델을 쓰고 싶을 때만
5. **Deploy** 클릭 → 완료 후 나오는 URL(`https://jp-vocab-app-xxxx.vercel.app`)로 접속
6. 접속 후 "계정 만들기"로 본인 이메일/비밀번호 가입 → 바로 사용 시작

이후 코드를 수정하고 싶으면 GitHub 저장소 파일을 웹에서 수정(또는 다시 업로드)하면
Vercel이 자동으로 재배포합니다.

### 아이폰 홈 화면에 추가하기
Safari로 배포된 URL에 접속 → 공유 버튼 → "홈 화면에 추가"를 누르면 앱처럼 아이콘이 생깁니다.

---

## 4. 로컬에서 미리 확인하고 싶다면 (선택)

로컬 PC에 Node.js가 설치되어 있다면:

```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY 값 채우기
npm run dev
```

단, `/api/generate` 서버리스 함수는 `vercel dev`로 실행해야 로컬에서도 동작합니다
(`npm i -g vercel` 후 `vercel dev`). 그냥 `npm run dev`로는 프론트엔드 화면만 보이고
"단어장 업데이트" 버튼은 배포 후에 정상 작동합니다.

---

## 5. 기능 요약

- **단어 입력**: 단어 하나 또는 Notion에서 복사한 텍스트 뭉치를 붙여넣고 "단어장 업데이트" 클릭
  → Claude가 단어/읽는법/뜻/예문/예문 읽는법/예문 뜻을 채워서 미리보기로 보여줌
  → 이미 있는 단어는 자동으로 "기존 단어 업데이트"로 표시됨 (덮어쓸지 개별 선택 가능)
- **단어장**: 등록된 모든 단어 목록, 검색, 발음 듣기(브라우저 TTS), 삭제
- **복습**: Anki 스타일 SRS(간격 반복) — 카드를 탭해서 뒤집고 "다시/어려움/보통/쉬움"으로 평가하면
  다음 복습 시점이 자동 계산됨. 연속 학습일(스트릭), 오늘 복습 개수 표시.
  자주 틀리는 단어는 "헷갈리는 단어" 섹션에 따로 모아서 보여줌.
- 반응형 레이아웃으로 폰/태블릿/PC 화면 모두 대응.

## 6. 참고 문서 (출처)

- Firebase Authentication: https://firebase.google.com/docs/auth
- Firebase Firestore 보안 규칙: https://firebase.google.com/docs/firestore/security/get-started
- Anthropic Messages API: https://docs.claude.com/en/api/messages
- Vercel Serverless Functions: https://vercel.com/docs/functions
- Vite 공식 문서: https://vitejs.dev
